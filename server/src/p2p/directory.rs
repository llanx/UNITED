use dashmap::DashMap;
use libp2p::{Multiaddr, PeerId};
use std::collections::HashSet;

/// Directory entry for a connected peer.
#[derive(Debug, Clone)]
pub struct PeerDirectoryEntry {
    /// UNITED user fingerprint (stable across key rotation).
    /// Set when the WS-connected user sends a RegisterPeerId message.
    pub united_id: Option<String>,
    /// Multiaddresses advertised by this peer.
    pub multiaddrs: Vec<Multiaddr>,
    /// Channels (topic strings) this peer is subscribed to.
    pub channels: HashSet<String>,
    /// NAT type classification from AutoNAT.
    pub nat_type: String,
    /// Last seen timestamp.
    pub last_seen: chrono::DateTime<chrono::Utc>,
}

/// Tracks online peers and their multiaddresses, channel subscriptions, and UNITED identities.
///
/// Thread-safe via DashMap. Populated from:
/// 1. libp2p identify events (peer_id + multiaddrs)
/// 2. gossipsub subscription events (which topics each peer subscribes to)
/// 3. WS RegisterPeerId messages (UNITED fingerprint to PeerId mapping)
pub struct PeerDirectory {
    /// Main directory: PeerId -> entry
    peers: DashMap<PeerId, PeerDirectoryEntry>,
    /// Reverse mapping: UNITED fingerprint -> current PeerId
    identity_to_peer: DashMap<String, PeerId>,
}

impl PeerDirectory {
    pub fn new() -> Self {
        Self {
            peers: DashMap::new(),
            identity_to_peer: DashMap::new(),
        }
    }

    /// Register or update a peer's multiaddresses (called on identify event).
    pub fn update_multiaddrs(&self, peer_id: &PeerId, multiaddrs: Vec<Multiaddr>) {
        self.peers
            .entry(*peer_id)
            .and_modify(|entry| {
                entry.multiaddrs = multiaddrs.clone();
                entry.last_seen = chrono::Utc::now();
            })
            .or_insert_with(|| PeerDirectoryEntry {
                united_id: None,
                multiaddrs,
                channels: HashSet::new(),
                nat_type: "unknown".to_string(),
                last_seen: chrono::Utc::now(),
            });
    }

    /// Register a peer with its UNITED identity (called from WS RegisterPeerId).
    pub fn register_peer(&self, peer_id: &PeerId, united_id: &str) {
        // Update the identity mapping
        self.identity_to_peer
            .insert(united_id.to_string(), *peer_id);

        // Update the directory entry
        self.peers
            .entry(*peer_id)
            .and_modify(|entry| {
                entry.united_id = Some(united_id.to_string());
                entry.last_seen = chrono::Utc::now();
            })
            .or_insert_with(|| PeerDirectoryEntry {
                united_id: Some(united_id.to_string()),
                multiaddrs: Vec::new(),
                channels: HashSet::new(),
                nat_type: "unknown".to_string(),
                last_seen: chrono::Utc::now(),
            });
    }

    /// Remove a peer on disconnect.
    pub fn unregister_peer(&self, peer_id: &PeerId) {
        if let Some((_, entry)) = self.peers.remove(peer_id) {
            if let Some(ref uid) = entry.united_id {
                self.identity_to_peer.remove(uid);
            }
        }
    }

    /// Update NAT type classification for a peer.
    pub fn update_nat_type(&self, peer_id: &PeerId, nat_type: &str) {
        if let Some(mut entry) = self.peers.get_mut(peer_id) {
            entry.nat_type = nat_type.to_string();
        }
    }

    /// Add a channel subscription for a peer (called on gossipsub subscribe event).
    pub fn add_channel(&self, peer_id: &PeerId, channel: &str) {
        self.peers
            .entry(*peer_id)
            .and_modify(|entry| {
                entry.channels.insert(channel.to_string());
            })
            .or_insert_with(|| {
                let mut channels = HashSet::new();
                channels.insert(channel.to_string());
                PeerDirectoryEntry {
                    united_id: None,
                    multiaddrs: Vec::new(),
                    channels,
                    nat_type: "unknown".to_string(),
                    last_seen: chrono::Utc::now(),
                }
            });
    }

    /// Remove a channel subscription for a peer.
    pub fn remove_channel(&self, peer_id: &PeerId, channel: &str) {
        if let Some(mut entry) = self.peers.get_mut(peer_id) {
            entry.channels.remove(channel);
        }
    }

    /// Get peers for specific channels (for PeerDirectoryResponse).
    pub fn get_peers_for_channels(&self, channel_ids: &[String]) -> Vec<PeerDirectoryInfo> {
        let mut results = Vec::new();

        for entry in self.peers.iter() {
            let peer_id = entry.key();
            let peer = entry.value();

            // Check if this peer is subscribed to any of the requested channels
            let matching_channels: Vec<String> = peer
                .channels
                .iter()
                .filter(|ch| channel_ids.contains(ch))
                .cloned()
                .collect();

            if !matching_channels.is_empty() {
                results.push(PeerDirectoryInfo {
                    united_id: peer.united_id.clone().unwrap_or_default(),
                    peer_id: peer_id.to_string(),
                    multiaddrs: peer.multiaddrs.iter().map(|a| a.to_string()).collect(),
                    channels: matching_channels,
                    nat_type: peer.nat_type.clone(),
                });
            }
        }

        results
    }
}

/// Simplified peer info for directory responses.
#[derive(Debug, Clone)]
pub struct PeerDirectoryInfo {
    pub united_id: String,
    pub peer_id: String,
    pub multiaddrs: Vec<String>,
    pub channels: Vec<String>,
    pub nat_type: String,
}
