use axum::{
    extract::{
        ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
};
use serde::Deserialize;

use crate::auth::jwt;
use crate::state::AppState;
use crate::ws::actor;

/// Query parameters for WebSocket connection.
/// Auth is via query param ?token=JWT per CONTEXT.md decision.
#[derive(Debug, Deserialize)]
pub struct WsAuthQuery {
    pub token: String,
}

/// WebSocket close codes per CONTEXT.md:
/// 4001 = token expired
/// 4002 = token invalid
/// 4003 = banned
const CLOSE_TOKEN_EXPIRED: u16 = 4001;
const CLOSE_TOKEN_INVALID: u16 = 4002;
#[allow(dead_code)]
const CLOSE_BANNED: u16 = 4003;

/// GET /ws?token=JWT
/// WebSocket upgrade endpoint. Authenticates via query parameter.
/// On auth failure, upgrades then immediately closes with appropriate close code.
/// On success, spawns an actor for the connection.
pub async fn ws_upgrade(
    State(state): State<AppState>,
    Query(params): Query<WsAuthQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    // Validate JWT from query parameter
    let claims = jwt::validate_access_token(&state.jwt_secret, &params.token);

    match claims {
        Ok(claims) => {
            tracing::info!(
                user_id = %claims.sub,
                fingerprint = %claims.fingerprint,
                "WebSocket connection authenticated"
            );
            ws.on_upgrade(move |socket| {
                handle_authenticated(socket, state, claims.sub, claims.fingerprint)
            })
        }
        Err(err) => {
            // Determine close code based on error type
            let (close_code, reason) = match err.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => {
                    (CLOSE_TOKEN_EXPIRED, "Token expired")
                }
                _ => (CLOSE_TOKEN_INVALID, "Token invalid"),
            };

            tracing::warn!(
                close_code = close_code,
                reason = reason,
                "WebSocket auth failed"
            );

            // Upgrade the connection, then immediately close with the error code
            ws.on_upgrade(move |mut socket| async move {
                let close_frame = CloseFrame {
                    code: close_code,
                    reason: reason.into(),
                };
                // Send a Close message with the appropriate close code
                let _ = socket.send(Message::Close(Some(close_frame))).await;
            })
        }
    }
}

/// Handle an authenticated WebSocket connection by spawning the actor.
async fn handle_authenticated(
    socket: WebSocket,
    state: AppState,
    user_id: String,
    fingerprint: String,
) {
    actor::run_connection(socket, state, user_id, fingerprint).await;
}
