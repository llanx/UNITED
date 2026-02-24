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
