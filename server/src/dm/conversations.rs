//! REST endpoints for DM conversation management.
//!
//! Conversations are one-to-one between two users. Participant order is normalized
//! (lexicographically smaller pubkey is always participant_a) to prevent duplicates.

use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::auth::middleware::Claims;
use crate::proto::dm as proto_dm;
use crate::proto::ws::{envelope::Payload, Envelope};
use crate::state::AppState;
use crate::ws::broadcast::send_to_user;

#[derive(Debug, Deserialize)]
pub struct CreateConversationRequest {
    /// Hex-encoded Ed25519 public key of the recipient
    pub recipient_pubkey: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ConversationResponse {
    pub id: String,
    pub participant_a_pubkey: String,
    pub participant_b_pubkey: String,
    pub participant_a_display_name: String,
    pub participant_b_display_name: String,
    pub created_at: String,
    pub last_message_at: Option<String>,
}

/// POST /api/dm/conversations — Create or get a DM conversation.
/// JWT auth required. Body: { "recipient_pubkey": "<hex ed25519>" }.
/// Returns existing conversation if one already exists between the two users.
pub async fn create_conversation(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<CreateConversationRequest>,
) -> Result<(StatusCode, Json<ConversationResponse>), StatusCode> {
    let db = state.db.clone();
    let user_id = claims.sub.clone();
    let recipient_pubkey = body.recipient_pubkey.to_lowercase();

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

        // Cannot DM yourself
        if sender_pubkey == recipient_pubkey {
            return Err(StatusCode::BAD_REQUEST);
        }

        // Validate recipient exists in users table
        let recipient_display_name: String = conn
            .query_row(
                "SELECT display_name FROM users WHERE lower(hex(public_key)) = ?1",
                rusqlite::params![recipient_pubkey],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::NOT_FOUND)?;

        // Normalize participant order: lexicographically smaller pubkey is participant_a
        let (participant_a, participant_b, display_a, display_b) =
            if sender_pubkey < recipient_pubkey {
                (
                    sender_pubkey.clone(),
                    recipient_pubkey.clone(),
                    sender_display_name.clone(),
                    recipient_display_name.clone(),
                )
            } else {
                (
                    recipient_pubkey.clone(),
                    sender_pubkey.clone(),
                    recipient_display_name.clone(),
                    sender_display_name.clone(),
                )
            };

        // Check if conversation already exists
        let existing: Option<(String, String, Option<String>)> = conn
            .query_row(
                "SELECT id, created_at, last_message_at FROM dm_conversations WHERE participant_a = ?1 AND participant_b = ?2",
                rusqlite::params![participant_a, participant_b],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();

        if let Some((id, created_at, last_message_at)) = existing {
            // Return existing conversation
            return Ok((
                false,
                ConversationResponse {
                    id,
                    participant_a_pubkey: participant_a,
                    participant_b_pubkey: participant_b,
                    participant_a_display_name: display_a,
                    participant_b_display_name: display_b,
                    created_at,
                    last_message_at,
                },
                sender_pubkey,
                recipient_pubkey,
            ));
        }

        // Create new conversation
        let conv_id = uuid::Uuid::now_v7().to_string();
        conn.execute(
            "INSERT INTO dm_conversations (id, participant_a, participant_b) VALUES (?1, ?2, ?3)",
            rusqlite::params![conv_id, participant_a, participant_b],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let created_at: String = conn
            .query_row(
                "SELECT created_at FROM dm_conversations WHERE id = ?1",
                rusqlite::params![conv_id],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok((
            true,
            ConversationResponse {
                id: conv_id,
                participant_a_pubkey: participant_a,
                participant_b_pubkey: participant_b,
                participant_a_display_name: display_a,
                participant_b_display_name: display_b,
                created_at,
                last_message_at: None,
            },
            sender_pubkey,
            recipient_pubkey,
        ))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let (is_new, response, sender_pubkey, recipient_pubkey) = result;

    if is_new {
        // Broadcast DmConversationCreatedEvent to BOTH participants
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let proto_conv = proto_dm::DmConversation {
            id: response.id.clone(),
            participant_a_pubkey: response.participant_a_pubkey.clone(),
            participant_b_pubkey: response.participant_b_pubkey.clone(),
            participant_a_display_name: response.participant_a_display_name.clone(),
            participant_b_display_name: response.participant_b_display_name.clone(),
            created_at: now_millis,
            last_message_at: 0,
            last_message_preview: String::new(),
        };

        let envelope = Envelope {
            request_id: String::new(),
            payload: Some(Payload::DmConversationCreatedEvent(
                proto_dm::DmConversationCreatedEvent {
                    conversation: Some(proto_conv),
                },
            )),
        };

        // Send to both participants (targeted, not broadcast_to_all)
        send_to_user(&state.connections, &sender_pubkey, &envelope);
        send_to_user(&state.connections, &recipient_pubkey, &envelope);

        Ok((StatusCode::CREATED, Json(response)))
    } else {
        Ok((StatusCode::OK, Json(response)))
    }
}

/// GET /api/dm/conversations — List all DM conversations for the authenticated user.
/// JWT auth required. Returns conversations ordered by last_message_at DESC.
pub async fn list_conversations(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<ConversationResponse>>, StatusCode> {
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

        // Query conversations where user is a participant, join users for display names
        let mut stmt = conn
            .prepare(
                "SELECT c.id, c.participant_a, c.participant_b, c.created_at, c.last_message_at,
                        ua.display_name, ub.display_name
                 FROM dm_conversations c
                 LEFT JOIN users ua ON lower(hex(ua.public_key)) = c.participant_a
                 LEFT JOIN users ub ON lower(hex(ub.public_key)) = c.participant_b
                 WHERE c.participant_a = ?1 OR c.participant_b = ?1
                 ORDER BY CASE WHEN c.last_message_at IS NULL THEN 1 ELSE 0 END,
                          c.last_message_at DESC,
                          c.created_at DESC",
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let conversations: Vec<ConversationResponse> = stmt
            .query_map(rusqlite::params![user_pubkey], |row| {
                Ok(ConversationResponse {
                    id: row.get(0)?,
                    participant_a_pubkey: row.get(1)?,
                    participant_b_pubkey: row.get(2)?,
                    created_at: row.get(3)?,
                    last_message_at: row.get(4)?,
                    participant_a_display_name: row
                        .get::<_, Option<String>>(5)?
                        .unwrap_or_else(|| "Unknown".to_string()),
                    participant_b_display_name: row
                        .get::<_, Option<String>>(6)?
                        .unwrap_or_else(|| "Unknown".to_string()),
                })
            })
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        Ok::<_, StatusCode>(conversations)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(result))
}
