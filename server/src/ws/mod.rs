pub mod actor;
pub mod handler;
pub mod protocol;

use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Type alias for the sender half of a WebSocket connection's channel.
/// Other parts of the system can clone this to push messages to a specific client.
pub type ConnectionSender = mpsc::UnboundedSender<axum::extract::ws::Message>;

/// Connection registry: tracks all active WebSocket connections per user.
/// A user can have multiple concurrent connections (multiple devices/tabs).
/// Arc<DashMap<UserId, Vec<ConnectionSender>>>
pub type ConnectionRegistry = Arc<DashMap<String, Vec<ConnectionSender>>>;

/// Create a new empty connection registry.
pub fn new_connection_registry() -> ConnectionRegistry {
    Arc::new(DashMap::new())
}
