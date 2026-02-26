//! Block metadata storage (SQLite) and encrypted file I/O.
//!
//! Blocks are content-addressed by their SHA-256 hash. Each block is stored as:
//! - Metadata row in `blocks` table (hash, size, encrypted_size, channel_id, expiry)
//! - Encrypted file at `{data_dir}/blocks/{hex_hash}`

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

use crate::blocks::crypto;
use crate::db::DbPool;

/// Compute the blocks storage directory path.
fn blocks_dir(data_dir: &str) -> PathBuf {
    Path::new(data_dir).join("blocks")
}

/// Compute the file path for a block given its hex hash.
fn block_file_path(data_dir: &str, hash_hex: &str) -> PathBuf {
    blocks_dir(data_dir).join(hash_hex)
}

/// Store a block: verify hash, encrypt, write file, insert metadata.
///
/// Returns `Ok(())` if the block was stored (or already existed).
/// Returns `Err` if the hash doesn't match the data or I/O fails.
pub fn put_block(
    db: &DbPool,
    data_dir: &str,
    hash_hex: &str,
    data: &[u8],
    channel_id: Option<&str>,
    retention_days: u32,
) -> Result<(), String> {
    // Verify SHA-256 hash matches the data
    let computed_hash = Sha256::digest(data);
    let computed_hex = hex::encode(computed_hash);
    if computed_hex != hash_hex {
        return Err(format!(
            "Hash mismatch: expected {}, computed {}",
            hash_hex, computed_hex
        ));
    }

    // Check if block already exists
    if has_block(db, hash_hex) {
        tracing::debug!("Block {} already exists, skipping", hash_hex);
        return Ok(());
    }

    // Encrypt the block data with content-derived key
    let content_hash: [u8; 32] = computed_hash.into();
    let encrypted = crypto::server_encrypt_block(&content_hash, data);

    // Ensure blocks directory exists
    let dir = blocks_dir(data_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create blocks directory: {}", e))?;

    // Write encrypted file
    let file_path = block_file_path(data_dir, hash_hex);
    std::fs::write(&file_path, &encrypted)
        .map_err(|e| format!("Failed to write block file: {}", e))?;

    // Insert metadata row
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "INSERT OR IGNORE INTO blocks (hash, size, encrypted_size, channel_id, expires_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now', '+' || ?5 || ' days'))",
        rusqlite::params![
            hash_hex,
            data.len() as i64,
            encrypted.len() as i64,
            channel_id,
            retention_days,
        ],
    )
    .map_err(|e| format!("Failed to insert block metadata: {}", e))?;

    tracing::debug!(
        "Stored block {} ({} bytes, encrypted {} bytes)",
        hash_hex,
        data.len(),
        encrypted.len()
    );

    Ok(())
}

/// Retrieve and decrypt a block by its hex hash.
///
/// Returns `Ok(Some(plaintext))` if found, `Ok(None)` if not found.
pub fn get_block(db: &DbPool, data_dir: &str, hash_hex: &str) -> Result<Option<Vec<u8>>, String> {
    // Check metadata exists
    if !has_block(db, hash_hex) {
        return Ok(None);
    }

    // Read encrypted file
    let file_path = block_file_path(data_dir, hash_hex);
    let encrypted = std::fs::read(&file_path).map_err(|e| {
        format!(
            "Failed to read block file {}: {}",
            file_path.display(),
            e
        )
    })?;

    // Derive content hash from hex
    let content_hash: [u8; 32] = hex::decode(hash_hex)
        .map_err(|e| format!("Invalid hex hash: {}", e))?
        .try_into()
        .map_err(|_| "Hash hex must decode to exactly 32 bytes".to_string())?;

    // Decrypt
    let plaintext = crypto::server_decrypt_block(&content_hash, &encrypted)?;
    Ok(Some(plaintext))
}

/// Check whether a block exists in the metadata table.
pub fn has_block(db: &DbPool, hash_hex: &str) -> bool {
    let conn = match db.lock() {
        Ok(c) => c,
        Err(_) => return false,
    };
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM blocks WHERE hash = ?1",
            rusqlite::params![hash_hex],
            |row| row.get(0),
        )
        .unwrap_or(0);
    count > 0
}

/// Delete a single block (file + metadata row).
pub fn delete_block(db: &DbPool, data_dir: &str, hash_hex: &str) -> Result<(), String> {
    // Delete file (ignore if missing)
    let file_path = block_file_path(data_dir, hash_hex);
    let _ = std::fs::remove_file(&file_path);

    // Delete metadata row
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "DELETE FROM blocks WHERE hash = ?1",
        rusqlite::params![hash_hex],
    )
    .map_err(|e| format!("Failed to delete block metadata: {}", e))?;

    Ok(())
}

/// Delete all blocks whose `expires_at` is in the past.
///
/// Returns the number of blocks purged.
pub fn delete_expired_blocks(db: &DbPool, data_dir: &str) -> Result<usize, String> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Collect expired block hashes
    let mut stmt = conn
        .prepare("SELECT hash FROM blocks WHERE expires_at < datetime('now')")
        .map_err(|e| format!("Failed to prepare expiry query: {}", e))?;

    let expired_hashes: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query expired blocks: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    if expired_hashes.is_empty() {
        return Ok(0);
    }

    let count = expired_hashes.len();

    // Delete files
    for hash in &expired_hashes {
        let file_path = block_file_path(data_dir, hash);
        let _ = std::fs::remove_file(&file_path);
    }

    // Delete metadata rows
    conn.execute(
        "DELETE FROM blocks WHERE expires_at < datetime('now')",
        [],
    )
    .map_err(|e| format!("Failed to delete expired block rows: {}", e))?;

    Ok(count)
}
