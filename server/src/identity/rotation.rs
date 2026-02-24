use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{Duration, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::middleware::Claims;
use crate::state::AppState;

// --- Request/Response types ---

#[derive(Debug, Serialize, Deserialize)]
pub struct RotateKeyRequest {
    /// Hex-encoded previous (old) Ed25519 public key (32 bytes)
    pub prev_key: String,
    /// Hex-encoded new Ed25519 public key (32 bytes)
    pub new_key: String,
    /// Reason for rotation: "compromise", "scheduled", "device_loss"
    pub reason: String,
    /// Hex-encoded signature of the rotation payload by the old key
    pub signature_old: String,
    /// Hex-encoded signature of the rotation payload by the new key
    pub signature_new: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RotateKeyResponse {
    pub accepted: bool,
    /// ISO 8601 deadline for cancellation (72 hours from now)
    pub cancellation_deadline: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CancelRotationRequest {
    /// Hex-encoded signature by the OLD key proving the real owner is cancelling.
    /// The signed payload is: "cancel_rotation:{fingerprint}"
    pub signature_old_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CancelRotationResponse {
    pub cancelled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RotationChainEntry {
    pub id: String,
    pub record_type: String,
    pub prev_key: Option<String>,
    pub new_key: String,
    pub reason: Option<String>,
    pub signature_old: Option<String>,
    pub signature_new: String,
    pub cancellation_deadline: Option<String>,
    pub cancelled: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RotationChainResponse {
    pub fingerprint: String,
    pub chain: Vec<RotationChainEntry>,
}

/// Build the payload that must be signed for a rotation.
/// Both old and new keys sign this same payload.
fn rotation_payload(prev_key: &[u8], new_key: &[u8], reason: &str) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(b"rotate:");
    payload.extend_from_slice(prev_key);
    payload.extend_from_slice(b":");
    payload.extend_from_slice(new_key);
    payload.extend_from_slice(b":");
    payload.extend_from_slice(reason.as_bytes());
    payload
}

/// Verify an Ed25519 signature over a payload.
fn verify_signature(
    public_key_bytes: &[u8],
    payload: &[u8],
    signature_bytes: &[u8],
) -> Result<(), (StatusCode, String)> {
    let pk_array: [u8; 32] = public_key_bytes
        .try_into()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid public key length".to_string()))?;
    let verifying_key = VerifyingKey::from_bytes(&pk_array)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Ed25519 public key".to_string()))?;

    let sig_array: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid signature length".to_string()))?;
    let signature = Signature::from_bytes(&sig_array);

    verifying_key
        .verify(payload, &signature)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Signature verification failed".to_string()))?;

    Ok(())
}

// --- Handlers ---

/// POST /api/identity/rotate
/// Accept a key rotation record with dual signatures (old + new key).
/// Verify both signatures, update the user's active public_key,
/// set a 72-hour cancellation deadline, and invalidate all refresh tokens.
pub async fn rotate_key(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<RotateKeyRequest>,
) -> Result<Json<RotateKeyResponse>, (StatusCode, String)> {
    // Validate reason
    match req.reason.as_str() {
        "compromise" | "scheduled" | "device_loss" => {}
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "Invalid reason. Must be: compromise, scheduled, or device_loss".to_string(),
            ));
        }
    }

    // Decode keys and signatures from hex
    let prev_key_bytes = hex::decode(&req.prev_key)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid prev_key hex".to_string()))?;
    let new_key_bytes = hex::decode(&req.new_key)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid new_key hex".to_string()))?;
    let sig_old_bytes = hex::decode(&req.signature_old)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid signature_old hex".to_string()))?;
    let sig_new_bytes = hex::decode(&req.signature_new)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid signature_new hex".to_string()))?;

    // Validate the new key is a valid Ed25519 key
    let new_key_array: [u8; 32] = new_key_bytes
        .clone()
        .try_into()
        .map_err(|_| (StatusCode::BAD_REQUEST, "new_key must be 32 bytes".to_string()))?;
    VerifyingKey::from_bytes(&new_key_array)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid new Ed25519 key".to_string()))?;

    // Build and verify signatures over the rotation payload
    let payload = rotation_payload(&prev_key_bytes, &new_key_bytes, &req.reason);
    verify_signature(&prev_key_bytes, &payload, &sig_old_bytes)?;
    verify_signature(&new_key_bytes, &payload, &sig_new_bytes)?;

    let db = state.db.clone();
    let fingerprint = claims.fingerprint.clone();
    let user_id = claims.sub.clone();
    let now = Utc::now();
    let cancellation_deadline = now + Duration::hours(72);
    let deadline_str = cancellation_deadline.to_rfc3339();
    let now_str = now.to_rfc3339();
    let reason = req.reason.clone();

    let prev_key_for_db = prev_key_bytes.clone();
    let new_key_for_db = new_key_bytes.clone();
    let sig_old_for_db = sig_old_bytes.clone();
    let sig_new_for_db = sig_new_bytes.clone();
    let deadline_for_db = deadline_str.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB lock: {}", e)))?;

        // Verify the prev_key matches the user's current public key
        let current_key: Vec<u8> = conn
            .query_row(
                "SELECT public_key FROM users WHERE id = ?1",
                [&user_id],
                |row| row.get(0),
            )
            .map_err(|_| (StatusCode::NOT_FOUND, "User not found".to_string()))?;

        if current_key != prev_key_for_db {
            return Err((
                StatusCode::BAD_REQUEST,
                "prev_key does not match current public key".to_string(),
            ));
        }

        // Check for an existing active (non-cancelled) rotation within cancellation window
        let active_rotation: Option<String> = conn
            .query_row(
                "SELECT id FROM rotation_records WHERE fingerprint = ?1 AND record_type = 'rotation' AND cancelled = 0 AND cancellation_deadline > ?2",
                rusqlite::params![fingerprint, now_str],
                |row| row.get(0),
            )
            .ok();

        if active_rotation.is_some() {
            return Err((
                StatusCode::CONFLICT,
                "An active rotation is already pending. Wait for the cancellation window to expire or cancel it first.".to_string(),
            ));
        }

        // Insert rotation record
        let rotation_id = Uuid::now_v7().to_string();
        conn.execute(
            "INSERT INTO rotation_records (id, fingerprint, record_type, prev_key, new_key, reason, signature_old, signature_new, cancellation_deadline, created_at)
             VALUES (?1, ?2, 'rotation', ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                rotation_id,
                fingerprint,
                prev_key_for_db,
                new_key_for_db,
                reason,
                sig_old_for_db,
                sig_new_for_db,
                deadline_for_db,
                now_str,
            ],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Insert rotation: {}", e)))?;

        // Update the user's active public key to the new key
        conn.execute(
            "UPDATE users SET public_key = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![new_key_for_db, now_str, user_id],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Update key: {}", e)))?;

        // Invalidate all refresh tokens for this user (all sessions must re-auth)
        conn.execute(
            "DELETE FROM refresh_tokens WHERE user_id = ?1",
            [&user_id],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Delete tokens: {}", e)))?;

        Ok::<(), (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    Ok(Json(RotateKeyResponse {
        accepted: true,
        cancellation_deadline: deadline_str,
    }))
}

/// POST /api/identity/rotate/cancel
/// Cancel a pending rotation within the 72-hour window.
/// Must be signed by the OLD key (proving the real owner is cancelling).
/// The signed payload is "cancel_rotation:{fingerprint}".
pub async fn cancel_rotation(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<CancelRotationRequest>,
) -> Result<Json<CancelRotationResponse>, (StatusCode, String)> {
    let sig_bytes = hex::decode(&req.signature_old_key)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid signature hex".to_string()))?;

    let db = state.db.clone();
    let fingerprint = claims.fingerprint.clone();
    let user_id = claims.sub.clone();
    let now_str = Utc::now().to_rfc3339();

    tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB lock: {}", e)))?;

        // Find the most recent non-cancelled rotation within its cancellation window
        let rotation: Result<(String, Vec<u8>, Vec<u8>), _> = conn.query_row(
            "SELECT id, prev_key, new_key FROM rotation_records
             WHERE fingerprint = ?1 AND record_type = 'rotation' AND cancelled = 0
             AND cancellation_deadline > ?2
             ORDER BY created_at DESC LIMIT 1",
            rusqlite::params![fingerprint, now_str],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );

        let (rotation_id, prev_key, _new_key) = rotation.map_err(|_| {
            (
                StatusCode::NOT_FOUND,
                "No active rotation found within cancellation window".to_string(),
            )
        })?;

        // Verify the cancellation signature is from the old key
        let cancel_payload = format!("cancel_rotation:{}", fingerprint);
        verify_signature(&prev_key, cancel_payload.as_bytes(), &sig_bytes)?;

        // Mark the rotation as cancelled
        conn.execute(
            "UPDATE rotation_records SET cancelled = 1 WHERE id = ?1",
            [&rotation_id],
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Update rotation: {}", e),
            )
        })?;

        // Revert the user's public key to the old key
        conn.execute(
            "UPDATE users SET public_key = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![prev_key, now_str, user_id],
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Revert key: {}", e),
            )
        })?;

        // Invalidate all refresh tokens (user must re-auth after revert)
        conn.execute(
            "DELETE FROM refresh_tokens WHERE user_id = ?1",
            [&user_id],
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Delete tokens: {}", e),
            )
        })?;

        Ok::<(), (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    Ok(Json(CancelRotationResponse { cancelled: true }))
}

/// GET /api/identity/rotation-chain/{fingerprint}
/// Retrieve the full rotation chain for a fingerprint (genesis + all rotations).
/// Public endpoint — the chain is needed for cross-server identity verification.
pub async fn get_rotation_chain(
    State(state): State<AppState>,
    Path(fingerprint): Path<String>,
) -> Result<Json<RotationChainResponse>, StatusCode> {
    let db = state.db.clone();

    let chain = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let mut stmt = conn
            .prepare(
                "SELECT id, record_type, prev_key, new_key, reason, signature_old,
                        signature_new, cancellation_deadline, cancelled, created_at
                 FROM rotation_records
                 WHERE fingerprint = ?1
                 ORDER BY created_at ASC",
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let entries: Vec<RotationChainEntry> = stmt
            .query_map([&fingerprint], |row| {
                Ok(RotationChainEntry {
                    id: row.get(0)?,
                    record_type: row.get(1)?,
                    prev_key: row
                        .get::<_, Option<Vec<u8>>>(2)?
                        .map(|b| hex::encode(b)),
                    new_key: hex::encode(row.get::<_, Vec<u8>>(3)?),
                    reason: row.get(4)?,
                    signature_old: row
                        .get::<_, Option<Vec<u8>>>(5)?
                        .map(|b| hex::encode(b)),
                    signature_new: hex::encode(row.get::<_, Vec<u8>>(6)?),
                    cancellation_deadline: row.get(7)?,
                    cancelled: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        if entries.is_empty() {
            return Err(StatusCode::NOT_FOUND);
        }

        Ok(RotationChainResponse {
            fingerprint,
            chain: entries,
        })
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(chain))
}
