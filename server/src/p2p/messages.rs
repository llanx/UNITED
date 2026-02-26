//! Gossipsub message handling: envelope encode/decode, signature verification, persistence.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use prost::Message as ProstMessage;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::DbPool;
use crate::proto::p2p_proto::{self, GossipEnvelope, MessageType};

/// Errors that can occur during envelope operations.
#[derive(Debug)]
pub enum EnvelopeError {
    /// Failed to decode protobuf
    DecodeError(String),
    /// Invalid Ed25519 public key
    InvalidPublicKey,
    /// Invalid Ed25519 signature
    InvalidSignature,
    /// Database error
    DbError(String),
    /// Invalid topic format
    InvalidTopic(String),
}

impl std::fmt::Display for EnvelopeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DecodeError(e) => write!(f, "Decode error: {}", e),
            Self::InvalidPublicKey => write!(f, "Invalid Ed25519 public key"),
            Self::InvalidSignature => write!(f, "Invalid Ed25519 signature"),
            Self::DbError(e) => write!(f, "Database error: {}", e),
            Self::InvalidTopic(e) => write!(f, "Invalid topic: {}", e),
        }
    }
}

/// Build canonical bytes for signing: concatenation of fields 3-7.
/// This is the data that gets signed/verified.
fn canonical_bytes(
    topic: &str,
    message_type: i32,
    timestamp: u64,
    sequence_hint: u64,
    payload: &[u8],
) -> Vec<u8> {
    let mut data = Vec::new();
    data.extend_from_slice(topic.as_bytes());
    data.extend_from_slice(&(message_type as u32).to_be_bytes());
    data.extend_from_slice(&timestamp.to_be_bytes());
    data.extend_from_slice(&sequence_hint.to_be_bytes());
    data.extend_from_slice(payload);
    data
}

/// Encode a GossipEnvelope with Ed25519 signature.
///
/// Signs fields 3-7 (topic, message_type, timestamp, sequence_hint, payload)
/// and produces the full protobuf-encoded envelope.
pub fn encode_gossip_envelope(
    sender_pubkey: &[u8],
    signing_key: &SigningKey,
    topic: &str,
    message_type: MessageType,
    sequence_hint: u64,
    payload: &[u8],
) -> Vec<u8> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let canonical = canonical_bytes(topic, message_type as i32, timestamp, sequence_hint, payload);

    let signature = signing_key.sign(&canonical);

    let envelope = GossipEnvelope {
        sender_pubkey: sender_pubkey.to_vec(),
        signature: signature.to_bytes().to_vec(),
        topic: topic.to_string(),
        message_type: message_type as i32,
        timestamp,
        sequence_hint,
        payload: payload.to_vec(),
    };

    envelope.encode_to_vec()
}

/// Decode and verify a GossipEnvelope from raw bytes.
///
/// Verifies the Ed25519 signature over fields 3-7.
/// Returns the verified envelope or an error.
pub fn decode_and_verify_gossip_envelope(data: &[u8]) -> Result<GossipEnvelope, EnvelopeError> {
    let envelope =
        GossipEnvelope::decode(data).map_err(|e| EnvelopeError::DecodeError(e.to_string()))?;

    // Reconstruct verifying key from sender_pubkey
    if envelope.sender_pubkey.len() != 32 {
        return Err(EnvelopeError::InvalidPublicKey);
    }
    let pubkey_bytes: [u8; 32] = envelope.sender_pubkey[..32]
        .try_into()
        .map_err(|_| EnvelopeError::InvalidPublicKey)?;
    let verifying_key =
        VerifyingKey::from_bytes(&pubkey_bytes).map_err(|_| EnvelopeError::InvalidPublicKey)?;

    // Reconstruct signature
    if envelope.signature.len() != 64 {
        return Err(EnvelopeError::InvalidSignature);
    }
    let sig_bytes: [u8; 64] = envelope.signature[..64]
        .try_into()
        .map_err(|_| EnvelopeError::InvalidSignature)?;
    let signature = Signature::from_bytes(&sig_bytes);

    // Reconstruct canonical bytes and verify
    let canonical = canonical_bytes(
        &envelope.topic,
        envelope.message_type,
        envelope.timestamp,
        envelope.sequence_hint,
        &envelope.payload,
    );

    verifying_key
        .verify(&canonical, &signature)
        .map_err(|_| EnvelopeError::InvalidSignature)?;

    Ok(envelope)
}

/// Extract channel_id from a gossipsub topic string.
/// Topic format: `{server_prefix}/{channel_uuid}`
pub fn extract_channel_id(topic: &str) -> Result<String, EnvelopeError> {
    match topic.rsplit_once('/') {
        Some((_, channel_id)) if !channel_id.is_empty() => Ok(channel_id.to_string()),
        _ => Err(EnvelopeError::InvalidTopic(format!(
            "Expected format 'prefix/channel_uuid', got: {}",
            topic
        ))),
    }
}

/// Handle a received gossipsub message: verify, extract, and persist to SQLite.
///
/// Returns the server-assigned sequence number on success.
/// Uses `SELECT COALESCE(MAX(server_sequence), 0) + 1` for single-writer sequencing.
pub fn handle_gossip_message(db: &DbPool, envelope: &GossipEnvelope) -> Result<u64, EnvelopeError> {
    let channel_id = extract_channel_id(&envelope.topic)?;
    let sender_hex = hex::encode(&envelope.sender_pubkey);

    let conn = db.lock().map_err(|e| EnvelopeError::DbError(e.to_string()))?;

    // Get next sequence number for this channel (single-writer, safe for Phase 3)
    let next_seq: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(server_sequence), 0) + 1 FROM messages WHERE channel_id = ?1",
            rusqlite::params![channel_id],
            |row| row.get(0),
        )
        .map_err(|e| EnvelopeError::DbError(format!("Sequence query: {}", e)))?;

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO messages (channel_id, sender_pubkey, message_type, payload, timestamp, sequence_hint, server_sequence, signature, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            channel_id,
            sender_hex,
            envelope.message_type,
            envelope.payload,
            envelope.timestamp as i64,
            envelope.sequence_hint as i64,
            next_seq,
            envelope.signature,
            now,
        ],
    )
    .map_err(|e| EnvelopeError::DbError(format!("Insert message: {}", e)))?;

    Ok(next_seq as u64)
}
