use clap::Parser;
use figment::{
    providers::{Env, Format, Serialized, Toml},
    Figment,
};
use serde::{Deserialize, Serialize};

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
"#
    .to_string()
}
