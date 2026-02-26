mod admin;
mod auth;
mod channels;
mod chat;
mod config;
mod db;
mod identity;
mod invite;
mod moderation;
mod p2p;
mod proto;
mod roles;
mod routes;
mod state;
mod ws;

use dashmap::DashMap;
use libp2p::{gossipsub, PeerId};
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

    // --- P2P Networking Setup ---
    let p2p_config = config.p2p.clone().unwrap_or_default();

    // Load or generate the server's libp2p Ed25519 identity keypair
    let keypair = p2p::identity::server_identity_keypair(&config.data_dir);
    let server_peer_id = PeerId::from(keypair.public()).to_string();

    // Query existing channels to subscribe to at startup
    let startup_topics = {
        let conn = db.lock().expect("DB lock for channel query");
        let mut stmt = conn
            .prepare("SELECT id FROM channels")
            .expect("Prepare channel query");
        let topics: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .expect("Query channels")
            .filter_map(|r| r.ok())
            .map(|channel_id| {
                // Topic namespace: first 16 hex chars of server PeerId / channel UUID
                let prefix = &server_peer_id[..std::cmp::min(16, server_peer_id.len())];
                format!("{}/{}", prefix, channel_id)
            })
            .collect();
        topics
    };

    // Build topic hashes for gossipsub peer scoring
    let topic_hashes: Vec<gossipsub::TopicHash> = startup_topics
        .iter()
        .map(|t| gossipsub::IdentTopic::new(t).hash())
        .collect();

    // Build the libp2p Swarm
    let swarm = p2p::swarm::build_swarm(keypair, &p2p_config, &topic_hashes).await;

    // Create communication channels between axum and the Swarm
    let (swarm_cmd_tx, swarm_cmd_rx) = tokio::sync::mpsc::unbounded_channel::<p2p::SwarmCommand>();
    let (swarm_evt_tx, swarm_evt_rx) = tokio::sync::mpsc::unbounded_channel::<p2p::SwarmEvent>();

    // Create shared peer directory
    let peer_directory = Arc::new(p2p::PeerDirectory::new());

    // Construct the libp2p listen multiaddr
    let libp2p_listen_addr: libp2p::Multiaddr = format!(
        "/ip4/0.0.0.0/tcp/{}/ws",
        p2p_config.libp2p_port
    )
    .parse()
    .expect("Valid libp2p multiaddr");

    // Spawn the Swarm event loop
    let peer_dir_for_swarm = peer_directory.clone();
    tokio::spawn(async move {
        p2p::swarm::run_swarm_loop(
            swarm,
            swarm_cmd_rx,
            swarm_evt_tx,
            peer_dir_for_swarm,
            libp2p_listen_addr,
        )
        .await;
    });

    // Subscribe to all existing channel topics at startup
    for topic in &startup_topics {
        let _ = swarm_cmd_tx.send(p2p::SwarmCommand::SubscribeTopic(topic.clone()));
    }
    if !startup_topics.is_empty() {
        tracing::info!(
            "Subscribed to {} existing channel gossipsub topics",
            startup_topics.len()
        );
    }

    // Spawn event consumer task to handle gossipsub messages.
    // Uses spawn_blocking for DB writes to avoid starving the swarm loop.
    // After persistence, broadcasts NewMessageEvent to all WS clients.
    let evt_db = db.clone();
    let evt_connections = ws::new_connection_registry(); // placeholder, replaced below after app_state
    // We need the connection registry from the app state. Since we build app_state after this,
    // we create the registry early and share it.
    drop(evt_connections); // unused — we share via connections_for_gossip below

    let connections_for_gossip = ws::new_connection_registry();
    let connections_for_state = connections_for_gossip.clone();

    tokio::spawn(async move {
        let mut evt_rx = swarm_evt_rx;
        let gossip_connections = connections_for_gossip;
        while let Some(event) = evt_rx.recv().await {
            match event {
                p2p::SwarmEvent::GossipMessage {
                    source,
                    topic,
                    data,
                } => {
                    tracing::debug!(
                        "Received gossipsub message from {} on {}, {} bytes",
                        source,
                        topic,
                        data.len()
                    );
                    // Decode, verify, and persist the message
                    let db_clone = evt_db.clone();
                    let conns = gossip_connections.clone();
                    tokio::task::spawn_blocking(move || {
                        match p2p::messages::decode_and_verify_gossip_envelope(&data) {
                            Ok(envelope) => {
                                match p2p::messages::handle_gossip_message(&db_clone, &envelope) {
                                    Ok(result) => {
                                        tracing::debug!(
                                            "Persisted gossipsub message from {} on {}, seq={}",
                                            source,
                                            topic,
                                            result.server_sequence
                                        );
                                        // Broadcast to WS clients if it was a chat message
                                        if let Some(chat_msg) = result.chat_message {
                                            chat::broadcast::broadcast_new_message(&conns, chat_msg);
                                        }
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            "Failed to persist gossipsub message: {}",
                                            e
                                        );
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "Failed to verify gossipsub message from {}: {}",
                                    source,
                                    e
                                );
                            }
                        }
                    });
                }
                p2p::SwarmEvent::PeerConnected(peer_id) => {
                    tracing::info!("P2P peer connected: {}", peer_id);
                }
                p2p::SwarmEvent::PeerDisconnected(peer_id) => {
                    tracing::info!("P2P peer disconnected: {}", peer_id);
                }
            }
        }
    });

    // Build application state
    // Use the shared connection registry so gossip event consumer can broadcast to WS clients.
    let app_state = state::AppState {
        db,
        challenges: Arc::new(DashMap::new()),
        jwt_secret,
        encryption_key,
        connections: connections_for_state,
        registration_mode: config.registration_mode.clone(),
        swarm_cmd_tx,
        peer_directory,
        server_peer_id,
        libp2p_port: p2p_config.libp2p_port,
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
