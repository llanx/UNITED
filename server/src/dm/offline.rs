//! Offline DM delivery queue and background cleanup.
//!
//! When a DM is sent to an offline user, it's queued in dm_offline_queue.
//! On reconnection, the client calls GET /api/dm/offline to retrieve missed DMs.
//! A background task purges queue entries older than 30 days every hour.

use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};

use crate::auth::middleware::Claims;
use crate::db::DbPool;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct OfflineDmMessage {
    pub id: String,
    pub conversation_id: String,
    pub sender_pubkey: String,
    pub encrypted_payload: String,
    pub nonce: String,
    pub ephemeral_pubkey: Option<String>,
    pub timestamp: u64,
    pub server_sequence: u64,
    pub sender_display_name: String,
}

#[derive(Debug, Deserialize)]
pub struct AckOfflineRequest {
    pub message_ids: Vec<String>,
}

/// GET /api/dm/offline -- Retrieve offline messages for the authenticated user.
/// JWT auth required. Returns pending DMs and marks them as delivered.
/// Called by the client on connection/reconnection to fetch missed DMs.
pub async fn get_offline_messages(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<OfflineDmMessage>>, StatusCode> {
    let db = state.db.clone();
    let user_id = claims.sub.clone();

    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Look up user's pubkey
        let user_pubkey: String = conn
            .query_row(
                "SELECT lower(hex(public_key)) FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Fetch offline messages with JOIN to dm_messages
        let mut stmt = conn
            .prepare(
                "SELECT m.id, m.conversation_id, m.sender_pubkey, m.encrypted_payload,
                        m.nonce, m.ephemeral_pubkey, m.timestamp, m.server_sequence,
                        m.sender_display_name
                 FROM dm_offline_queue q
                 JOIN dm_messages m ON q.dm_message_id = m.id
                 WHERE q.recipient_pubkey = ?1 AND q.delivered = 0
                 ORDER BY m.timestamp ASC",
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let messages: Vec<OfflineDmMessage> = stmt
            .query_map(rusqlite::params![user_pubkey], |row| {
                let encrypted_payload: Vec<u8> = row.get(3)?;
                let nonce: Vec<u8> = row.get(4)?;
                let ephemeral_pubkey: Option<Vec<u8>> = row.get(5)?;
                let timestamp: i64 = row.get(6)?;
                let server_sequence: i64 = row.get(7)?;

                Ok(OfflineDmMessage {
                    id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    sender_pubkey: row.get(2)?,
                    encrypted_payload: STANDARD.encode(&encrypted_payload),
                    nonce: STANDARD.encode(&nonce),
                    ephemeral_pubkey: ephemeral_pubkey.as_ref().map(|b| STANDARD.encode(b)),
                    timestamp: timestamp as u64,
                    server_sequence: server_sequence as u64,
                    sender_display_name: row
                        .get::<_, Option<String>>(8)?
                        .unwrap_or_else(|| "Unknown".to_string()),
                })
            })
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        // Mark all returned entries as delivered
        conn.execute(
            "UPDATE dm_offline_queue SET delivered = 1 WHERE recipient_pubkey = ?1 AND delivered = 0",
            rusqlite::params![user_pubkey],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok::<_, StatusCode>(messages)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(result))
}

/// POST /api/dm/offline/ack -- Acknowledge offline delivery.
/// JWT auth required. Marks specific entries in dm_offline_queue as delivered.
pub async fn ack_offline_messages(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<AckOfflineRequest>,
) -> Result<StatusCode, StatusCode> {
    let db = state.db.clone();
    let user_id = claims.sub.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Look up user's pubkey
        let user_pubkey: String = conn
            .query_row(
                "SELECT lower(hex(public_key)) FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Mark each message as delivered (only if owned by the user)
        for msg_id in &body.message_ids {
            conn.execute(
                "UPDATE dm_offline_queue SET delivered = 1 WHERE recipient_pubkey = ?1 AND dm_message_id = ?2",
                rusqlite::params![user_pubkey, msg_id],
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }

        Ok::<(), StatusCode>(())
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(StatusCode::OK)
}

/// Spawn the background cleanup task for the offline queue.
/// Runs every hour and deletes queue entries older than 30 days.
/// Messages in dm_messages persist indefinitely (conversation history).
pub fn spawn_offline_cleanup(db: DbPool) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(3600)).await;

            let db_clone = db.clone();
            let _ = tokio::task::spawn_blocking(move || {
                if let Ok(conn) = db_clone.lock() {
                    match conn.execute(
                        "DELETE FROM dm_offline_queue WHERE queued_at < datetime('now', '-30 days')",
                        [],
                    ) {
                        Ok(count) => {
                            if count > 0 {
                                tracing::info!(
                                    "Cleaned up {} expired offline DM queue entries",
                                    count
                                );
                            }
                        }
                        Err(e) => {
                            tracing::warn!("Failed to clean up offline DM queue: {}", e);
                        }
                    }
                }
            })
            .await;
        }
    });
}
