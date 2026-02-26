//! Content-addressed block store for the UNITED server.
//!
//! Blocks are encrypted at rest using HKDF-derived keys from the content hash.
//! This prevents casual disk browsing while allowing authorized peers (who know
//! the content hash from gossip) to derive decryption keys.
//!
//! Storage layout: `{data_dir}/blocks/{hex_hash}` (encrypted files on disk).
//! Metadata (size, expiry, channel) tracked in SQLite `blocks` table.

pub mod crypto;
pub mod retention;
pub mod routes;
pub mod store;
