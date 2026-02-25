use prost::Message as ProstMessage;

use crate::proto::ws::Envelope;
use super::ConnectionRegistry;

/// Broadcast a protobuf envelope to all connected users.
pub fn broadcast_to_all(registry: &ConnectionRegistry, envelope: &Envelope) {
    let mut buf = Vec::with_capacity(envelope.encoded_len());
    if envelope.encode(&mut buf).is_err() {
        return;
    }
    let msg = axum::extract::ws::Message::Binary(buf.into());

    for entry in registry.iter() {
        for sender in entry.value().iter() {
            let _ = sender.send(msg.clone());
        }
    }
}

/// Send a protobuf envelope to a specific user (all their connections).
pub fn send_to_user(registry: &ConnectionRegistry, user_id: &str, envelope: &Envelope) {
    let mut buf = Vec::with_capacity(envelope.encoded_len());
    if envelope.encode(&mut buf).is_err() {
        return;
    }
    let msg = axum::extract::ws::Message::Binary(buf.into());

    if let Some(connections) = registry.get(user_id) {
        for sender in connections.value().iter() {
            let _ = sender.send(msg.clone());
        }
    }
}

/// Force-close all connections for a user (kick/ban).
/// Sends a WebSocket Close frame with the given code and reason.
pub fn force_close_user(
    registry: &ConnectionRegistry,
    user_id: &str,
    close_code: u16,
    reason: &str,
) {
    if let Some(connections) = registry.get(user_id) {
        let close_frame = axum::extract::ws::CloseFrame {
            code: close_code,
            reason: reason.into(),
        };
        for sender in connections.value().iter() {
            let _ = sender.send(axum::extract::ws::Message::Close(Some(close_frame.clone())));
        }
    }
}
