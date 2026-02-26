use libp2p::{
    autonat, dcutr, gossipsub, identify, identity, ping, relay, PeerId,
    swarm::NetworkBehaviour,
};
use sha2::{Digest, Sha256};
use std::time::Duration;

use super::config::P2pConfig;

/// Composed NetworkBehaviour for the UNITED server node.
/// Combines gossipsub (pub/sub), relay (NAT traversal), autonat (NAT detection),
/// identify (peer info exchange), dcutr (hole-punching), and ping (liveness).
#[derive(NetworkBehaviour)]
pub struct UnitedBehaviour {
    pub gossipsub: gossipsub::Behaviour,
    pub relay: relay::Behaviour,
    pub autonat: autonat::Behaviour,
    pub identify: identify::Behaviour,
    pub dcutr: dcutr::Behaviour,
    pub ping: ping::Behaviour,
}

/// Build the composed NetworkBehaviour with configuration from P2pConfig.
///
/// `topic_hashes` is a list of gossipsub TopicHash values for channels that
/// already exist. These are used to configure per-topic scoring parameters.
pub fn build_behaviour(
    keypair: &identity::Keypair,
    config: &P2pConfig,
    topic_hashes: &[gossipsub::TopicHash],
) -> UnitedBehaviour {
    let peer_id = PeerId::from(keypair.public());

    // --- Gossipsub configuration (tuned for chat per RESEARCH.md) ---

    // Per-topic scoring params (conservative for chat)
    let topic_score_params = gossipsub::TopicScoreParams {
        topic_weight: 1.0,
        // Reward peers that stay connected
        time_in_mesh_weight: 0.01,
        time_in_mesh_quantum: Duration::from_secs(1),
        time_in_mesh_cap: 100.0,
        // Reward peers that deliver messages first
        first_message_deliveries_weight: 1.0,
        first_message_deliveries_cap: 50.0,
        first_message_deliveries_decay: 0.95,
        // Light penalty for missing expected deliveries
        mesh_message_deliveries_weight: -0.1,
        mesh_message_deliveries_threshold: 1.0,
        mesh_message_deliveries_cap: 20.0,
        mesh_message_deliveries_decay: 0.95,
        mesh_message_deliveries_activation: Duration::from_secs(60),
        mesh_message_deliveries_window: Duration::from_millis(500),
        // Strong penalty for invalid signatures
        invalid_message_deliveries_weight: -10.0,
        invalid_message_deliveries_decay: 0.9,
        ..Default::default()
    };

    // Build per-topic map for peer scoring
    let mut topics = std::collections::HashMap::new();
    for topic_hash in topic_hashes {
        topics.insert(topic_hash.clone(), topic_score_params.clone());
    }

    let peer_score_params = gossipsub::PeerScoreParams {
        topics,
        decay_interval: Duration::from_secs(10),
        decay_to_zero: 0.01,
        ..Default::default()
    };

    // Conservative thresholds to avoid premature peer eviction
    let peer_score_thresholds = gossipsub::PeerScoreThresholds {
        gossip_threshold: -100.0,
        publish_threshold: -200.0,
        graylist_threshold: -300.0,
        opportunistic_graft_threshold: 5.0,
        ..Default::default()
    };

    let gossipsub_config = gossipsub::ConfigBuilder::default()
        .mesh_n(config.gossipsub_mesh_n)
        .mesh_n_low(config.gossipsub_mesh_n_low)
        .mesh_n_high(config.gossipsub_mesh_n_high)
        .mesh_outbound_min(2)
        .heartbeat_interval(Duration::from_secs(1))
        .max_transmit_size(config.gossipsub_max_transmit_size)
        .validation_mode(gossipsub::ValidationMode::Strict)
        .flood_publish(true)
        .message_id_fn(|msg| {
            // Dedup by SHA-256 content hash
            let mut hasher = Sha256::new();
            hasher.update(&msg.data);
            gossipsub::MessageId::from(hasher.finalize().to_vec())
        })
        .build()
        .expect("Valid gossipsub config");

    let mut gossipsub_behaviour = gossipsub::Behaviour::new(
        gossipsub::MessageAuthenticity::Signed(keypair.clone()),
        gossipsub_config,
    )
    .expect("Valid gossipsub behaviour");

    // Enable peer scoring
    gossipsub_behaviour
        .with_peer_score(peer_score_params, peer_score_thresholds)
        .expect("Valid peer score config");

    // --- Relay configuration (tuned for chat per RESEARCH.md Pitfall 4) ---
    // Start from defaults (which include rate limiters) and override numeric fields
    let mut relay_config = relay::Config::default();
    relay_config.max_circuits = config.relay_max_circuits;
    relay_config.max_circuits_per_peer = config.relay_max_circuits_per_peer;
    relay_config.max_circuit_duration = Duration::from_secs(config.relay_max_circuit_duration_secs);
    relay_config.max_circuit_bytes = config.relay_max_circuit_bytes;

    UnitedBehaviour {
        gossipsub: gossipsub_behaviour,
        relay: relay::Behaviour::new(peer_id, relay_config),
        autonat: autonat::Behaviour::new(peer_id, Default::default()),
        identify: identify::Behaviour::new(identify::Config::new(
            "/united/1.0.0".to_string(),
            keypair.public(),
        )),
        dcutr: dcutr::Behaviour::new(peer_id),
        ping: ping::Behaviour::default(),
    }
}
