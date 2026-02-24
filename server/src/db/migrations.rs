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
    ])
}
