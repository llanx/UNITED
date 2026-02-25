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
    ])
}
