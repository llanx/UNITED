//! REST endpoints for block upload and download.
//!
//! PUT /api/blocks — Upload a block (raw binary body, X-Block-Hash header)
//! GET /api/blocks/:hash — Download a block (returns raw binary)

use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Serialize;

use crate::auth::middleware::Claims;
use crate::blocks::store;
use crate::state::AppState;

/// Default retention days for blocks (overridden by config)
const DEFAULT_RETENTION_DAYS: u32 = 30;

#[derive(Debug, Serialize)]
pub struct BlockUploadResponse {
    pub hash: String,
    pub size: u64,
}

/// PUT /api/blocks
///
/// Upload a content-addressed block. The raw binary body is the block data.
/// Required header: `X-Block-Hash` (hex-encoded SHA-256 hash).
/// Optional header: `X-Channel-Id` (channel association for retention tracking).
///
/// The server verifies the SHA-256 hash matches the body, encrypts with an
/// HKDF-derived key, and stores the encrypted block on disk.
pub async fn put_block_route(
    State(state): State<AppState>,
    _claims: Claims,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, Json<BlockUploadResponse>), (StatusCode, String)> {
    // Extract required X-Block-Hash header
    let hash_hex = headers
        .get("x-block-hash")
        .and_then(|v| v.to_str().ok())
        .ok_or((
            StatusCode::BAD_REQUEST,
            "Missing X-Block-Hash header".to_string(),
        ))?
        .to_lowercase();

    // Validate hash format (must be 64 hex chars = 32 bytes)
    if hash_hex.len() != 64 || hex::decode(&hash_hex).is_err() {
        return Err((
            StatusCode::BAD_REQUEST,
            "X-Block-Hash must be a 64-character hex string (SHA-256)".to_string(),
        ));
    }

    // Extract optional X-Channel-Id header
    let channel_id = headers
        .get("x-channel-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let data = body.to_vec();
    let size = data.len() as u64;

    // Enforce max upload size (default 100 MB)
    let max_upload_bytes = state.max_upload_size_mb.unwrap_or(100) as u64 * 1024 * 1024;
    if size > max_upload_bytes {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            format!(
                "Block size {} bytes exceeds maximum upload size of {} MB",
                size,
                state.max_upload_size_mb.unwrap_or(100)
            ),
        ));
    }

    // Get retention days from config
    let retention_days = state.block_retention_days.unwrap_or(DEFAULT_RETENTION_DAYS);

    // Store the block (verify hash, encrypt, write file, insert metadata)
    let db = state.db.clone();
    let data_dir = state.data_dir.clone();
    let hash_for_store = hash_hex.clone();
    let channel_for_store = channel_id.clone();

    tokio::task::spawn_blocking(move || {
        store::put_block(
            &db,
            &data_dir,
            &hash_for_store,
            &data,
            channel_for_store.as_deref(),
            retention_days,
        )
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task join error: {}", e),
        )
    })?
    .map_err(|e| {
        // Hash mismatch returns 400, other errors return 500
        if e.contains("Hash mismatch") {
            (StatusCode::BAD_REQUEST, e)
        } else {
            (StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    })?;

    Ok((
        StatusCode::CREATED,
        Json(BlockUploadResponse {
            hash: hash_hex,
            size,
        }),
    ))
}

/// GET /api/blocks/:hash
///
/// Download a block by its SHA-256 hex hash. Returns the raw binary data
/// with `Content-Type: application/octet-stream`. Returns 404 if not found.
pub async fn get_block_route(
    State(state): State<AppState>,
    _claims: Claims,
    Path(hash_hex): Path<String>,
) -> Result<(StatusCode, HeaderMap, Vec<u8>), (StatusCode, String)> {
    let hash_hex = hash_hex.to_lowercase();

    // Validate hash format
    if hash_hex.len() != 64 || hex::decode(&hash_hex).is_err() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Hash must be a 64-character hex string (SHA-256)".to_string(),
        ));
    }

    let db = state.db.clone();
    let data_dir = state.data_dir.clone();

    let result = tokio::task::spawn_blocking(move || store::get_block(&db, &data_dir, &hash_hex))
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Task join error: {}", e),
            )
        })?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    match result {
        Some(data) => {
            let mut headers = HeaderMap::new();
            headers.insert(
                axum::http::header::CONTENT_TYPE,
                "application/octet-stream".parse().unwrap(),
            );
            Ok((StatusCode::OK, headers, data))
        }
        None => Err((StatusCode::NOT_FOUND, "Block not found".to_string())),
    }
}
