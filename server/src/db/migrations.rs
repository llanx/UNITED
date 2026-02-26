use rusqlite_migration::{Migrations, M};

/// Define all schema migrations.
/// Uses SQLite user_version pragma for tracking — no migration table needed.
pub fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
            "-- Migration 1: Initial schema

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    public_key BLOB NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    roles INTEGER NOT NULL DEFAULT 0,
    is_owner INTEGER NOT NULL DEFAULT 0,
    totp_secret_encrypted BLOB,
    totp_enrolled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_users_display_name ON users(display_name);

CREATE TABLE identity_blobs (
    fingerprint TEXT PRIMARY KEY,
    encrypted_blob BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE rotation_records (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    record_type TEXT NOT NULL,
    prev_key BLOB,
    new_key BLOB NOT NULL,
    reason TEXT,
    signature_old BLOB,
    signature_new BLOB NOT NULL,
    cancellation_deadline TEXT,
    cancelled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (fingerprint) REFERENCES users(fingerprint)
);

CREATE INDEX idx_rotation_fingerprint ON rotation_records(fingerprint);

CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    device_info TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

CREATE TABLE server_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE challenges (
    id TEXT PRIMARY KEY,
    challenge_bytes BLOB NOT NULL,
    expires_at TEXT NOT NULL
);
",
        ),
        M::up(
            "-- Migration 2: Server Management (Phase 2)

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    channel_type TEXT NOT NULL DEFAULT 'text',
    category_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    topic TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX idx_channels_category ON channels(category_id);

CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    permissions INTEGER NOT NULL DEFAULT 0,
    color TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE user_roles (
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

CREATE TABLE bans (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    banned_by TEXT NOT NULL,
    reason TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (banned_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX idx_bans_fingerprint ON bans(fingerprint);

CREATE TABLE invites (
    code TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    max_uses INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
);
",
        ),
        M::up(
            "-- Migration 3: P2P Messages (Phase 3)

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    sender_pubkey TEXT NOT NULL,
    message_type INTEGER NOT NULL DEFAULT 0,
    payload BLOB,
    timestamp INTEGER NOT NULL,
    sequence_hint INTEGER NOT NULL DEFAULT 0,
    server_sequence INTEGER NOT NULL,
    signature BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_channel_seq ON messages(channel_id, server_sequence);
CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel_id, created_at);
",
        ),
        M::up(
            "-- Migration 4: Chat Features (Phase 4)

ALTER TABLE messages ADD COLUMN content_text TEXT;
ALTER TABLE messages ADD COLUMN edited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN edit_timestamp TEXT;
ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN reply_to_id TEXT;

CREATE TABLE reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    user_pubkey TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    UNIQUE(message_id, user_pubkey, emoji)
);
CREATE INDEX idx_reactions_message ON reactions(message_id);

CREATE TABLE last_read (
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    last_sequence INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, channel_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
",
        ),
        M::up(
            "-- Migration 5: Direct Messages (Phase 5)

-- X25519 public keys for DM key exchange
-- Ed25519 -> X25519 conversion is done client-side; server stores the result
CREATE TABLE dm_public_keys (
    ed25519_pubkey TEXT PRIMARY KEY,
    x25519_pubkey BLOB NOT NULL,
    published_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- DM conversations (one-to-one only in v1)
CREATE TABLE dm_conversations (
    id TEXT PRIMARY KEY,
    participant_a TEXT NOT NULL,
    participant_b TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_message_at TEXT,
    UNIQUE(participant_a, participant_b)
);
CREATE INDEX idx_dm_conversations_a ON dm_conversations(participant_a);
CREATE INDEX idx_dm_conversations_b ON dm_conversations(participant_b);

-- Encrypted DM messages (server stores opaque encrypted blobs)
CREATE TABLE dm_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_pubkey TEXT NOT NULL,
    encrypted_payload BLOB NOT NULL,
    nonce BLOB NOT NULL,
    ephemeral_pubkey BLOB,
    timestamp INTEGER NOT NULL,
    server_sequence INTEGER NOT NULL,
    sender_display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES dm_conversations(id) ON DELETE CASCADE
);
CREATE INDEX idx_dm_messages_conv_seq ON dm_messages(conversation_id, server_sequence);

-- Offline delivery queue (messages waiting for recipient to come online)
-- Cleaned up after 30 days
CREATE TABLE dm_offline_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_pubkey TEXT NOT NULL,
    dm_message_id TEXT NOT NULL,
    queued_at TEXT NOT NULL DEFAULT (datetime('now')),
    delivered INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (dm_message_id) REFERENCES dm_messages(id) ON DELETE CASCADE
);
CREATE INDEX idx_dm_offline_recipient ON dm_offline_queue(recipient_pubkey, delivered);
",
        ),
        M::up(
            "-- Migration 6: Content-Addressed Block Store (Phase 6)

CREATE TABLE blocks (
    hash TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    encrypted_size INTEGER NOT NULL,
    channel_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL
);
CREATE INDEX idx_blocks_expires ON blocks(expires_at);
CREATE INDEX idx_blocks_channel ON blocks(channel_id);
",
        ),
    ])
}
