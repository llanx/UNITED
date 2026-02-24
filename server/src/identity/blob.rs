use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::auth::middleware::Claims;
use crate::state::AppState;

// --- Request/Response types ---

#[derive(Debug, Serialize, Deserialize)]
pub struct BlobResponse {
    pub fingerprint: String,
    /// Hex-encoded encrypted identity blob
    pub encrypted_blob: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PutBlobRequest {
    /// Hex-encoded client-encrypted identity blob
    pub encrypted_blob: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PutBlobResponse {
    pub success: bool,
}

// --- Handlers ---

/// GET /api/identity/blob/{fingerprint}
/// Public endpoint (no auth required) — anyone with the fingerprint can retrieve
/// the encrypted blob. This is required for recovery (user can't sign a challenge
/// when they've lost their key). Rate-limited at the router level.
/// Per CONTEXT.md: "Public by fingerprint with rate limiting."
pub async fn get_blob(
    State(state): State<AppState>,
    Path(fingerprint): Path<String>,
) -> Result<Json<BlobResponse>, StatusCode> {
    let db = state.db.clone();

    let blob = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let result: Result<(Vec<u8>, String, String), _> = conn.query_row(
            "SELECT encrypted_blob, created_at, updated_at FROM identity_blobs WHERE fingerprint = ?1",
            [&fingerprint],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );

        match result {
            Ok((blob_bytes, created_at, updated_at)) => Ok(BlobResponse {
                fingerprint,
                encrypted_blob: hex::encode(blob_bytes),
                created_at,
                updated_at,
            }),
            Err(_) => Err(StatusCode::NOT_FOUND),
        }
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(blob))
}

/// PUT /api/identity/blob
/// Authenticated endpoint — store or update the encrypted identity blob
/// for the calling user's fingerprint. The server stores the blob as-is;
/// it cannot decrypt it (encrypted with user's passphrase-derived key).
pub async fn put_blob(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<PutBlobRequest>,
) -> Result<Json<PutBlobResponse>, (StatusCode, String)> {
    let blob_bytes = hex::decode(&req.encrypted_blob)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid hex encoding".to_string()))?;

    // Limit blob size to 64KB to prevent abuse
    if blob_bytes.len() > 65536 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Blob too large (max 64KB)".to_string(),
        ));
    }

    let db = state.db.clone();
    let fingerprint = claims.fingerprint.clone();
    let now = Utc::now().to_rfc3339();

    tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB lock: {}", e)))?;

        // Upsert: insert or update
        conn.execute(
            "INSERT INTO identity_blobs (fingerprint, encrypted_blob, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(fingerprint) DO UPDATE SET encrypted_blob = ?2, updated_at = ?4",
            rusqlite::params![fingerprint, blob_bytes, now, now],
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("DB insert: {}", e),
            )
        })?;

        Ok::<(), (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    Ok(Json(PutBlobResponse { success: true }))
}
