use rand::Rng;
use sha2::{Digest, Sha256};

use crate::db::DbPool;

/// Generate a 32-byte random setup token, hex-encoded (64 chars).
/// On first boot (no users in DB), generate and print the token.
/// The SHA-256 hash of the token is stored in server_settings.
pub fn generate_setup_token() -> String {
    let token_bytes: [u8; 32] = rand::rng().random();
    hex::encode(token_bytes)
}

/// Hash a setup token with SHA-256 for storage.
pub fn hash_setup_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

/// Check if the server needs initial setup (no users exist).
/// If so, generate a setup token, store its hash, and return the plaintext token.
pub fn maybe_generate_setup_token(db: &DbPool) -> Result<Option<String>, Box<dyn std::error::Error>> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Check if any users exist
    let user_count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;

    if user_count > 0 {
        return Ok(None);
    }

    // Check if setup token already exists (server restarted before first user)
    let existing: Option<String> = conn
        .query_row(
            "SELECT value FROM server_settings WHERE key = 'setup_token_hash'",
            [],
            |row| row.get(0),
        )
        .ok();

    if existing.is_some() {
        // Token was already generated on a previous boot — regenerate a new one
        // (the old plaintext is lost since we only stored the hash)
        let token = generate_setup_token();
        let hash = hash_setup_token(&token);
        conn.execute(
            "UPDATE server_settings SET value = ?1 WHERE key = 'setup_token_hash'",
            [&hash],
        )?;
        return Ok(Some(token));
    }

    // First boot ever: generate and store
    let token = generate_setup_token();
    let hash = hash_setup_token(&token);
    conn.execute(
        "INSERT INTO server_settings (key, value) VALUES ('setup_token_hash', ?1)",
        [&hash],
    )?;

    Ok(Some(token))
}

/// Verify a setup token against the stored hash.
/// Returns true if the token matches and hasn't been consumed yet.
pub fn verify_setup_token(db: &DbPool, token: &str) -> Result<bool, Box<dyn std::error::Error>> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let stored_hash: Option<String> = conn
        .query_row(
            "SELECT value FROM server_settings WHERE key = 'setup_token_hash'",
            [],
            |row| row.get(0),
        )
        .ok();

    match stored_hash {
        Some(hash) => {
            let provided_hash = hash_setup_token(token);
            Ok(hash == provided_hash)
        }
        None => Ok(false),
    }
}

/// Consume the setup token after the first user claims it.
/// Removes the token hash from server_settings and marks setup as complete.
pub fn consume_setup_token(db: &DbPool) -> Result<(), Box<dyn std::error::Error>> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "DELETE FROM server_settings WHERE key = 'setup_token_hash'",
        [],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO server_settings (key, value) VALUES ('setup_complete', 'true')",
        [],
    )?;
    Ok(())
}
