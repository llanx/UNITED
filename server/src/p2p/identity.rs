use libp2p::identity;
use libp2p::PeerId;
use std::fs;
use std::path::Path;

/// Load or generate the server's libp2p Ed25519 identity keypair.
///
/// The keypair is stored as a 32-byte Ed25519 seed at `{data_dir}/p2p_identity.key`.
/// On first run, generates a new keypair and persists the seed.
/// On subsequent runs, loads the existing seed to derive the same keypair.
///
/// Note: This is the SERVER node identity for the libp2p mesh, separate from
/// UNITED user identities. Kept independent for simplicity.
pub fn server_identity_keypair(data_dir: &str) -> identity::Keypair {
    let key_path = Path::new(data_dir).join("p2p_identity.key");

    if key_path.exists() {
        // Load existing 32-byte seed
        let seed_bytes = fs::read(&key_path).expect("Failed to read p2p_identity.key");
        assert!(
            seed_bytes.len() == 32,
            "p2p_identity.key must be 32 bytes (Ed25519 seed), found {} bytes",
            seed_bytes.len()
        );
        let mut seed = seed_bytes.clone();
        let ed25519_keypair = identity::ed25519::Keypair::try_from_bytes(&mut seed)
            .expect("Invalid Ed25519 seed in p2p_identity.key");
        let keypair = identity::Keypair::from(ed25519_keypair);
        let peer_id = PeerId::from(keypair.public());
        tracing::info!("Server libp2p PeerId: {} (loaded from {})", peer_id, key_path.display());
        keypair
    } else {
        // Generate new keypair
        let keypair = identity::Keypair::generate_ed25519();
        let peer_id = PeerId::from(keypair.public());

        // Extract the 32-byte seed from the keypair for persistence.
        // libp2p's ed25519::Keypair::try_into_bytes() returns 64 bytes (seed + public).
        // We store only the first 32 bytes (the seed).
        let ed25519_kp = keypair
            .clone()
            .try_into_ed25519()
            .expect("Keypair is Ed25519");
        let full_bytes = ed25519_kp.to_bytes();
        let seed = &full_bytes[..32];

        // Ensure data directory exists
        fs::create_dir_all(data_dir).expect("Failed to create data directory");

        fs::write(&key_path, seed).expect("Failed to write p2p_identity.key");
        tracing::info!(
            "Server libp2p PeerId: {} (generated, saved to {})",
            peer_id,
            key_path.display()
        );
        keypair
    }
}
