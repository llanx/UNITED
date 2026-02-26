//! REST endpoints for X25519 DM key publication and retrieval.
//!
//! Clients derive X25519 public keys from their Ed25519 identity keys using
//! crypto_sign_ed25519_pk_to_curve25519 (libsodium) and publish the result here.
//! The server stores these keys so other users can look them up for DM key exchange.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::auth::middleware::Claims;
use crate::proto::dm as proto_dm;
use crate::proto::ws::{envelope::Payload, Envelope};
use crate::state::AppState;
use crate::ws::broadcast::broadcast_to_all;

#[derive(Debug, Deserialize)]
pub struct PublishKeyRequest {
    /// Hex-encoded 32-byte X25519 public key
    pub x25519_pubkey: String,
}

#[derive(Debug, Serialize)]
pub struct DmKeyResponse {
    pub ed25519_pubkey: String,
    pub x25519_pubkey: String,
    pub published_at: String,
}

/// POST /api/dm/keys — Publish X25519 public key for DM key exchange.
/// JWT auth required. UPSERT pattern: handles key rotation.
pub async fn publish_dm_key(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<PublishKeyRequest>,
) -> Result<Json<DmKeyResponse>, StatusCode> {
    // Decode hex X25519 pubkey
    let x25519_bytes = hex::decode(&body.x25519_pubkey)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    if x25519_bytes.len() != 32 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let db = state.db.clone();
    let user_id = claims.sub.clone();
    let x25519_bytes_for_broadcast = x25519_bytes.clone();

    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Look up user's Ed25519 pubkey (hex)
        let pubkey_hex: String = conn
            .query_row(
                "SELECT lower(hex(public_key)) FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // UPSERT: INSERT OR REPLACE to handle key rotation
        conn.execute(
            "INSERT OR REPLACE INTO dm_public_keys (ed25519_pubkey, x25519_pubkey, published_at, updated_at)
             VALUES (?1, ?2, COALESCE((SELECT published_at FROM dm_public_keys WHERE ed25519_pubkey = ?1), datetime('now')), datetime('now'))",
            rusqlite::params![pubkey_hex, x25519_bytes],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Query the stored record for response
        let (published_at,): (String,) = conn
            .query_row(
                "SELECT published_at FROM dm_public_keys WHERE ed25519_pubkey = ?1",
                rusqlite::params![pubkey_hex],
                |row| Ok((row.get(0)?,)),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok::<_, StatusCode>((pubkey_hex, published_at))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let (ed25519_pubkey, published_at) = result;

    // Broadcast DmKeyRotatedEvent to all WS clients so they can re-derive shared secrets
    let now_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::DmKeyRotatedEvent(proto_dm::DmKeyRotatedEvent {
            user_pubkey: ed25519_pubkey.clone(),
            new_x25519_pubkey: x25519_bytes_for_broadcast.clone(),
            timestamp: now_millis,
        })),
    };
    broadcast_to_all(&state.connections, &envelope);

    Ok(Json(DmKeyResponse {
        ed25519_pubkey,
        x25519_pubkey: body.x25519_pubkey,
        published_at,
    }))
}

/// GET /api/dm/keys/{ed25519_pubkey} — Retrieve another user's X25519 public key.
/// JWT auth required. Returns 404 if the user hasn't published a DM key yet.
pub async fn get_dm_key(
    State(state): State<AppState>,
    _claims: Claims,
    Path(ed25519_pubkey): Path<String>,
) -> Result<Json<DmKeyResponse>, StatusCode> {
    let db = state.db.clone();
    let pubkey = ed25519_pubkey.to_lowercase();

    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let (x25519_bytes, published_at): (Vec<u8>, String) = conn
            .query_row(
                "SELECT x25519_pubkey, published_at FROM dm_public_keys WHERE ed25519_pubkey = ?1",
                rusqlite::params![pubkey],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| StatusCode::NOT_FOUND)?;

        Ok::<_, StatusCode>((pubkey, hex::encode(x25519_bytes), published_at))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let (ed25519_pubkey, x25519_pubkey, published_at) = result;

    Ok(Json(DmKeyResponse {
        ed25519_pubkey,
        x25519_pubkey,
        published_at,
    }))
}
