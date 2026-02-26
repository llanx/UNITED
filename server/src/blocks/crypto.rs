//! HKDF-SHA256 content-derived key derivation and AES-256-GCM encryption
//! for server-side block storage.
//!
//! Key derivation: HKDF(salt, content_hash, info) -> 256-bit AES key
//! Encryption: AES-256-GCM with random 12-byte nonce
//! Wire format: nonce (12 bytes) || ciphertext (includes GCM tag)

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};
use hkdf::Hkdf;
use rand::Rng;
use sha2::Sha256;

/// Salt for HKDF key derivation (domain separation)
const HKDF_SALT: &[u8] = b"united-content-derived-key-v1";

/// Info string for HKDF key derivation (purpose binding)
const HKDF_INFO: &[u8] = b"united-server-block-encryption";

/// Derive an AES-256-GCM key from a SHA-256 content hash using HKDF-SHA256.
///
/// Anyone who knows the content hash can derive this key, which is the intended
/// security model: authorized peers received the hash via gossip and can request
/// the block from the server, but casual disk inspection reveals nothing.
pub fn derive_content_key(content_hash: &[u8; 32]) -> Key<Aes256Gcm> {
    let hk = Hkdf::<Sha256>::new(Some(HKDF_SALT), content_hash);
    let mut okm = [0u8; 32];
    hk.expand(HKDF_INFO, &mut okm)
        .expect("HKDF expand should not fail for 32-byte output");
    Key::<Aes256Gcm>::from(okm)
}

/// Encrypt a block's plaintext data using a content-derived key.
///
/// Returns `nonce (12 bytes) || ciphertext (includes 16-byte GCM tag)`.
pub fn server_encrypt_block(content_hash: &[u8; 32], plaintext: &[u8]) -> Vec<u8> {
    let key = derive_content_key(content_hash);
    let cipher = Aes256Gcm::new(&key);
    let nonce_bytes: [u8; 12] = rand::rng().random();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .expect("AES-256-GCM encryption should not fail");

    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    result
}

/// Decrypt a block from `nonce (12 bytes) || ciphertext` format.
///
/// Returns the original plaintext or an error if decryption fails.
pub fn server_decrypt_block(
    content_hash: &[u8; 32],
    encrypted: &[u8],
) -> Result<Vec<u8>, String> {
    if encrypted.len() < 12 {
        return Err("Encrypted block data too short (< 12 bytes)".to_string());
    }
    let key = derive_content_key(content_hash);
    let cipher = Aes256Gcm::new(&key);
    let nonce = Nonce::from_slice(&encrypted[..12]);
    let ciphertext = &encrypted[12..];
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Block decryption failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;

    #[test]
    fn test_roundtrip_encrypt_decrypt() {
        let data = b"hello united block store";
        let hash: [u8; 32] = sha2::Sha256::digest(data).into();

        let encrypted = server_encrypt_block(&hash, data);
        // Encrypted should be: 12 (nonce) + data.len() + 16 (GCM tag)
        assert_eq!(encrypted.len(), 12 + data.len() + 16);

        let decrypted = server_decrypt_block(&hash, &encrypted).unwrap();
        assert_eq!(decrypted, data);
    }

    #[test]
    fn test_wrong_hash_fails_decrypt() {
        let data = b"sensitive content";
        let correct_hash: [u8; 32] = sha2::Sha256::digest(data).into();
        let wrong_hash: [u8; 32] = sha2::Sha256::digest(b"wrong").into();

        let encrypted = server_encrypt_block(&correct_hash, data);
        let result = server_decrypt_block(&wrong_hash, &encrypted);
        assert!(result.is_err());
    }

    #[test]
    fn test_too_short_data_fails() {
        let hash = [0u8; 32];
        let result = server_decrypt_block(&hash, &[0u8; 5]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too short"));
    }

    #[test]
    fn test_derive_content_key_deterministic() {
        let hash = [42u8; 32];
        let key1 = derive_content_key(&hash);
        let key2 = derive_content_key(&hash);
        assert_eq!(key1, key2);
    }

    #[test]
    fn test_different_hashes_produce_different_keys() {
        let hash1 = [1u8; 32];
        let hash2 = [2u8; 32];
        let key1 = derive_content_key(&hash1);
        let key2 = derive_content_key(&hash2);
        assert_ne!(key1, key2);
    }
}
