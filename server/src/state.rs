use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::mpsc;

use crate::chat::presence::PresenceInfo;
use crate::config::TurnConfig;
use crate::db::DbPool;
use crate::p2p::{PeerDirectory, SwarmCommand};
use crate::voice::state::VoiceState;
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
    /// Channel for sending commands to the libp2p Swarm event loop
    pub swarm_cmd_tx: mpsc::UnboundedSender<SwarmCommand>,
    /// Shared peer directory tracking online peers
    pub peer_directory: Arc<PeerDirectory>,
    /// Server's libp2p PeerId as a string
    pub server_peer_id: String,
    /// Configured libp2p port (for P2P info endpoint)
    pub libp2p_port: u16,
    /// In-memory presence tracking: user_pubkey -> PresenceInfo
    pub presence: Arc<DashMap<String, PresenceInfo>>,
    /// Data directory path (for block file storage)
    pub data_dir: String,
    /// Block retention TTL in days (from config, default 30)
    pub block_retention_days: Option<u32>,
    /// Block retention cleanup interval in seconds (from config, default 3600)
    pub block_cleanup_interval_secs: Option<u64>,
    /// Maximum upload size in megabytes per block (from config, default 100)
    pub max_upload_size_mb: Option<u32>,
    /// In-memory voice channel state (who is in which voice channel)
    pub voice_state: Arc<VoiceState>,
    /// TURN relay configuration for voice channel NAT traversal
    pub turn_config: Option<TurnConfig>,
}
