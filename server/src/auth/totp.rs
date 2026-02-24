use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use axum::{extract::State, http::StatusCode, Json};
use rand::Rng;
use serde::{Deserialize, Serialize};
use totp_rs::{Algorithm, Secret, TOTP};

use crate::auth::middleware::Claims;
use crate::state::AppState;

// --- Request/Response types ---

#[derive(Debug, Serialize, Deserialize)]
pub struct TotpEnrollResponse {
    /// Base32-encoded TOTP secret for manual entry
    pub secret: String,
    /// otpauth:// URI for authenticator apps
    pub otpauth_uri: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TotpVerifyRequest {
    /// 6-digit TOTP code from authenticator app
    pub code: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TotpVerifyResponse {
    pub valid: bool,
}

// --- Encryption helpers ---

/// Encrypt a TOTP secret with the server's AES-256-GCM encryption key.
/// Returns (nonce || ciphertext) concatenated.
fn encrypt_totp_secret(
    encryption_key: &[u8],
    secret_bytes: &[u8],
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let cipher = Aes256Gcm::new_from_slice(encryption_key)
        .map_err(|e| format!("Invalid encryption key: {}", e))?;
    let nonce_bytes: [u8; 12] = rand::rng().random();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, secret_bytes)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Concatenate nonce || ciphertext for storage
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Decrypt a TOTP secret from (nonce || ciphertext) format.
fn decrypt_totp_secret(
    encryption_key: &[u8],
    encrypted: &[u8],
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    if encrypted.len() < 12 {
        return Err("Encrypted data too short".into());
    }
    let cipher = Aes256Gcm::new_from_slice(encryption_key)
        .map_err(|e| format!("Invalid encryption key: {}", e))?;
    let nonce = Nonce::from_slice(&encrypted[..12]);
    let ciphertext = &encrypted[12..];
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;
    Ok(plaintext)
}

/// Build a TOTP instance from a raw secret (bytes).
/// Uses standard RFC 6238 params: SHA1, 6 digits, 30-second period.
fn build_totp(
    secret_bytes: &[u8],
    account_name: &str,
) -> Result<TOTP, Box<dyn std::error::Error + Send + Sync>> {
    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1, // 1 step skew (allows codes from prev/next period)
        30,
        secret_bytes.to_vec(),
        Some("UNITED".to_string()),
        account_name.to_string(),
    )
    .map_err(|e| format!("TOTP creation failed: {}", e))?;
    Ok(totp)
}

// --- Handlers ---

/// POST /api/auth/totp/enroll
/// Generate a TOTP secret for the authenticated user.
/// Returns the secret and otpauth URI for authenticator apps.
/// The secret is encrypted with the server key and stored in the DB.
/// Calling this endpoint does NOT yet mark TOTP as enrolled —
/// the user must verify a code first via /api/auth/totp/confirm.
pub async fn totp_enroll(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<TotpEnrollResponse>, (StatusCode, String)> {
    let db = state.db.clone();
    let encryption_key = state.encryption_key.clone();
    let fingerprint = claims.fingerprint.clone();

    // Generate a random 20-byte (160-bit) secret — standard for TOTP
    let secret_bytes: [u8; 20] = rand::rng().random();

    // Build TOTP for URI generation
    let totp = build_totp(&secret_bytes, &fingerprint)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let secret_base32 = Secret::Raw(secret_bytes.to_vec()).to_encoded().to_string();
    let otpauth_uri = totp.get_url();

    // Encrypt the secret for DB storage
    let encrypted = encrypt_totp_secret(&encryption_key, &secret_bytes)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Store encrypted secret in the users table (not yet enrolled — pending confirmation)
    let user_id = claims.sub.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB lock: {}", e)))?;
        conn.execute(
            "UPDATE users SET totp_secret_encrypted = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![encrypted, chrono::Utc::now().to_rfc3339(), user_id],
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("DB update: {}", e),
            )
        })?;
        Ok::<(), (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    Ok(Json(TotpEnrollResponse {
        secret: secret_base32,
        otpauth_uri,
    }))
}

/// POST /api/auth/totp/confirm
/// Verify a TOTP code to confirm enrollment. This marks the user as TOTP-enrolled.
/// Must be called after /enroll with a valid code from the authenticator app.
pub async fn totp_confirm(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<TotpVerifyRequest>,
) -> Result<Json<TotpVerifyResponse>, (StatusCode, String)> {
    let db = state.db.clone();
    let encryption_key = state.encryption_key.clone();
    let user_id = claims.sub.clone();
    let fingerprint = claims.fingerprint.clone();

    // Look up the encrypted TOTP secret
    let db2 = db.clone();
    let uid = user_id.clone();
    let encrypted_secret = tokio::task::spawn_blocking(move || {
        let conn = db2
            .lock()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB lock: {}", e)))?;
        let result: Result<Option<Vec<u8>>, _> = conn.query_row(
            "SELECT totp_secret_encrypted FROM users WHERE id = ?1",
            [&uid],
            |row| row.get(0),
        ).map_err(|e| (StatusCode::NOT_FOUND, format!("User not found: {}", e)));
        result
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    let encrypted = encrypted_secret.ok_or((
        StatusCode::BAD_REQUEST,
        "No TOTP secret found. Call /api/auth/totp/enroll first.".to_string(),
    ))?;

    // Decrypt the secret
    let secret_bytes = decrypt_totp_secret(&encryption_key, &encrypted)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Verify the code
    let totp = build_totp(&secret_bytes, &fingerprint)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let valid = totp.check_current(&req.code).unwrap_or(false);

    if valid {
        // Mark TOTP as enrolled
        let db3 = db.clone();
        let uid2 = user_id.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db3
                .lock()
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB lock: {}", e)))?;
            conn.execute(
                "UPDATE users SET totp_enrolled = 1, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![chrono::Utc::now().to_rfc3339(), uid2],
            )
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("DB update: {}", e),
                )
            })?;
            Ok::<(), (StatusCode, String)>(())
        })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;
    }

    Ok(Json(TotpVerifyResponse { valid }))
}

/// POST /api/auth/totp/verify
/// Verify a TOTP code during authentication. For use when a user has TOTP enrolled
/// and needs to provide a code as a second factor.
pub async fn totp_verify(
    State(state): State<AppState>,
    Json(req): Json<TotpVerifyWithFingerprint>,
) -> Result<Json<TotpVerifyResponse>, (StatusCode, String)> {
    let db = state.db.clone();
    let encryption_key = state.encryption_key.clone();
    let fingerprint = req.fingerprint.clone();

    // Look up user TOTP status and encrypted secret by fingerprint
    let db2 = db.clone();
    let fp = fingerprint.clone();
    let (encrypted_secret, totp_enrolled) = tokio::task::spawn_blocking(move || {
        let conn = db2
            .lock()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB lock: {}", e)))?;
        let result: Result<(Option<Vec<u8>>, bool), _> = conn.query_row(
            "SELECT totp_secret_encrypted, totp_enrolled FROM users WHERE fingerprint = ?1",
            [&fp],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| (StatusCode::NOT_FOUND, format!("User not found: {}", e)));
        result
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // If TOTP is not enrolled, code verification is not required — pass
    if !totp_enrolled {
        return Ok(Json(TotpVerifyResponse { valid: true }));
    }

    let encrypted = encrypted_secret.ok_or((
        StatusCode::INTERNAL_SERVER_ERROR,
        "TOTP enrolled but no secret stored".to_string(),
    ))?;

    // Decrypt and verify
    let secret_bytes = decrypt_totp_secret(&encryption_key, &encrypted)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let totp = build_totp(&secret_bytes, &fingerprint)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let valid = totp.check_current(&req.code).unwrap_or(false);

    Ok(Json(TotpVerifyResponse { valid }))
}

/// Request body for TOTP verification during login (includes fingerprint since
/// the user is not yet authenticated with a JWT at this point).
#[derive(Debug, Serialize, Deserialize)]
pub struct TotpVerifyWithFingerprint {
    pub fingerprint: String,
    pub code: String,
}

/// Check if a user has TOTP enrolled (used by auth flow to determine if 2FA is required).
pub fn check_totp_enrolled(
    db: &crate::db::DbPool,
    fingerprint: &str,
) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let conn = db.lock().map_err(|e| format!("DB lock: {}", e))?;
    let enrolled: bool = conn
        .query_row(
            "SELECT totp_enrolled FROM users WHERE fingerprint = ?1",
            [fingerprint],
            |row| row.get(0),
        )
        .unwrap_or(false);
    Ok(enrolled)
}
