use std::path::Path;

use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::Rng;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::auth::middleware::Claims;
use crate::db::DbPool;

/// Load or generate the JWT signing key (256-bit random secret).
/// Key is stored as raw bytes in data_dir/jwt_secret.
/// Per Pitfall 4: key MUST be cryptographically random, never human-readable.
pub fn load_or_generate_jwt_secret(data_dir: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let key_path = Path::new(data_dir).join("jwt_secret");

    if key_path.exists() {
        let key = std::fs::read(&key_path)?;
        if key.len() == 32 {
            tracing::info!("JWT signing key loaded from {}", key_path.display());
            return Ok(key);
        }
        // Invalid key file — regenerate
        tracing::warn!("JWT key file has wrong size ({}), regenerating", key.len());
    }

    // Generate new 256-bit random key
    let key: [u8; 32] = rand::rng().random();
    std::fs::write(&key_path, &key)?;
    tracing::info!("JWT signing key generated at {}", key_path.display());
    Ok(key.to_vec())
}

/// Issue an access token (15-minute expiry).
/// Claims: sub=user_id, fingerprint, is_owner, is_admin, iat, exp
pub fn issue_access_token(
    secret: &[u8],
    user_id: &str,
    fingerprint: &str,
    is_owner: bool,
    is_admin: bool,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now().timestamp();
    let claims = Claims {
        sub: user_id.to_string(),
        fingerprint: fingerprint.to_string(),
        is_owner,
        is_admin,
        iat: now,
        exp: now + 900, // 15 minutes
    };

    encode(
        &Header::default(), // HS256
        &claims,
        &EncodingKey::from_secret(secret),
    )
}

/// Issue a refresh token (7-day expiry).
/// Returns (token_string, sha256_hash_hex) — store the hash in DB, give token to client.
pub fn issue_refresh_token() -> (String, String) {
    // Generate a random 32-byte token, hex-encoded
    let token_bytes: [u8; 32] = rand::rng().random();
    let token = hex::encode(token_bytes);

    // Hash for storage (never store plaintext refresh tokens)
    let hash = hash_refresh_token(&token);

    (token, hash)
}

/// SHA-256 hash of a refresh token for storage comparison.
pub fn hash_refresh_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

/// Store a refresh token hash in the database.
pub fn store_refresh_token(
    db: &DbPool,
    user_id: &str,
    token_hash: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let id = Uuid::now_v7().to_string();
    let now = Utc::now().to_rfc3339();
    let expires_at = (Utc::now() + chrono::Duration::days(7)).to_rfc3339();

    conn.execute(
        "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, user_id, token_hash, expires_at, now],
    )?;

    Ok(())
}

/// Validate a refresh token: look up hash in DB, check expiry, return user_id.
/// On success, deletes the old token (rotation).
pub fn validate_and_consume_refresh_token(
    db: &DbPool,
    token: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let token_hash = hash_refresh_token(token);
    let now = Utc::now().to_rfc3339();

    // Find the token and check expiry
    let result: Result<(String, String), _> = conn.query_row(
        "SELECT id, user_id FROM refresh_tokens WHERE token_hash = ?1 AND expires_at > ?2",
        rusqlite::params![token_hash, now],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );

    match result {
        Ok((token_id, user_id)) => {
            // Delete the consumed token (rotation — old token is single-use)
            conn.execute(
                "DELETE FROM refresh_tokens WHERE id = ?1",
                [&token_id],
            )?;
            Ok(user_id)
        }
        Err(_) => Err("Invalid or expired refresh token".into()),
    }
}

/// Validate an access token and return its claims.
pub fn validate_access_token(
    secret: &[u8],
    token: &str,
) -> Result<Claims, jsonwebtoken::errors::Error> {
    let validation = Validation::new(jsonwebtoken::Algorithm::HS256);
    let token_data = decode::<Claims>(token, &DecodingKey::from_secret(secret), &validation)?;
    Ok(token_data.claims)
}
