use dashmap::DashMap;
use std::sync::Arc;

use crate::db::DbPool;
use crate::ws::ConnectionRegistry;

/// Challenge stored in memory with expiry
#[derive(Debug, Clone)]
pub struct ChallengeEntry {
    pub bytes: Vec<u8>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

/// Shared application state passed to all handlers via axum State extractor.
#[derive(Clone)]
pub struct AppState {
    /// SQLite connection wrapped in Arc<Mutex>
    pub db: DbPool,
    /// In-memory challenge store (DashMap for concurrent access)
    pub challenges: Arc<DashMap<String, ChallengeEntry>>,
    /// JWT signing secret (256-bit random key)
    pub jwt_secret: Vec<u8>,
    /// AES-256-GCM encryption key for TOTP secrets (256-bit random key)
    pub encryption_key: Vec<u8>,
    /// Active WebSocket connections per user
    pub connections: ConnectionRegistry,
    /// Server config
    pub registration_mode: String,
}
