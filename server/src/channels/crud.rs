use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::middleware::Claims;
use crate::p2p::SwarmCommand;
use crate::proto::channels as proto_channels;
use crate::proto::ws::{envelope::Payload, Envelope};
use crate::roles::permissions::{require_permission, Permissions};
use crate::state::AppState;
use crate::ws::broadcast::broadcast_to_all;

/// Build a gossipsub topic string for a channel.
/// Format: `{server_peer_id_prefix}/{channel_id}`
fn gossipsub_topic(server_peer_id: &str, channel_id: &str) -> String {
    let prefix = &server_peer_id[..std::cmp::min(16, server_peer_id.len())];
    format!("{}/{}", prefix, channel_id)
}

use super::ordering::next_position;

// --- Response types ---

#[derive(Debug, Serialize, Deserialize)]
pub struct ChannelResponse {
    pub id: String,
    pub name: String,
    pub channel_type: String,
    pub category_id: String,
    pub position: i64,
    pub topic: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryResponse {
    pub id: String,
    pub name: String,
    pub position: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryWithChannelsResponse {
    pub category: CategoryResponse,
    pub channels: Vec<ChannelResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChannelListResponse {
    pub categories: Vec<CategoryWithChannelsResponse>,
}

// --- Request types ---

#[derive(Debug, Deserialize)]
pub struct CreateChannelRequest {
    pub name: String,
    pub channel_type: String,
    pub category_id: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChannelRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct ReorderEntry {
    pub id: String,
    pub position: i64,
}

#[derive(Debug, Deserialize)]
pub struct ReorderRequest {
    pub entries: Vec<ReorderEntry>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryRequest {
    pub name: String,
}

// --- Handlers ---

/// GET /api/channels — List all categories with their channels, ordered by position.
pub async fn list_channels(
    State(state): State<AppState>,
    _claims: Claims,
) -> Result<Json<ChannelListResponse>, StatusCode> {
    let db = state.db.clone();

    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Fetch categories ordered by position
        let mut cat_stmt = conn
            .prepare("SELECT id, name, position FROM categories ORDER BY position ASC")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let categories: Vec<CategoryResponse> = cat_stmt
            .query_map([], |row| {
                Ok(CategoryResponse {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    position: row.get(2)?,
                })
            })
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        // Fetch all channels ordered by category then position
        let mut ch_stmt = conn
            .prepare("SELECT id, name, channel_type, category_id, position, topic FROM channels ORDER BY category_id, position ASC")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let channels: Vec<ChannelResponse> = ch_stmt
            .query_map([], |row| {
                Ok(ChannelResponse {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    channel_type: row.get(2)?,
                    category_id: row.get(3)?,
                    position: row.get(4)?,
                    topic: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                })
            })
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        // Group channels by category
        let mut response = Vec::new();
        for cat in categories {
            let cat_channels: Vec<ChannelResponse> = channels
                .iter()
                .filter(|ch| ch.category_id == cat.id)
                .map(|ch| ChannelResponse {
                    id: ch.id.clone(),
                    name: ch.name.clone(),
                    channel_type: ch.channel_type.clone(),
                    category_id: ch.category_id.clone(),
                    position: ch.position,
                    topic: ch.topic.clone(),
                })
                .collect();

            response.push(CategoryWithChannelsResponse {
                category: cat,
                channels: cat_channels,
            });
        }

        Ok::<_, StatusCode>(ChannelListResponse {
            categories: response,
        })
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(result))
}

/// POST /api/channels — Create a new channel (requires MANAGE_CHANNELS).
pub async fn create_channel(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<CreateChannelRequest>,
) -> Result<(StatusCode, Json<ChannelResponse>), (StatusCode, String)> {
    require_permission(
        &state.db,
        &claims.sub,
        claims.is_owner,
        Permissions::MANAGE_CHANNELS,
    )
    .await
    .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    if req.name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Channel name cannot be empty".to_string(),
        ));
    }

    let db = state.db.clone();
    let name = req.name.clone();
    let channel_type = req.channel_type.clone();
    let category_id = req.category_id.clone();

    let channel = tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        // Verify category exists
        let cat_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM categories WHERE id = ?1",
                [&category_id],
                |row| row.get::<_, i64>(0).map(|c| c > 0),
            )
            .unwrap_or(false);

        if !cat_exists {
            return Err((
                StatusCode::BAD_REQUEST,
                "Category not found".to_string(),
            ));
        }

        // Get next position within category
        let max_pos: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), 0) FROM channels WHERE category_id = ?1",
                [&category_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let channel_id = Uuid::now_v7().to_string();
        let now = Utc::now().to_rfc3339();
        let position = next_position(max_pos);

        conn.execute(
            "INSERT INTO channels (id, name, channel_type, category_id, position, topic, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![channel_id, name, channel_type, category_id, position, "", now],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Insert channel: {}", e)))?;

        Ok::<_, (StatusCode, String)>(ChannelResponse {
            id: channel_id,
            name,
            channel_type,
            category_id,
            position,
            topic: String::new(),
        })
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast ChannelCreatedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::ChannelCreatedEvent(
            proto_channels::ChannelCreatedEvent {
                channel: Some(proto_channels::Channel {
                    id: channel.id.clone(),
                    name: channel.name.clone(),
                    channel_type: channel.channel_type.clone(),
                    category_id: channel.category_id.clone(),
                    position: channel.position,
                    topic: channel.topic.clone(),
                }),
            },
        )),
    };
    broadcast_to_all(&state.connections, &event);

    // Subscribe the server's gossipsub to the new channel topic
    let topic = gossipsub_topic(&state.server_peer_id, &channel.id);
    let _ = state.swarm_cmd_tx.send(SwarmCommand::SubscribeTopic(topic));

    Ok((StatusCode::CREATED, Json(channel)))
}

/// PUT /api/channels/{id} — Rename a channel (requires MANAGE_CHANNELS).
pub async fn update_channel(
    State(state): State<AppState>,
    claims: Claims,
    Path(channel_id): Path<String>,
    Json(req): Json<UpdateChannelRequest>,
) -> Result<Json<ChannelResponse>, (StatusCode, String)> {
    require_permission(
        &state.db,
        &claims.sub,
        claims.is_owner,
        Permissions::MANAGE_CHANNELS,
    )
    .await
    .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let cid = channel_id.clone();
    let name = req.name.clone();

    let channel = tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        // Update name
        let rows = conn
            .execute(
                "UPDATE channels SET name = ?1 WHERE id = ?2",
                rusqlite::params![name, cid],
            )
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Update channel: {}", e),
                )
            })?;

        if rows == 0 {
            return Err((StatusCode::NOT_FOUND, "Channel not found".to_string()));
        }

        // Read back
        conn.query_row(
            "SELECT id, name, channel_type, category_id, position, topic FROM channels WHERE id = ?1",
            [&cid],
            |row| {
                Ok(ChannelResponse {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    channel_type: row.get(2)?,
                    category_id: row.get(3)?,
                    position: row.get(4)?,
                    topic: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                })
            },
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Read channel: {}", e)))
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast ChannelUpdatedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::ChannelUpdatedEvent(
            proto_channels::ChannelUpdatedEvent {
                channel: Some(proto_channels::Channel {
                    id: channel.id.clone(),
                    name: channel.name.clone(),
                    channel_type: channel.channel_type.clone(),
                    category_id: channel.category_id.clone(),
                    position: channel.position,
                    topic: channel.topic.clone(),
                }),
            },
        )),
    };
    broadcast_to_all(&state.connections, &event);

    Ok(Json(channel))
}

/// DELETE /api/channels/{id} — Delete a channel (requires MANAGE_CHANNELS).
pub async fn delete_channel(
    State(state): State<AppState>,
    claims: Claims,
    Path(channel_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_permission(
        &state.db,
        &claims.sub,
        claims.is_owner,
        Permissions::MANAGE_CHANNELS,
    )
    .await
    .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let cid = channel_id.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        let rows = conn
            .execute("DELETE FROM channels WHERE id = ?1", [&cid])
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Delete channel: {}", e),
                )
            })?;

        if rows == 0 {
            return Err((StatusCode::NOT_FOUND, "Channel not found".to_string()));
        }

        Ok::<_, (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast ChannelDeletedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::ChannelDeletedEvent(
            proto_channels::ChannelDeletedEvent {
                channel_id: channel_id.clone(),
            },
        )),
    };
    broadcast_to_all(&state.connections, &event);

    // Unsubscribe the server's gossipsub from the deleted channel topic
    let topic = gossipsub_topic(&state.server_peer_id, &channel_id);
    let _ = state.swarm_cmd_tx.send(SwarmCommand::UnsubscribeTopic(topic));

    Ok(StatusCode::OK)
}

/// PUT /api/channels/reorder — Update channel positions (requires MANAGE_CHANNELS).
pub async fn reorder_channels(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<ReorderRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_permission(
        &state.db,
        &claims.sub,
        claims.is_owner,
        Permissions::MANAGE_CHANNELS,
    )
    .await
    .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        for entry in &req.entries {
            conn.execute(
                "UPDATE channels SET position = ?1 WHERE id = ?2",
                rusqlite::params![entry.position, entry.id],
            )
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Reorder channel: {}", e),
                )
            })?;
        }

        Ok::<_, (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    Ok(StatusCode::OK)
}

/// POST /api/categories — Create a new category (requires MANAGE_CHANNELS).
pub async fn create_category(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<CreateCategoryRequest>,
) -> Result<(StatusCode, Json<CategoryResponse>), (StatusCode, String)> {
    require_permission(
        &state.db,
        &claims.sub,
        claims.is_owner,
        Permissions::MANAGE_CHANNELS,
    )
    .await
    .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    if req.name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Category name cannot be empty".to_string(),
        ));
    }

    let db = state.db.clone();
    let name = req.name.clone();

    let category = tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        let max_pos: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), 0) FROM categories",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let cat_id = Uuid::now_v7().to_string();
        let now = Utc::now().to_rfc3339();
        let position = next_position(max_pos);

        conn.execute(
            "INSERT INTO categories (id, name, position, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![cat_id, name, position, now],
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Insert category: {}", e),
            )
        })?;

        Ok::<_, (StatusCode, String)>(CategoryResponse {
            id: cat_id,
            name,
            position,
        })
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast CategoryCreatedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::CategoryCreatedEvent(
            proto_channels::CategoryCreatedEvent {
                category: Some(proto_channels::Category {
                    id: category.id.clone(),
                    name: category.name.clone(),
                    position: category.position,
                }),
            },
        )),
    };
    broadcast_to_all(&state.connections, &event);

    Ok((StatusCode::CREATED, Json(category)))
}

/// DELETE /api/categories/{id} — Delete a category (requires MANAGE_CHANNELS).
/// Fails with 400 if the category still has channels.
pub async fn delete_category(
    State(state): State<AppState>,
    claims: Claims,
    Path(category_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_permission(
        &state.db,
        &claims.sub,
        claims.is_owner,
        Permissions::MANAGE_CHANNELS,
    )
    .await
    .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let cid = category_id.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        // Check if category has channels
        let channel_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channels WHERE category_id = ?1",
                [&cid],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if channel_count > 0 {
            return Err((
                StatusCode::BAD_REQUEST,
                "Cannot delete category with channels".to_string(),
            ));
        }

        let rows = conn
            .execute("DELETE FROM categories WHERE id = ?1", [&cid])
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Delete category: {}", e),
                )
            })?;

        if rows == 0 {
            return Err((StatusCode::NOT_FOUND, "Category not found".to_string()));
        }

        Ok::<_, (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast CategoryDeletedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::CategoryDeletedEvent(
            proto_channels::CategoryDeletedEvent {
                category_id: category_id.clone(),
            },
        )),
    };
    broadcast_to_all(&state.connections, &event);

    Ok(StatusCode::OK)
}
