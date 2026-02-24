use axum::extract::ws::Message;
use prost::Message as ProstMessage;
use tokio::sync::mpsc;

use crate::proto::ws::{
    envelope::Payload, ErrorResponse, Envelope, ServerInfoResponse,
};
use crate::proto::server::ServerInfo;
use crate::state::AppState;

/// Handle an incoming binary (protobuf) message.
/// Decodes the Envelope, dispatches based on payload type, sends response.
pub async fn handle_binary_message(
    data: &[u8],
    tx: &mpsc::UnboundedSender<Message>,
    state: &AppState,
    user_id: &str,
) {
    // Decode the protobuf Envelope
    let envelope = match Envelope::decode(data) {
        Ok(env) => env,
        Err(e) => {
            tracing::warn!(
                user_id = %user_id,
                error = %e,
                "Failed to decode protobuf Envelope"
            );
            send_error(tx, "", 400, "Invalid protobuf message");
            return;
        }
    };

    let request_id = envelope.request_id.clone();

    // Dispatch based on payload type
    match envelope.payload {
        Some(payload) => {
            dispatch_payload(payload, &request_id, tx, state, user_id).await;
        }
        None => {
            send_error(tx, &request_id, 400, "Empty payload");
        }
    }
}

/// Dispatch a decoded payload to the appropriate handler.
async fn dispatch_payload(
    payload: Payload,
    request_id: &str,
    tx: &mpsc::UnboundedSender<Message>,
    state: &AppState,
    user_id: &str,
) {
    match payload {
        Payload::ServerInfoRequest(_) => {
            handle_server_info_request(request_id, tx, state).await;
        }
        // Future payload types will be dispatched here as they're implemented.
        // For Phase 1, we support server info over WS as a proof of the dispatch pattern.
        _ => {
            tracing::debug!(
                user_id = %user_id,
                request_id = %request_id,
                "Unhandled payload type"
            );
            send_error(tx, request_id, 501, "Payload type not yet implemented");
        }
    }
}

/// Handle a ServerInfoRequest: return server name, description, version.
async fn handle_server_info_request(
    request_id: &str,
    tx: &mpsc::UnboundedSender<Message>,
    state: &AppState,
) {
    let db = state.db.clone();
    let req_id = request_id.to_string();

    let info = tokio::task::spawn_blocking(move || {
        let conn = db.lock().ok()?;

        let name = conn
            .query_row(
                "SELECT value FROM server_settings WHERE key = 'name'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_else(|_| {
                hostname::get()
                    .ok()
                    .and_then(|h| h.into_string().ok())
                    .unwrap_or_else(|| "UNITED Server".to_string())
            });

        let description = conn
            .query_row(
                "SELECT value FROM server_settings WHERE key = 'description'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_default();

        let registration_mode = conn
            .query_row(
                "SELECT value FROM server_settings WHERE key = 'registration_mode'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "open".to_string());

        let reg_mode = match registration_mode.as_str() {
            "invite-only" => 2,
            _ => 1, // open
        };

        Some(ServerInfo {
            name,
            description,
            icon_data: vec![],
            registration_mode: reg_mode,
            version: env!("CARGO_PKG_VERSION").to_string(),
        })
    })
    .await
    .ok()
    .flatten();

    match info {
        Some(server_info) => {
            let response = Envelope {
                request_id: req_id,
                payload: Some(Payload::ServerInfoResponse(ServerInfoResponse {
                    info: Some(server_info),
                })),
            };
            send_envelope(tx, &response);
        }
        None => {
            send_error(tx, request_id, 500, "Failed to retrieve server info");
        }
    }
}

/// Encode and send an Envelope as a binary WebSocket message.
fn send_envelope(tx: &mpsc::UnboundedSender<Message>, envelope: &Envelope) {
    let mut buf = Vec::with_capacity(envelope.encoded_len());
    if envelope.encode(&mut buf).is_ok() {
        let _ = tx.send(Message::Binary(buf.into()));
    }
}

/// Send an error response envelope.
fn send_error(
    tx: &mpsc::UnboundedSender<Message>,
    request_id: &str,
    code: u32,
    message: &str,
) {
    let envelope = Envelope {
        request_id: request_id.to_string(),
        payload: Some(Payload::Error(ErrorResponse {
            code,
            message: message.to_string(),
            request_id: request_id.to_string(),
        })),
    };
    send_envelope(tx, &envelope);
}
