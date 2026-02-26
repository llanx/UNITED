//! REST endpoints for chat message CRUD and last-read tracking.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::auth::middleware::Claims;
use crate::chat::broadcast;
use crate::proto::chat as proto_chat;
use crate::state::AppState;

/// Maximum message content length (chars).
const MAX_CONTENT_LENGTH: usize = 4000;
/// Default page size for message history.
const DEFAULT_LIMIT: u32 = 50;
/// Maximum page size for message history.
const MAX_LIMIT: u32 = 100;

// --- Request / Response types ---

#[derive(Debug, Deserialize)]
pub struct CreateMessageRequest {
    pub content: String,
    pub reply_to_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MessageResponse {
    pub id: String,
    pub channel_id: String,
    pub sender_pubkey: String,
    pub sender_display_name: String,
    pub content: String,
    pub timestamp: u64,
    pub server_sequence: u64,
    pub reply_to_id: Option<String>,
    pub edited: bool,
    pub reactions: Vec<ReactionGroup>,
}

#[derive(Debug, Serialize)]
pub struct ReactionGroup {
    pub emoji: String,
    pub count: i64,
    pub user_pubkeys: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub before: Option<u64>,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct HistoryResponse {
    pub messages: Vec<MessageResponse>,
    pub has_more: bool,
}

#[derive(Debug, Deserialize)]
pub struct EditMessageRequest {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLastReadRequest {
    pub last_sequence: i64,
}

#[derive(Debug, Serialize)]
pub struct LastReadResponse {
    pub last_sequence: i64,
}

// --- Handlers ---

/// POST /api/channels/{channel_id}/messages
/// Create a new message via REST. JWT auth required.
pub async fn create_message(
    State(state): State<AppState>,
    claims: Claims,
    Path(channel_id): Path<String>,
    Json(body): Json<CreateMessageRequest>,
) -> Result<(StatusCode, Json<MessageResponse>), StatusCode> {
    // Validate content
    let content = body.content.trim().to_string();
    if content.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if content.len() > MAX_CONTENT_LENGTH {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }

    let db = state.db.clone();
    let user_id = claims.sub.clone();
    let reply_to_id = body.reply_to_id.clone();
    let cid = channel_id.clone();

    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Verify channel exists
        let channel_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM channels WHERE id = ?1",
                rusqlite::params![cid],
                |row| row.get::<_, i64>(0).map(|c| c > 0),
            )
            .unwrap_or(false);
        if !channel_exists {
            return Err(StatusCode::NOT_FOUND);
        }

        // Look up sender's display_name and public_key
        let (display_name, pubkey_hex): (String, String) = conn
            .query_row(
                "SELECT display_name, hex(public_key) FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let sender_pubkey = pubkey_hex.to_lowercase();

        // Assign next server_sequence for this channel
        let next_seq: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(server_sequence), 0) + 1 FROM messages WHERE channel_id = ?1",
                rusqlite::params![cid],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let now_rfc = Utc::now().to_rfc3339();

        // Parse mention_user_ids and mention_role_ids from content
        // Simple pattern: @user:<id> and @role:<id>
        let mention_user_ids = parse_user_mentions(&content);
        let mention_role_ids = parse_role_mentions(&content);

        // Insert message — message_type = 1 (CHAT), signature empty for REST path
        conn.execute(
            "INSERT INTO messages (channel_id, sender_pubkey, message_type, payload, timestamp, sequence_hint, server_sequence, signature, created_at, content_text, edited, deleted, reply_to_id)
             VALUES (?1, ?2, 1, NULL, ?3, 0, ?4, X'', ?5, ?6, 0, 0, ?7)",
            rusqlite::params![
                cid,
                sender_pubkey,
                now_millis as i64,
                next_seq,
                now_rfc,
                content,
                reply_to_id,
            ],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Use the actual DB row ID as message ID (consistent with history endpoint)
        let row_id = conn.last_insert_rowid();

        // Build the ChatMessage proto for broadcast
        let chat_message = proto_chat::ChatMessage {
            id: row_id.to_string(),
            channel_id: cid.clone(),
            sender_pubkey: sender_pubkey.clone(),
            sender_display_name: display_name.clone(),
            content: content.clone(),
            timestamp: now_millis,
            server_sequence: next_seq as u64,
            signature: vec![],
            reply_to_id: reply_to_id.clone(),
            edited: false,
            mention_user_ids,
            mention_role_ids,
        };

        let response = MessageResponse {
            id: row_id.to_string(),
            channel_id: cid,
            sender_pubkey,
            sender_display_name: display_name,
            content,
            timestamp: now_millis,
            server_sequence: next_seq as u64,
            reply_to_id,
            edited: false,
            reactions: vec![],
        };

        Ok((response, chat_message))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let (response, chat_message) = result;

    // Broadcast NewMessageEvent to all WS clients
    broadcast::broadcast_new_message(&state.connections, chat_message);

    Ok((StatusCode::CREATED, Json(response)))
}

/// GET /api/channels/{channel_id}/messages?before={seq}&limit={n}
/// Paginated message history. JWT auth required.
pub async fn get_channel_messages(
    State(state): State<AppState>,
    _claims: Claims,
    Path(channel_id): Path<String>,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<HistoryResponse>, StatusCode> {
    let db = state.db.clone();
    let cid = channel_id.clone();
    let before = query.before.unwrap_or(u64::MAX);
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);

    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Query messages with pagination
        let mut stmt = conn
            .prepare(
                "SELECT m.id, m.channel_id, m.sender_pubkey, m.server_sequence,
                        m.content_text, m.timestamp, m.edited, m.reply_to_id, m.created_at,
                        u.display_name
                 FROM messages m
                 LEFT JOIN users u ON m.sender_pubkey = lower(hex(u.public_key))
                 WHERE m.channel_id = ?1 AND m.server_sequence < ?2 AND m.deleted = 0
                 ORDER BY m.server_sequence DESC
                 LIMIT ?3",
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let messages: Vec<MessageResponse> = stmt
            .query_map(
                rusqlite::params![cid, before as i64, (limit + 1) as i64],
                |row| {
                    let msg_id: i64 = row.get(0)?;
                    let channel_id: String = row.get(1)?;
                    let sender_pubkey: String = row.get(2)?;
                    let server_sequence: i64 = row.get(3)?;
                    let content_text: Option<String> = row.get(4)?;
                    let timestamp: i64 = row.get(5)?;
                    let edited: bool = row.get::<_, i64>(6)? != 0;
                    let reply_to_id: Option<String> = row.get(7)?;
                    let display_name: Option<String> = row.get(9)?;

                    Ok(MessageResponse {
                        id: msg_id.to_string(),
                        channel_id,
                        sender_pubkey,
                        sender_display_name: display_name.unwrap_or_else(|| "Unknown".to_string()),
                        content: content_text.unwrap_or_default(),
                        timestamp: timestamp as u64,
                        server_sequence: server_sequence as u64,
                        reply_to_id,
                        edited,
                        reactions: vec![], // filled below
                    })
                },
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        // Determine has_more
        let has_more = messages.len() > limit as usize;
        let mut messages: Vec<MessageResponse> = messages.into_iter().take(limit as usize).collect();

        // Fetch reactions for each message
        for msg in &mut messages {
            if let Ok(mut rstmt) = conn.prepare(
                "SELECT emoji, COUNT(*) as cnt, GROUP_CONCAT(user_pubkey) as pubkeys
                 FROM reactions
                 WHERE message_id = ?1
                 GROUP BY emoji
                 ORDER BY cnt DESC",
            ) {
                if let Ok(rows) = rstmt.query_map(rusqlite::params![msg.id.parse::<i64>().unwrap_or(0)], |row| {
                    let emoji: String = row.get(0)?;
                    let count: i64 = row.get(1)?;
                    let pubkeys_str: String = row.get(2)?;
                    let user_pubkeys: Vec<String> =
                        pubkeys_str.split(',').map(|s| s.to_string()).collect();
                    Ok(ReactionGroup {
                        emoji,
                        count,
                        user_pubkeys,
                    })
                }) {
                    msg.reactions = rows.filter_map(|r| r.ok()).collect();
                }
            }
        }

        Ok::<_, StatusCode>(HistoryResponse { messages, has_more })
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(result))
}

/// PUT /api/channels/{channel_id}/messages/{message_id}
/// Edit own message. JWT auth required. Only the sender can edit.
pub async fn edit_message(
    State(state): State<AppState>,
    claims: Claims,
    Path((channel_id, message_id)): Path<(String, String)>,
    Json(body): Json<EditMessageRequest>,
) -> Result<StatusCode, StatusCode> {
    let content = body.content.trim().to_string();
    if content.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if content.len() > MAX_CONTENT_LENGTH {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }

    let db = state.db.clone();
    let user_id = claims.sub.clone();
    let mid = message_id.clone();
    let cid = channel_id.clone();

    let now_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let now_rfc = Utc::now().to_rfc3339();

    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Look up user's pubkey
        let sender_pubkey: String = conn
            .query_row(
                "SELECT lower(hex(public_key)) FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Verify message exists, belongs to sender, and is in the right channel
        let msg_id: i64 = mid.parse().map_err(|_| StatusCode::BAD_REQUEST)?;
        let row_pubkey: String = conn
            .query_row(
                "SELECT sender_pubkey FROM messages WHERE id = ?1 AND channel_id = ?2 AND deleted = 0",
                rusqlite::params![msg_id, cid],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::NOT_FOUND)?;

        if row_pubkey != sender_pubkey {
            return Err(StatusCode::FORBIDDEN);
        }

        // Update the message
        conn.execute(
            "UPDATE messages SET content_text = ?1, edited = 1, edit_timestamp = ?2 WHERE id = ?3",
            rusqlite::params![content, now_rfc, msg_id],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok(content)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let new_content = result;

    // Broadcast edit event
    broadcast::broadcast_message_edited(
        &state.connections,
        proto_chat::MessageEditedEvent {
            message_id,
            channel_id,
            new_content,
            edit_timestamp: now_millis,
        },
    );

    Ok(StatusCode::OK)
}

/// DELETE /api/channels/{channel_id}/messages/{message_id}
/// Soft-delete a message. Sender or admin/owner can delete.
pub async fn delete_message(
    State(state): State<AppState>,
    claims: Claims,
    Path((channel_id, message_id)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let db = state.db.clone();
    let user_id = claims.sub.clone();
    let is_owner = claims.is_owner;
    let is_admin = claims.is_admin;
    let mid = message_id.clone();
    let cid = channel_id.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Look up user's pubkey
        let sender_pubkey: String = conn
            .query_row(
                "SELECT lower(hex(public_key)) FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let msg_id: i64 = mid.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

        // Get message sender
        let row_pubkey: String = conn
            .query_row(
                "SELECT sender_pubkey FROM messages WHERE id = ?1 AND channel_id = ?2 AND deleted = 0",
                rusqlite::params![msg_id, cid],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::NOT_FOUND)?;

        // Only sender, owner, or admin can delete
        if row_pubkey != sender_pubkey && !is_owner && !is_admin {
            return Err(StatusCode::FORBIDDEN);
        }

        conn.execute(
            "UPDATE messages SET deleted = 1 WHERE id = ?1",
            rusqlite::params![msg_id],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok(())
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    // Broadcast delete event
    broadcast::broadcast_message_deleted(
        &state.connections,
        proto_chat::MessageDeletedEvent {
            message_id,
            channel_id,
        },
    );

    Ok(StatusCode::OK)
}

/// PUT /api/channels/{channel_id}/last-read
/// Update last_read sequence for the authenticated user.
pub async fn update_last_read(
    State(state): State<AppState>,
    claims: Claims,
    Path(channel_id): Path<String>,
    Json(body): Json<UpdateLastReadRequest>,
) -> Result<StatusCode, StatusCode> {
    let db = state.db.clone();
    let user_id = claims.sub;
    let cid = channel_id;
    let seq = body.last_sequence;
    let now = Utc::now().to_rfc3339();

    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        conn.execute(
            "INSERT INTO last_read (user_id, channel_id, last_sequence, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, channel_id) DO UPDATE SET last_sequence = ?3, updated_at = ?4",
            rusqlite::params![user_id, cid, seq, now],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        Ok::<(), StatusCode>(())
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(StatusCode::OK)
}

/// GET /api/channels/{channel_id}/last-read
/// Get last_read sequence for the authenticated user.
pub async fn get_last_read(
    State(state): State<AppState>,
    claims: Claims,
    Path(channel_id): Path<String>,
) -> Result<Json<LastReadResponse>, StatusCode> {
    let db = state.db.clone();
    let user_id = claims.sub;
    let cid = channel_id;

    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let seq: i64 = conn
            .query_row(
                "SELECT last_sequence FROM last_read WHERE user_id = ?1 AND channel_id = ?2",
                rusqlite::params![user_id, cid],
                |row| row.get(0),
            )
            .unwrap_or(0);
        Ok::<_, StatusCode>(LastReadResponse {
            last_sequence: seq,
        })
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(result))
}

// --- Helpers ---

/// Parse @user:<id> mentions from content.
fn parse_user_mentions(content: &str) -> Vec<String> {
    let mut mentions = Vec::new();
    for part in content.split_whitespace() {
        if let Some(id) = part.strip_prefix("@user:") {
            mentions.push(id.to_string());
        }
    }
    mentions
}

/// Parse @role:<id> mentions from content.
fn parse_role_mentions(content: &str) -> Vec<String> {
    let mut mentions = Vec::new();
    for part in content.split_whitespace() {
        if let Some(id) = part.strip_prefix("@role:") {
            mentions.push(id.to_string());
        }
    }
    mentions
}
