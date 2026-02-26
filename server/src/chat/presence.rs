//! Server-side presence tracking and broadcast.
//!
//! In-memory presence store (DashMap) keyed by user pubkey.
//! Broadcasts PresenceUpdateEvent over WebSocket on state changes.
//! REST endpoints for get/set presence and typing indicators.

use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::auth::middleware::Claims;
use crate::chat::broadcast::{broadcast_presence_update, broadcast_typing_indicator};
use crate::state::AppState;

/// Presence status values — matches proto PresenceStatus enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PresenceStatus {
    Online = 1,
    Away = 2,
    Dnd = 3,
    Offline = 4,
}

impl PresenceStatus {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "online" => Some(Self::Online),
            "away" => Some(Self::Away),
            "dnd" => Some(Self::Dnd),
            "offline" => Some(Self::Offline),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Online => "online",
            Self::Away => "away",
            Self::Dnd => "dnd",
            Self::Offline => "offline",
        }
    }

    pub fn as_proto_i32(&self) -> i32 {
        *self as i32
    }
}

/// Info tracked per user in the presence map.
#[derive(Debug, Clone)]
pub struct PresenceInfo {
    pub status: PresenceStatus,
    pub user_pubkey: String,
    pub display_name: String,
}

// --- Functions called from WS actor lifecycle ---

/// Set user presence and broadcast to all WS clients.
/// Called on WS connect/disconnect and from REST endpoint.
pub fn set_user_presence(
    state: &AppState,
    user_pubkey: &str,
    display_name: &str,
    status: PresenceStatus,
) {
    // Update the in-memory presence map
    state.presence.insert(
        user_pubkey.to_string(),
        PresenceInfo {
            status,
            user_pubkey: user_pubkey.to_string(),
            display_name: display_name.to_string(),
        },
    );

    // Broadcast to all WS clients
    let now_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    broadcast_presence_update(
        &state.connections,
        user_pubkey,
        display_name,
        status.as_proto_i32(),
        now_millis,
    );
}

/// Get current presence for all tracked users.
/// Used for initial snapshot when a client connects.
pub fn get_all_presence(state: &AppState) -> Vec<PresenceInfo> {
    state
        .presence
        .iter()
        .map(|entry| entry.value().clone())
        .collect()
}

// --- REST endpoint handlers ---

#[derive(Debug, Serialize)]
pub struct PresenceResponse {
    pub user_pubkey: String,
    pub display_name: String,
    pub status: String,
}

/// GET /api/presence — Returns current presence for all tracked users. JWT auth required.
pub async fn get_presence(
    State(state): State<AppState>,
    _claims: Claims,
) -> Json<Vec<PresenceResponse>> {
    let entries: Vec<PresenceResponse> = state
        .presence
        .iter()
        .map(|entry| {
            let info = entry.value();
            PresenceResponse {
                user_pubkey: info.user_pubkey.clone(),
                display_name: info.display_name.clone(),
                status: info.status.as_str().to_string(),
            }
        })
        .collect();

    Json(entries)
}

#[derive(Debug, Deserialize)]
pub struct SetPresenceRequest {
    pub status: String,
}

/// POST /api/presence — Set own presence status. JWT auth required.
/// Body: { "status": "online"|"away"|"dnd" }
pub async fn set_presence(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<SetPresenceRequest>,
) -> Result<StatusCode, StatusCode> {
    let status = PresenceStatus::from_str(&body.status)
        .ok_or(StatusCode::BAD_REQUEST)?;

    // Look up the user's pubkey and display_name from DB
    let db = state.db.clone();
    let user_id = claims.sub.clone();

    let (pubkey_hex, display_name) = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let (dn, pk): (String, String) = conn
            .query_row(
                "SELECT display_name, lower(hex(public_key)) FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        Ok::<_, StatusCode>((pk, dn))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    set_user_presence(&state, &pubkey_hex, &display_name, status);

    Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
pub struct SendTypingRequest {
    pub channel_id: String,
}

/// POST /api/typing — Send typing indicator. JWT auth required.
/// Body: { "channel_id": "..." }
pub async fn send_typing(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<SendTypingRequest>,
) -> Result<StatusCode, StatusCode> {
    let db = state.db.clone();
    let user_id = claims.sub.clone();

    let (pubkey_hex, display_name) = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let (dn, pk): (String, String) = conn
            .query_row(
                "SELECT display_name, lower(hex(public_key)) FROM users WHERE id = ?1",
                rusqlite::params![user_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        Ok::<_, StatusCode>((pk, dn))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let now_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    broadcast_typing_indicator(
        &state.connections,
        &pubkey_hex,
        &body.channel_id,
        &display_name,
        now_millis,
    );

    Ok(StatusCode::OK)
}
