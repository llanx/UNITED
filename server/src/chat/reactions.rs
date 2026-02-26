//! REST endpoints for emoji reactions on messages.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::auth::middleware::Claims;
use crate::chat::broadcast;
use crate::proto::chat as proto_chat;
use crate::state::AppState;

// --- Request / Response types ---

#[derive(Debug, Deserialize)]
pub struct AddReactionRequest {
    pub emoji: String,
}

#[derive(Debug, Serialize)]
pub struct ReactionGroupResponse {
    pub emoji: String,
    pub count: i64,
    pub user_pubkeys: Vec<String>,
}

// --- Handlers ---

/// POST /api/messages/{message_id}/reactions
/// Add a reaction to a message. JWT auth required.
/// Uses INSERT OR IGNORE to handle duplicate (same user+emoji) gracefully.
pub async fn add_reaction(
    State(state): State<AppState>,
    claims: Claims,
    Path(message_id): Path<String>,
    Json(body): Json<AddReactionRequest>,
) -> Result<StatusCode, StatusCode> {
    let emoji = body.emoji.trim().to_string();
    if emoji.is_empty() || emoji.len() > 64 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let db = state.db.clone();
    let user_id = claims.sub.clone();
    let mid = message_id.clone();
    let emoji_clone = emoji.clone();

    let sender_pubkey = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Look up user's pubkey
        let pubkey: String = conn
            .query_row(
                "SELECT lower(hex(public_key)) FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let msg_id: i64 = mid.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

        // Verify message exists and is not deleted
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE id = ?1 AND deleted = 0",
                rusqlite::params![msg_id],
                |row| row.get::<_, i64>(0).map(|c| c > 0),
            )
            .unwrap_or(false);
        if !exists {
            return Err(StatusCode::NOT_FOUND);
        }

        // Insert reaction (UNIQUE constraint prevents duplicates)
        conn.execute(
            "INSERT OR IGNORE INTO reactions (message_id, user_pubkey, emoji) VALUES (?1, ?2, ?3)",
            rusqlite::params![msg_id, pubkey, emoji_clone],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok(pubkey)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let now_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    // Broadcast reaction added event
    broadcast::broadcast_reaction_added(
        &state.connections,
        proto_chat::ReactionAddedEvent {
            reaction: Some(proto_chat::Reaction {
                message_id,
                user_pubkey: sender_pubkey,
                emoji,
                timestamp: now_millis,
            }),
        },
    );

    Ok(StatusCode::CREATED)
}

/// DELETE /api/messages/{message_id}/reactions/{emoji}
/// Remove own reaction from a message. JWT auth required.
pub async fn remove_reaction(
    State(state): State<AppState>,
    claims: Claims,
    Path((message_id, emoji)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let db = state.db.clone();
    let user_id = claims.sub.clone();
    let mid = message_id.clone();
    let emoji_clone = emoji.clone();

    let sender_pubkey = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Look up user's pubkey
        let pubkey: String = conn
            .query_row(
                "SELECT lower(hex(public_key)) FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| row.get(0),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let msg_id: i64 = mid.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

        // Delete the reaction
        let rows = conn
            .execute(
                "DELETE FROM reactions WHERE message_id = ?1 AND user_pubkey = ?2 AND emoji = ?3",
                rusqlite::params![msg_id, pubkey, emoji_clone],
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        if rows == 0 {
            return Err(StatusCode::NOT_FOUND);
        }

        Ok(pubkey)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    // Broadcast reaction removed event
    broadcast::broadcast_reaction_removed(
        &state.connections,
        proto_chat::ReactionRemovedEvent {
            message_id,
            user_pubkey: sender_pubkey,
            emoji,
        },
    );

    Ok(StatusCode::OK)
}

/// GET /api/messages/{message_id}/reactions
/// List reactions for a message, grouped by emoji.
pub async fn get_reactions(
    State(state): State<AppState>,
    Path(message_id): Path<String>,
) -> Result<Json<Vec<ReactionGroupResponse>>, StatusCode> {
    let db = state.db.clone();
    let mid = message_id;

    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let msg_id: i64 = mid.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

        let mut stmt = conn
            .prepare(
                "SELECT emoji, COUNT(*) as cnt, GROUP_CONCAT(user_pubkey) as pubkeys
                 FROM reactions
                 WHERE message_id = ?1
                 GROUP BY emoji
                 ORDER BY cnt DESC",
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let groups: Vec<ReactionGroupResponse> = stmt
            .query_map(rusqlite::params![msg_id], |row| {
                let emoji: String = row.get(0)?;
                let count: i64 = row.get(1)?;
                let pubkeys_str: String = row.get(2)?;
                let user_pubkeys: Vec<String> =
                    pubkeys_str.split(',').map(|s| s.to_string()).collect();
                Ok(ReactionGroupResponse {
                    emoji,
                    count,
                    user_pubkeys,
                })
            })
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        Ok::<_, StatusCode>(groups)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(result))
}
