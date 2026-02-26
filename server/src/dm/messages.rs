//! REST endpoints for sending and retrieving encrypted DM messages.
//!
//! CRITICAL: The server stores only encrypted blobs (opaque payloads).
//! It cannot read, search, or moderate DM content. This is by design per SEC-05.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};

use crate::auth::middleware::Claims;
use crate::proto::dm as proto_dm;
use crate::proto::ws::{envelope::Payload, Envelope};
use crate::state::AppState;
use crate::ws::broadcast::send_to_user;

/// Default page size for DM message history.
const DEFAULT_LIMIT: u32 = 50;
/// Maximum page size for DM message history.
const MAX_LIMIT: u32 = 100;

#[derive(Debug, Deserialize)]
pub struct SendDmRequest {
    pub conversation_id: String,
    /// Base64-encoded encrypted payload
    pub encrypted_payload: String,
    /// Base64-encoded 24-byte nonce
    pub nonce: String,
    /// Base64-encoded ephemeral X25519 public key (optional)
    pub ephemeral_pubkey: Option<String>,
    /// Unix millis timestamp set by sender
    pub timestamp: u64,
}

#[derive(Debug, Serialize)]
pub struct DmMessageResponse {
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
pub struct DmHistoryQuery {
    pub before: Option<u64>,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct DmHistoryResponse {
    pub messages: Vec<DmMessageResponse>,
    pub has_more: bool,
}

// --- Base64 helpers ---

fn b64_decode(input: &str) -> Result<Vec<u8>, StatusCode> {
    STANDARD.decode(input).map_err(|_| StatusCode::BAD_REQUEST)
}

fn b64_encode(input: &[u8]) -> String {
    STANDARD.encode(input)
}

/// POST /api/dm/messages -- Send an encrypted DM.
/// JWT auth required. Server stores encrypted blob and notifies recipient via WS.
pub async fn send_dm_message(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<SendDmRequest>,
) -> Result<(StatusCode, Json<DmMessageResponse>), StatusCode> {
    // Decode base64 payloads
    let encrypted_payload = b64_decode(&body.encrypted_payload)?;
    let nonce = b64_decode(&body.nonce)?;
    let ephemeral_pubkey = match &body.ephemeral_pubkey {
        Some(b64) => Some(b64_decode(b64)?),
        None => None,
    };

    let db = state.db.clone();
    let user_id = claims.sub.clone();
    let conv_id = body.conversation_id.clone();
    let timestamp = body.timestamp;

    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Look up sender's pubkey and display_name
        let (sender_pubkey, sender_display_name): (String, String) = conn
            .query_row(
                "SELECT lower(hex(public_key)), display_name FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Validate sender is a participant in the conversation
        let (participant_a, participant_b): (String, String) = conn
            .query_row(
                "SELECT participant_a, participant_b FROM dm_conversations WHERE id = ?1",
                rusqlite::params![conv_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| StatusCode::NOT_FOUND)?;

        if sender_pubkey != participant_a && sender_pubkey != participant_b {
            return Err(StatusCode::FORBIDDEN);
        }

        // Determine the other participant (recipient)
        let recipient_pubkey = if sender_pubkey == participant_a {
            participant_b
        } else {
            participant_a
        };

        // Generate message UUID
        let msg_id = uuid::Uuid::now_v7().to_string();

        // Assign server_sequence (atomic increment for the conversation)
        let next_seq: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(server_sequence), 0) + 1 FROM dm_messages WHERE conversation_id = ?1",
                rusqlite::params![conv_id],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Persist encrypted DM
        conn.execute(
            "INSERT INTO dm_messages (id, conversation_id, sender_pubkey, encrypted_payload, nonce, ephemeral_pubkey, timestamp, server_sequence, sender_display_name)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                msg_id,
                conv_id,
                sender_pubkey,
                encrypted_payload,
                nonce,
                ephemeral_pubkey,
                timestamp as i64,
                next_seq,
                sender_display_name,
            ],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Update conversation's last_message_at
        conn.execute(
            "UPDATE dm_conversations SET last_message_at = datetime('now') WHERE id = ?1",
            rusqlite::params![conv_id],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok((
            msg_id,
            conv_id,
            sender_pubkey,
            sender_display_name,
            recipient_pubkey,
            next_seq,
            encrypted_payload,
            nonce,
            ephemeral_pubkey,
        ))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let (
        msg_id,
        conv_id,
        sender_pubkey,
        sender_display_name,
        recipient_pubkey,
        next_seq,
        encrypted_payload_bytes,
        nonce_bytes,
        ephemeral_pubkey_bytes,
    ) = result;

    // Build DmMessageEvent proto for WS delivery
    let proto_msg = proto_dm::EncryptedDmMessage {
        id: msg_id.clone(),
        conversation_id: conv_id.clone(),
        sender_pubkey: sender_pubkey.clone(),
        encrypted_payload: encrypted_payload_bytes.clone(),
        nonce: nonce_bytes.clone(),
        ephemeral_pubkey: ephemeral_pubkey_bytes.clone().unwrap_or_default(),
        timestamp,
        server_sequence: next_seq as u64,
        sender_display_name: sender_display_name.clone(),
    };

    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::DmMessageEvent(proto_dm::DmMessageEvent {
            message: Some(proto_msg),
        })),
    };

    // Check if recipient has active WS connection
    let recipient_online = state.connections.contains_key(&recipient_pubkey);

    if recipient_online {
        // Send to recipient via targeted WS push (NOT broadcast_to_all)
        send_to_user(&state.connections, &recipient_pubkey, &envelope);
    } else {
        // Queue for offline delivery
        let db = state.db.clone();
        let rp = recipient_pubkey.clone();
        let mid = msg_id.clone();
        tokio::task::spawn_blocking(move || {
            if let Ok(conn) = db.lock() {
                let _ = conn.execute(
                    "INSERT INTO dm_offline_queue (recipient_pubkey, dm_message_id) VALUES (?1, ?2)",
                    rusqlite::params![rp, mid],
                );
            }
        });
    }

    // Also send back to sender (for multi-device: sender's other devices should see it)
    send_to_user(&state.connections, &sender_pubkey, &envelope);

    // Build response
    let response = DmMessageResponse {
        id: msg_id,
        conversation_id: conv_id,
        sender_pubkey,
        encrypted_payload: b64_encode(&encrypted_payload_bytes),
        nonce: b64_encode(&nonce_bytes),
        ephemeral_pubkey: ephemeral_pubkey_bytes.as_ref().map(|b| b64_encode(b)),
        timestamp,
        server_sequence: next_seq as u64,
        sender_display_name,
    };

    Ok((StatusCode::CREATED, Json(response)))
}

/// GET /api/dm/messages/{conversation_id}?before={seq}&limit={n}
/// Paginated DM message history. JWT auth required.
/// Validates caller is a participant in the conversation.
pub async fn get_dm_messages(
    State(state): State<AppState>,
    claims: Claims,
    Path(conversation_id): Path<String>,
    Query(query): Query<DmHistoryQuery>,
) -> Result<Json<DmHistoryResponse>, StatusCode> {
    let db = state.db.clone();
    let user_id = claims.sub.clone();
    let conv_id = conversation_id;
    let before = query.before.unwrap_or(u64::MAX);
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);

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

        // Validate caller is a participant in the conversation
        let (participant_a, participant_b): (String, String) = conn
            .query_row(
                "SELECT participant_a, participant_b FROM dm_conversations WHERE id = ?1",
                rusqlite::params![conv_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| StatusCode::NOT_FOUND)?;

        if user_pubkey != participant_a && user_pubkey != participant_b {
            return Err(StatusCode::FORBIDDEN);
        }

        // Fetch messages with pagination
        let mut stmt = conn
            .prepare(
                "SELECT id, conversation_id, sender_pubkey, encrypted_payload, nonce,
                        ephemeral_pubkey, timestamp, server_sequence, sender_display_name
                 FROM dm_messages
                 WHERE conversation_id = ?1 AND server_sequence < ?2
                 ORDER BY server_sequence DESC
                 LIMIT ?3",
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let messages: Vec<DmMessageResponse> = stmt
            .query_map(
                rusqlite::params![conv_id, before as i64, (limit + 1) as i64],
                |row| {
                    let encrypted_payload: Vec<u8> = row.get(3)?;
                    let nonce: Vec<u8> = row.get(4)?;
                    let ephemeral_pubkey: Option<Vec<u8>> = row.get(5)?;
                    let timestamp: i64 = row.get(6)?;
                    let server_sequence: i64 = row.get(7)?;

                    Ok(DmMessageResponse {
                        id: row.get(0)?,
                        conversation_id: row.get(1)?,
                        sender_pubkey: row.get(2)?,
                        encrypted_payload: b64_encode(&encrypted_payload),
                        nonce: b64_encode(&nonce),
                        ephemeral_pubkey: ephemeral_pubkey.as_ref().map(|b| b64_encode(b)),
                        timestamp: timestamp as u64,
                        server_sequence: server_sequence as u64,
                        sender_display_name: row
                            .get::<_, Option<String>>(8)?
                            .unwrap_or_else(|| "Unknown".to_string()),
                    })
                },
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        let has_more = messages.len() > limit as usize;
        let messages: Vec<DmMessageResponse> =
            messages.into_iter().take(limit as usize).collect();

        Ok::<_, StatusCode>(DmHistoryResponse { messages, has_more })
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(result))
}
