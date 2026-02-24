use std::path::Path;

use rand::Rng;

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
