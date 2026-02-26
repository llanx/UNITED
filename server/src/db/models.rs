/// Database row types for all tables.
/// These correspond 1:1 to the SQLite schema defined in migrations.rs.

/// User record in the users table
#[derive(Debug, Clone)]
pub struct User {
    pub id: String,
    pub public_key: Vec<u8>,
    pub fingerprint: String,
    pub display_name: String,
    pub roles: i64,
    pub is_owner: bool,
    pub totp_secret_encrypted: Option<Vec<u8>>,
    pub totp_enrolled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Role bitfield constants
pub const ROLE_ADMIN: i64 = 1;

/// Encrypted identity blob for server-side backup
#[derive(Debug, Clone)]
pub struct IdentityBlobRow {
    pub fingerprint: String,
    pub encrypted_blob: Vec<u8>,
    pub created_at: String,
    pub updated_at: String,
}

/// Key rotation record (genesis or rotation)
#[derive(Debug, Clone)]
pub struct RotationRecordRow {
    pub id: String,
    pub fingerprint: String,
    pub record_type: String,
    pub prev_key: Option<Vec<u8>>,
    pub new_key: Vec<u8>,
    pub reason: Option<String>,
    pub signature_old: Option<Vec<u8>>,
    pub signature_new: Vec<u8>,
    pub cancellation_deadline: Option<String>,
    pub cancelled: bool,
    pub created_at: String,
}

/// Refresh token record (SHA-256 hash stored, not plaintext)
#[derive(Debug, Clone)]
pub struct RefreshTokenRow {
    pub id: String,
    pub user_id: String,
    pub token_hash: String,
    pub device_info: Option<String>,
    pub expires_at: String,
    pub created_at: String,
}

/// Server settings key-value pair
#[derive(Debug, Clone)]
pub struct ServerSetting {
    pub key: String,
    pub value: String,
}

/// Challenge for auth flow
#[derive(Debug, Clone)]
pub struct ChallengeRow {
    pub id: String,
    pub challenge_bytes: Vec<u8>,
    pub expires_at: String,
}

// --- Phase 2: Server Management models ---

/// Channel category (flat grouping, no nesting)
#[derive(Debug, Clone)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub position: i64,
    pub created_at: String,
}

/// Text or voice channel within a category
#[derive(Debug, Clone)]
pub struct Channel {
    pub id: String,
    pub name: String,
    pub channel_type: String,
    pub category_id: String,
    pub position: i64,
    pub topic: Option<String>,
    pub created_at: String,
}

/// Role with bitwise permission flags
#[derive(Debug, Clone)]
pub struct Role {
    pub id: String,
    pub name: String,
    pub permissions: u32,
    pub color: Option<String>,
    pub position: i64,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Ban record (by fingerprint, not user ID, so bans survive key rotation)
#[derive(Debug, Clone)]
pub struct Ban {
    pub id: String,
    pub fingerprint: String,
    pub banned_by: String,
    pub reason: Option<String>,
    pub expires_at: Option<String>,
    pub created_at: String,
}

/// Invite code with optional expiration and use limits
#[derive(Debug, Clone)]
pub struct Invite {
    pub code: String,
    pub created_by: String,
    pub max_uses: Option<i64>,
    pub use_count: i64,
    pub expires_at: Option<String>,
    pub created_at: String,
}

// --- Phase 3: P2P Messages ---

/// Persisted gossipsub message with server-assigned sequence number
#[derive(Debug, Clone)]
pub struct Message {
    pub id: i64,
    pub channel_id: String,
    pub sender_pubkey: String,
    pub message_type: i32,
    pub payload: Option<Vec<u8>>,
    pub timestamp: i64,
    pub sequence_hint: i64,
    pub server_sequence: i64,
    pub signature: Vec<u8>,
    pub created_at: String,
    // Phase 4 additions
    pub content_text: Option<String>,
    pub edited: bool,
    pub edit_timestamp: Option<String>,
    pub deleted: bool,
    pub reply_to_id: Option<String>,
}

// --- Phase 4: Chat Features ---

/// Emoji reaction on a message
#[derive(Debug, Clone)]
pub struct Reaction {
    pub id: i64,
    pub message_id: i64,
    pub user_pubkey: String,
    pub emoji: String,
    pub created_at: String,
}

/// Per-user per-channel read position tracking
#[derive(Debug, Clone)]
pub struct LastRead {
    pub user_id: String,
    pub channel_id: String,
    pub last_sequence: i64,
    pub updated_at: String,
}

// --- Phase 5: Direct Messages ---

/// X25519 public key for DM key exchange
#[derive(Debug, Clone)]
pub struct DmPublicKey {
    pub ed25519_pubkey: String,
    pub x25519_pubkey: Vec<u8>,
    pub published_at: String,
    pub updated_at: String,
}

/// DM conversation between two users (one-to-one only in v1)
#[derive(Debug, Clone)]
pub struct DmConversation {
    pub id: String,
    pub participant_a: String,
    pub participant_b: String,
    pub created_at: String,
    pub last_message_at: Option<String>,
}

/// Encrypted DM message (server stores as opaque blob)
#[derive(Debug, Clone)]
pub struct DmMessage {
    pub id: String,
    pub conversation_id: String,
    pub sender_pubkey: String,
    pub encrypted_payload: Vec<u8>,
    pub nonce: Vec<u8>,
    pub ephemeral_pubkey: Option<Vec<u8>>,
    pub timestamp: i64,
    pub server_sequence: i64,
    pub sender_display_name: Option<String>,
    pub created_at: String,
}

/// Offline delivery queue entry
#[derive(Debug, Clone)]
pub struct DmOfflineQueueEntry {
    pub id: i64,
    pub recipient_pubkey: String,
    pub dm_message_id: String,
    pub queued_at: String,
    pub delivered: bool,
}

// --- Phase 6: Content Distribution ---

/// Content-addressed block metadata (file stored on disk, metadata in DB)
#[derive(Debug, Clone)]
pub struct BlockRow {
    pub hash: String,
    pub size: i64,
    pub encrypted_size: i64,
    pub channel_id: Option<String>,
    pub created_at: String,
    pub expires_at: String,
}
