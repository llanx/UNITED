use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;

use crate::auth::middleware::Claims;
use crate::proto::moderation as proto_mod;
use crate::proto::ws::{envelope::Payload, Envelope};
use crate::roles::permissions::{require_permission, Permissions};
use crate::state::AppState;
use crate::ws::broadcast::{broadcast_to_all, force_close_user};

#[derive(Debug, Deserialize)]
pub struct KickRequest {
    pub user_id: String,
}

/// POST /api/moderation/kick — Kick a user (requires KICK_MEMBERS).
/// Soft removal: force-closes WS with 4004, user can rejoin.
pub async fn kick_user(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<KickRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_permission(
        &state.db,
        &claims.sub,
        claims.is_owner,
        Permissions::KICK_MEMBERS,
    )
    .await
    .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    // Cannot kick the owner
    let db = state.db.clone();
    let target_id = req.user_id.clone();

    let is_target_owner = tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;
        let is_owner: bool = conn
            .query_row(
                "SELECT is_owner FROM users WHERE id = ?1",
                [&target_id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|_| (StatusCode::NOT_FOUND, "User not found".to_string()))?;
        Ok::<_, (StatusCode, String)>(is_owner)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    if is_target_owner {
        return Err((
            StatusCode::FORBIDDEN,
            "Cannot kick the server owner".to_string(),
        ));
    }

    // Force-close WS connections with 4004
    force_close_user(
        &state.connections,
        &req.user_id,
        4004,
        "You have been kicked from this server",
    );

    // Broadcast UserKickedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::UserKickedEvent(proto_mod::UserKickedEvent {
            user_id: req.user_id.clone(),
            reason: String::new(),
        })),
    };
    broadcast_to_all(&state.connections, &event);

    Ok(StatusCode::OK)
}
