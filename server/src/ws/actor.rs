use axum::extract::ws::{CloseFrame, Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use prost::Message as ProstMessage;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::{interval, timeout};

use crate::chat::presence::{self, PresenceStatus};
use crate::proto::ws::Envelope;
use crate::state::AppState;
use crate::ws::protocol;
use crate::ws::ConnectionSender;

/// Ping interval: server sends WebSocket ping every 30 seconds.
/// Per Pitfall 5: prevents connection leaks from abrupt disconnects.
const PING_INTERVAL: Duration = Duration::from_secs(30);

/// Pong timeout: if pong not received within 10 seconds after ping, close.
const PONG_TIMEOUT: Duration = Duration::from_secs(10);

/// Run the actor-per-connection pattern for an authenticated WebSocket.
///
/// Splits the WebSocket into reader and writer halves:
/// - Writer task: owns the sink, forwards messages from an mpsc channel
/// - Reader task: processes incoming messages, dispatches to protocol handlers
///
/// The mpsc channel allows any part of the system to send messages to this client
/// by cloning the sender.
pub async fn run_connection(
    socket: WebSocket,
    state: AppState,
    user_id: String,
    fingerprint: String,
) {
    let (ws_sender, mut ws_receiver) = socket.split();
    let (tx, rx) = mpsc::unbounded_channel::<Message>();

    // Register this connection in the connection registry
    register_connection(&state, &user_id, tx.clone());

    // Look up user's pubkey and display_name for presence broadcast
    let (user_pubkey, display_name) = {
        let db = state.db.clone();
        let uid = user_id.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().ok()?;
            conn.query_row(
                "SELECT lower(hex(public_key)), display_name FROM users WHERE id = ?1",
                rusqlite::params![uid],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .ok()
        })
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| (fingerprint.clone(), "Unknown".to_string()))
    };

    // Broadcast ONLINE presence to all clients
    presence::set_user_presence(&state, &user_pubkey, &display_name, PresenceStatus::Online);

    // Send the current presence snapshot to the newly connected client
    {
        let all_presence = presence::get_all_presence(&state);
        for info in &all_presence {
            let update = crate::proto::presence::PresenceUpdateEvent {
                update: Some(crate::proto::presence::PresenceUpdate {
                    user_pubkey: info.user_pubkey.clone(),
                    display_name: info.display_name.clone(),
                    status: info.status.as_proto_i32(),
                    timestamp: 0,
                }),
            };
            let envelope = Envelope {
                request_id: String::new(),
                payload: Some(crate::proto::ws::envelope::Payload::PresenceUpdateEvent(update)),
            };
            let mut buf = Vec::with_capacity(envelope.encoded_len());
            if envelope.encode(&mut buf).is_ok() {
                let _ = tx.send(Message::Binary(buf.into()));
            }
        }
    }

    tracing::info!(
        user_id = %user_id,
        fingerprint = %fingerprint,
        "WebSocket actor started"
    );

    // Spawn writer task: forwards mpsc messages to WebSocket sink
    let writer_handle = tokio::spawn(writer_task(ws_sender, rx));

    // Track pong reception
    let (pong_tx, mut pong_rx) = mpsc::unbounded_channel::<()>();

    // Spawn ping task: sends periodic pings and monitors pong responses
    let ping_tx = tx.clone();
    let ping_handle = tokio::spawn(async move {
        let mut ping_timer = interval(PING_INTERVAL);
        // Skip the first immediate tick
        ping_timer.tick().await;

        loop {
            ping_timer.tick().await;

            // Send ping
            if ping_tx.send(Message::Ping(vec![1, 2, 3, 4].into())).is_err() {
                // Writer task has died — connection is gone
                break;
            }

            // Wait for pong within timeout
            match timeout(PONG_TIMEOUT, pong_rx.recv()).await {
                Ok(Some(())) => {
                    // Pong received, continue
                }
                _ => {
                    // Pong timeout or channel closed — close connection
                    tracing::warn!("Pong timeout, closing connection");
                    let _ = ping_tx.send(Message::Close(Some(CloseFrame {
                        code: 1001,
                        reason: "Pong timeout".into(),
                    })));
                    break;
                }
            }
        }
    });

    // Reader loop: process incoming WebSocket messages
    loop {
        match ws_receiver.next().await {
            Some(Ok(msg)) => match msg {
                Message::Binary(data) => {
                    // Decode protobuf envelope and dispatch
                    protocol::handle_binary_message(&data, &tx, &state, &user_id).await;
                }
                Message::Text(text) => {
                    // We use binary protobuf, but handle text gracefully
                    tracing::debug!(
                        user_id = %user_id,
                        "Received text message (expected binary protobuf): {}",
                        text.chars().take(100).collect::<String>()
                    );
                }
                Message::Pong(_) => {
                    // Pong received — notify the ping task
                    let _ = pong_tx.send(());
                }
                Message::Ping(data) => {
                    // Respond to client pings with pong
                    let _ = tx.send(Message::Pong(data));
                }
                Message::Close(frame) => {
                    tracing::info!(
                        user_id = %user_id,
                        reason = ?frame,
                        "Client initiated close"
                    );
                    break;
                }
            },
            Some(Err(e)) => {
                tracing::warn!(
                    user_id = %user_id,
                    error = %e,
                    "WebSocket receive error"
                );
                break;
            }
            None => {
                // Stream ended — client disconnected
                tracing::info!(user_id = %user_id, "WebSocket stream ended");
                break;
            }
        }
    }

    // Cleanup: abort writer and ping tasks
    writer_handle.abort();
    ping_handle.abort();

    // Remove this connection from the registry
    unregister_connection(&state, &user_id, &tx);

    // Only broadcast OFFLINE if this was the user's last connection
    let has_remaining = state
        .connections
        .get(&user_id)
        .map(|v| !v.is_empty())
        .unwrap_or(false);

    if !has_remaining {
        presence::set_user_presence(&state, &user_pubkey, &display_name, PresenceStatus::Offline);
    }

    tracing::info!(
        user_id = %user_id,
        fingerprint = %fingerprint,
        "WebSocket actor stopped"
    );
}

/// Writer task: receives messages from mpsc channel and forwards them to the WebSocket sink.
async fn writer_task(
    mut ws_sender: futures_util::stream::SplitSink<WebSocket, Message>,
    mut rx: mpsc::UnboundedReceiver<Message>,
) {
    while let Some(msg) = rx.recv().await {
        if ws_sender.send(msg).await.is_err() {
            // WebSocket send failed — connection is broken
            break;
        }
    }
}

/// Register a connection sender in the connection registry.
fn register_connection(state: &AppState, user_id: &str, tx: ConnectionSender) {
    state
        .connections
        .entry(user_id.to_string())
        .or_default()
        .push(tx);

    let conn_count = state
        .connections
        .get(user_id)
        .map(|v| v.len())
        .unwrap_or(0);
    tracing::debug!(
        user_id = %user_id,
        connections = conn_count,
        "Connection registered"
    );
}

/// Remove closed connections from the registry for a user.
/// After the reader loop exits, the tx sender is dropped, so any
/// corresponding receivers are closed. We remove senders that are closed.
fn unregister_connection(state: &AppState, user_id: &str, _tx: &ConnectionSender) {
    let mut remove_user = false;

    if let Some(mut connections) = state.connections.get_mut(user_id) {
        // Remove senders that are closed (the receiver has been dropped)
        connections.retain(|sender| !sender.is_closed());
        if connections.is_empty() {
            remove_user = true;
        }
    }

    if remove_user {
        state.connections.remove(user_id);
    }

    tracing::debug!(
        user_id = %user_id,
        "Connection unregistered"
    );
}
