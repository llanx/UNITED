mod admin;
mod auth;
mod config;
mod db;
mod identity;
mod proto;
mod roles;
mod routes;
mod state;
mod ws;

use dashmap::DashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

use config::{generate_config_template, Config};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load config with layered precedence: defaults < TOML < env < CLI
    let config = Config::load()?;

    // Handle --generate-config: print template and exit
    if config.generate_config {
        print!("{}", generate_config_template());
        return Ok(());
    }

    // Initialize tracing/logging
    if config.json_logs {
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| "united_server=info".parse().unwrap()),
            )
            .init();
    } else {
        tracing_subscriber::fmt()
            .pretty()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| "united_server=info".parse().unwrap()),
            )
            .init();
    }

    tracing::info!(
        "UNITED server v{} starting",
        env!("CARGO_PKG_VERSION")
    );

    // Initialize SQLite database
    let db = db::init_db(&config.data_dir)?;

    // Load or generate JWT signing key (256-bit random, stored in data_dir)
    let jwt_secret = auth::jwt::load_or_generate_jwt_secret(&config.data_dir)?;

    // Load or generate AES-256-GCM encryption key for TOTP secrets
    let encryption_key = auth::jwt::load_or_generate_encryption_key(&config.data_dir)?;

    // Check for first-boot setup token
    match admin::setup::maybe_generate_setup_token(&db)? {
        Some(token) => {
            tracing::info!("==========================================================");
            tracing::info!("  FIRST BOOT: No users registered yet.");
            tracing::info!("  Setup token: {}", token);
            tracing::info!("  The first identity to register with this token becomes");
            tracing::info!("  the server OWNER.");
            tracing::info!("==========================================================");
        }
        None => {
            tracing::info!("Server has existing users, setup complete");
        }
    }

    // Build application state
    let app_state = state::AppState {
        db,
        challenges: Arc::new(DashMap::new()),
        jwt_secret,
        encryption_key,
        connections: ws::new_connection_registry(),
        registration_mode: config.registration_mode.clone(),
    };

    // Build router
    let app = routes::build_router(app_state);

    // Bind and serve
    let addr = format!("{}:{}", config.bind_address, config.port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("Listening on {}", addr);

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
