use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::middleware::Claims;
use crate::proto::moderation as proto_mod;
use crate::proto::ws::{envelope::Payload, Envelope};
use crate::roles::permissions::{require_permission, Permissions};
use crate::state::AppState;
use crate::ws::broadcast::{broadcast_to_all, force_close_user};

#[derive(Debug, Deserialize)]
pub struct BanRequest {
    pub user_id: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub expires_at: String,
}

#[derive(Debug, Serialize)]
pub struct BanResponse {
    pub ban_id: String,
}

#[derive(Debug, Deserialize)]
pub struct UnbanRequest {
    pub fingerprint: String,
}

#[derive(Debug, Serialize)]
pub struct BanInfoResponse {
    pub id: String,
    pub fingerprint: String,
    pub banned_by: String,
    pub reason: String,
    pub expires_at: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct BanListResponse {
    pub bans: Vec<BanInfoResponse>,
}

/// POST /api/moderation/ban — Ban a user (requires BAN_MEMBERS).
pub async fn ban_user(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<BanRequest>,
) -> Result<Json<BanResponse>, (StatusCode, String)> {
    require_permission(
        &state.db,
        &claims.sub,
        claims.is_owner,
        Permissions::BAN_MEMBERS,
    )
    .await
    .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let target_id = req.user_id.clone();
    let banned_by = claims.sub.clone();
    let reason = req.reason.clone();
    let expires_at = req.expires_at.clone();

    let (ban_id, _fingerprint) = tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        // Look up target user
        let (is_owner, fingerprint): (bool, String) = conn
            .query_row(
                "SELECT is_owner, fingerprint FROM users WHERE id = ?1",
                [&target_id],
                |row| Ok((row.get::<_, bool>(0)?, row.get(1)?)),
            )
            .map_err(|_| (StatusCode::NOT_FOUND, "User not found".to_string()))?;

        if is_owner {
            return Err((
                StatusCode::FORBIDDEN,
                "Cannot ban the server owner".to_string(),
            ));
        }

        let ban_id = Uuid::now_v7().to_string();
        let now = Utc::now().to_rfc3339();
        let exp = if expires_at.is_empty() {
            None
        } else {
            Some(expires_at.as_str())
        };

        conn.execute(
            "INSERT OR REPLACE INTO bans (id, fingerprint, banned_by, reason, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![ban_id, fingerprint, banned_by, reason, exp, now],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Insert ban: {}", e)))?;

        Ok::<_, (StatusCode, String)>((ban_id, fingerprint))
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Force-close WS with 4003
    let close_reason = if req.reason.is_empty() {
        "You have been banned from this server".to_string()
    } else {
        format!("Banned: {}", req.reason)
    };
    force_close_user(&state.connections, &req.user_id, 4003, &close_reason);

    // Broadcast UserBannedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::UserBannedEvent(proto_mod::UserBannedEvent {
            user_id: req.user_id.clone(),
            reason: req.reason.clone(),
        })),
    };
    broadcast_to_all(&state.connections, &event);

    Ok(Json(BanResponse { ban_id }))
}

/// POST /api/moderation/unban — Unban a user by fingerprint (requires BAN_MEMBERS).
pub async fn unban_user(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<UnbanRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_permission(
        &state.db,
        &claims.sub,
        claims.is_owner,
        Permissions::BAN_MEMBERS,
    )
    .await
    .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let fingerprint = req.fingerprint.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;
        conn.execute("DELETE FROM bans WHERE fingerprint = ?1", [&fingerprint])
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Delete ban: {}", e),
                )
            })?;
        Ok::<_, (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast UserUnbannedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::UserUnbannedEvent(proto_mod::UserUnbannedEvent {
            fingerprint: req.fingerprint.clone(),
        })),
    };
    broadcast_to_all(&state.connections, &event);

    Ok(StatusCode::OK)
}

/// GET /api/moderation/bans — List active (non-expired) bans (requires BAN_MEMBERS).
/// Also performs lazy cleanup of expired bans.
pub async fn list_bans(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<BanListResponse>, (StatusCode, String)> {
    require_permission(
        &state.db,
        &claims.sub,
        claims.is_owner,
        Permissions::BAN_MEMBERS,
    )
    .await
    .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();

    let bans = tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        // Lazy cleanup: delete expired bans
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "DELETE FROM bans WHERE expires_at IS NOT NULL AND expires_at <= ?1",
            [&now],
        )
        .ok();

        // Fetch remaining active bans
        let mut stmt = conn
            .prepare("SELECT id, fingerprint, banned_by, reason, expires_at, created_at FROM bans")
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Query bans".to_string()))?;

        let bans: Vec<BanInfoResponse> = stmt
            .query_map([], |row| {
                Ok(BanInfoResponse {
                    id: row.get(0)?,
                    fingerprint: row.get(1)?,
                    banned_by: row.get(2)?,
                    reason: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    expires_at: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                    created_at: row.get(5)?,
                })
            })
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Read bans".to_string()))?
            .filter_map(|r| r.ok())
            .collect();

        Ok::<_, (StatusCode, String)>(bans)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    Ok(Json(BanListResponse { bans }))
}

/// Check if a user is banned by fingerprint.
/// Performs lazy cleanup of expired bans first.
/// Returns Some(reason) if banned, None if not banned.
pub fn check_ban(conn: &rusqlite::Connection, fingerprint: &str) -> Option<String> {
    let now = Utc::now().to_rfc3339();

    // Lazy cleanup of expired bans
    conn.execute(
        "DELETE FROM bans WHERE expires_at IS NOT NULL AND expires_at <= ?1",
        [&now],
    )
    .ok();

    // Check for active ban
    conn.query_row(
        "SELECT COALESCE(reason, '') FROM bans WHERE fingerprint = ?1",
        [fingerprint],
        |row| row.get::<_, String>(0),
    )
    .ok()
}
