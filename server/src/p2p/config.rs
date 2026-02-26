use serde::{Deserialize, Serialize};

/// P2P networking configuration.
/// All fields have sensible defaults tuned for chat workloads per RESEARCH.md.
/// Exposed in `united.toml` under the `[p2p]` section.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct P2pConfig {
    /// libp2p WebSocket listener port (separate from axum's HTTP port).
    /// Default: 1985
    #[serde(default = "default_libp2p_port")]
    pub libp2p_port: u16,

    /// Gossipsub mesh degree (D parameter).
    /// Number of peers to maintain in the mesh per topic.
    /// Default: 4 (tuned down from gossipsub default of 6 for chat workloads)
    #[serde(default = "default_gossipsub_mesh_n")]
    pub gossipsub_mesh_n: usize,

    /// Gossipsub mesh low watermark (D_lo).
    /// Triggers mesh repair when below this number of mesh peers.
    /// Default: 3
    #[serde(default = "default_gossipsub_mesh_n_low")]
    pub gossipsub_mesh_n_low: usize,

    /// Gossipsub mesh high watermark (D_hi).
    /// Prunes mesh when above this number of mesh peers.
    /// Default: 8
    #[serde(default = "default_gossipsub_mesh_n_high")]
    pub gossipsub_mesh_n_high: usize,

    /// Maximum size of a single gossipsub message in bytes.
    /// Default: 65536 (64 KiB — accommodates text messages with metadata)
    #[serde(default = "default_gossipsub_max_transmit_size")]
    pub gossipsub_max_transmit_size: usize,

    /// Maximum number of concurrent relay circuits.
    /// Default: 64
    #[serde(default = "default_relay_max_circuits")]
    pub relay_max_circuits: usize,

    /// Maximum relay circuits per peer.
    /// Default: 8
    #[serde(default = "default_relay_max_circuits_per_peer")]
    pub relay_max_circuits_per_peer: usize,

    /// Maximum relay circuit duration in seconds.
    /// Default: 1800 (30 minutes — up from 2 min default for chat)
    #[serde(default = "default_relay_max_circuit_duration_secs")]
    pub relay_max_circuit_duration_secs: u64,

    /// Maximum bytes per relay circuit.
    /// Default: 10485760 (10 MB — up from 128 KB default for chat)
    #[serde(default = "default_relay_max_circuit_bytes")]
    pub relay_max_circuit_bytes: u64,
}

impl Default for P2pConfig {
    fn default() -> Self {
        Self {
            libp2p_port: default_libp2p_port(),
            gossipsub_mesh_n: default_gossipsub_mesh_n(),
            gossipsub_mesh_n_low: default_gossipsub_mesh_n_low(),
            gossipsub_mesh_n_high: default_gossipsub_mesh_n_high(),
            gossipsub_max_transmit_size: default_gossipsub_max_transmit_size(),
            relay_max_circuits: default_relay_max_circuits(),
            relay_max_circuits_per_peer: default_relay_max_circuits_per_peer(),
            relay_max_circuit_duration_secs: default_relay_max_circuit_duration_secs(),
            relay_max_circuit_bytes: default_relay_max_circuit_bytes(),
        }
    }
}

fn default_libp2p_port() -> u16 {
    1985
}
fn default_gossipsub_mesh_n() -> usize {
    4
}
fn default_gossipsub_mesh_n_low() -> usize {
    3
}
fn default_gossipsub_mesh_n_high() -> usize {
    8
}
fn default_gossipsub_max_transmit_size() -> usize {
    65536
}
fn default_relay_max_circuits() -> usize {
    64
}
fn default_relay_max_circuits_per_peer() -> usize {
    8
}
fn default_relay_max_circuit_duration_secs() -> u64 {
    1800
}
fn default_relay_max_circuit_bytes() -> u64 {
    10_485_760
}
