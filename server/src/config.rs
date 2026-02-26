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
"#
    .to_string()
}
