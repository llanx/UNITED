use clap::Parser;
use figment::{
    providers::{Env, Format, Serialized, Toml},
    Figment,
};
use serde::{Deserialize, Serialize};

use crate::p2p::config::P2pConfig;

/// UNITED coordination server
#[derive(Parser, Serialize, Deserialize, Clone, Debug)]
#[command(name = "united-server", version, about = "UNITED coordination server")]
pub struct Config {
    /// Port to listen on
    #[arg(long, env = "UNITED_PORT", default_value = "1984")]
    pub port: u16,

    /// Bind address
    #[arg(long, env = "UNITED_BIND_ADDRESS", default_value = "0.0.0.0")]
    pub bind_address: String,

    /// Path to TOML config file
    #[arg(long, default_value = "./united.toml")]
    pub config: String,

    /// Enable structured JSON logging (for Docker/production)
    #[arg(long, env = "UNITED_JSON_LOGS")]
    pub json_logs: bool,

    /// Output a commented TOML config template and exit
    #[arg(long)]
    pub generate_config: bool,

    /// Data directory for persistent state (DB, keys)
    #[arg(long, env = "UNITED_DATA_DIR", default_value = "./data")]
    pub data_dir: String,

    /// Registration mode: "open" or "invite-only"
    #[arg(long, env = "UNITED_REGISTRATION_MODE", default_value = "open")]
    pub registration_mode: String,

    /// P2P networking configuration (loaded from [p2p] section in TOML)
    #[arg(skip)]
    #[serde(default = "default_p2p_config")]
    pub p2p: Option<P2pConfig>,

    /// Block storage configuration (loaded from [blocks] section in TOML)
    #[arg(skip)]
    #[serde(default)]
    pub blocks: Option<BlocksConfig>,

    /// TURN relay configuration (loaded from [turn] section in TOML)
    #[arg(skip)]
    #[serde(default)]
    pub turn: Option<TurnConfig>,
}

/// Configuration for the content-addressed block store.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlocksConfig {
    /// Number of days to retain blocks before automatic purge (default: 30)
    #[serde(default = "default_retention_days")]
    pub retention_days: u32,

    /// Interval in seconds between retention cleanup runs (default: 3600 = 1 hour)
    #[serde(default = "default_cleanup_interval")]
    pub cleanup_interval_secs: u64,

    /// Maximum upload size in megabytes per block (default: 100)
    #[serde(default = "default_max_upload_size")]
    pub max_upload_size_mb: u32,
}

impl Default for BlocksConfig {
    fn default() -> Self {
        Self {
            retention_days: 30,
            cleanup_interval_secs: 3600,
            max_upload_size_mb: 100,
        }
    }
}

fn default_retention_days() -> u32 {
    30
}

fn default_cleanup_interval() -> u64 {
    3600
}

fn default_max_upload_size() -> u32 {
    100
}

/// Configuration for the TURN relay server (voice channel NAT traversal).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnConfig {
    /// Whether TURN relay is enabled (default: false)
    #[serde(default)]
    pub enabled: bool,

    /// TURN server hostname or IP (default: "127.0.0.1")
    #[serde(default = "default_turn_host")]
    pub host: String,

    /// TURN server port (default: 3478)
    #[serde(default = "default_turn_port")]
    pub port: u16,

    /// Shared secret for generating time-limited TURN credentials
    /// Auto-generated on first boot if empty.
    #[serde(default)]
    pub shared_secret: String,

    /// Credential TTL in seconds (default: 86400 = 24 hours)
    #[serde(default = "default_credential_ttl")]
    pub credential_ttl_secs: u64,
}

impl Default for TurnConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            host: "127.0.0.1".to_string(),
            port: 3478,
            shared_secret: String::new(),
            credential_ttl_secs: 86400,
        }
    }
}

fn default_turn_host() -> String {
    "127.0.0.1".to_string()
}

fn default_turn_port() -> u16 {
    3478
}

fn default_credential_ttl() -> u64 {
    86400
}

fn default_p2p_config() -> Option<P2pConfig> {
    Some(P2pConfig::default())
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 1984,
            bind_address: "0.0.0.0".to_string(),
            config: "./united.toml".to_string(),
            json_logs: false,
            generate_config: false,
            data_dir: "./data".to_string(),
            registration_mode: "open".to_string(),
            p2p: Some(P2pConfig::default()),
            blocks: None,
            turn: None,
        }
    }
}

impl Config {
    /// Load config with layered precedence:
    /// built-in defaults < TOML file < env vars (UNITED_*) < CLI args
    pub fn load() -> Result<Self, figment::Error> {
        let cli = Config::parse();
        let config_path = cli.config.clone();

        Figment::new()
            .merge(Serialized::defaults(Config::default()))
            .merge(Toml::file(&config_path))
            .merge(Env::prefixed("UNITED_"))
            .merge(Serialized::defaults(cli))
            .extract()
    }
}

/// Generate a commented TOML config template
pub fn generate_config_template() -> String {
    r#"# UNITED Coordination Server Configuration
# Place this file at ./united.toml or specify with --config <path>
# All settings can be overridden via environment variables (UNITED_PORT, etc.)
# or CLI flags (--port, etc.)

# Server port (default: 1984)
# port = 1984

# Bind address (default: 0.0.0.0 — all interfaces)
# bind_address = "0.0.0.0"

# Enable structured JSON logging for Docker/production
# json_logs = false

# Data directory for SQLite database and JWT signing key
# data_dir = "./data"

# Registration mode: "open" or "invite-only"
# Default: open (anyone can register)
# Admin can change at runtime via API
# registration_mode = "open"

# ---- P2P Networking ----
# [p2p]

# libp2p WebSocket listener port (separate from HTTP port)
# libp2p_port = 1985

# Gossipsub mesh parameters (tuned for chat workloads)
# gossipsub_mesh_n = 4          # D: mesh degree (peers per topic)
# gossipsub_mesh_n_low = 3      # D_lo: triggers mesh repair below this
# gossipsub_mesh_n_high = 8     # D_hi: prunes mesh above this
# gossipsub_max_transmit_size = 65536  # Max message size in bytes (64 KiB)

# Circuit Relay v2 limits (tuned for chat — defaults are too restrictive)
# relay_max_circuits = 64                # Max concurrent relay circuits
# relay_max_circuits_per_peer = 8        # Max circuits per peer
# relay_max_circuit_duration_secs = 1800 # 30 minutes per circuit
# relay_max_circuit_bytes = 10485760     # 10 MB per circuit

# ---- Block Storage (Content Distribution) ----
# [blocks]

# Number of days to retain content blocks before automatic purge (default: 30)
# retention_days = 30

# Interval in seconds between retention cleanup runs (default: 3600 = 1 hour)
# cleanup_interval_secs = 3600

# Maximum upload size in megabytes per block (default: 100)
# max_upload_size_mb = 100

# ---- TURN Relay (Voice Channels) ----
# [turn]
# enabled = false
# host = "127.0.0.1"
# port = 3478
# shared_secret = ""  # Auto-generated on first boot if empty
# credential_ttl_secs = 86400  # 24 hours
"#
    .to_string()
}
