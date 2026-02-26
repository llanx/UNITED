//! Integration tests for WebSocket connection, auth, ping/pong, and message dispatch.

use ed25519_dalek::{SigningKey, Signer};
use futures_util::{SinkExt, StreamExt};
use prost::Message as ProstMessage;
use rand::Rng;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;

/// Generate a signing key from random bytes (avoids rand_core version conflict).
fn random_signing_key() -> SigningKey {
    let secret: [u8; 32] = rand::rng().random();
    SigningKey::from_bytes(&secret)
}

/// Drain any initial presence snapshot messages sent on WS connect.
/// The server now broadcasts presence updates when a client connects.
async fn drain_presence_messages(
    read: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
) {
    loop {
        match tokio::time::timeout(Duration::from_millis(200), read.next()).await {
            Ok(Some(Ok(Message::Binary(_)))) => {
                // Presence snapshot message — keep draining
                continue;
            }
            _ => break, // Timeout or no more messages
        }
    }
}

/// Helper: start the server on a random port and return (base_url, setup_token, addr).
async fn start_test_server() -> (String, String, SocketAddr) {
    let tmp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let data_dir = tmp_dir.path().to_str().unwrap().to_string();

    let db = united_server::db::init_db(&data_dir).expect("Failed to init DB");
    let jwt_secret = united_server::auth::jwt::load_or_generate_jwt_secret(&data_dir)
        .expect("Failed to generate JWT secret");
    let encryption_key = united_server::auth::jwt::load_or_generate_encryption_key(&data_dir)
        .expect("Failed to generate encryption key");
    let setup_token = united_server::admin::setup::maybe_generate_setup_token(&db)
        .expect("Failed to generate setup token")
        .expect("Expected setup token");

    let connections = united_server::ws::new_connection_registry();

    let (swarm_cmd_tx, _swarm_cmd_rx) = tokio::sync::mpsc::unbounded_channel();
    let state = united_server::state::AppState {
        db,
        challenges: Arc::new(dashmap::DashMap::new()),
        jwt_secret,
        encryption_key,
        connections,
        registration_mode: "open".to_string(),
        swarm_cmd_tx,
        peer_directory: Arc::new(united_server::p2p::PeerDirectory::new()),
        server_peer_id: "test-peer-id".to_string(),
        libp2p_port: 0,
        presence: Arc::new(dashmap::DashMap::new()),
        data_dir: data_dir.clone(),
        block_retention_days: None,
        block_cleanup_interval_secs: None,
    };

    let app = united_server::routes::build_router(state);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .unwrap();
        let _keep = tmp_dir;
    });

    let base_url = format!("http://{}", addr);
    (base_url, setup_token, addr)
}

/// Register a user and return (access_token, fingerprint).
async fn register_user(
    base_url: &str,
    setup_token: &str,
    display_name: &str,
) -> (String, String, SigningKey) {
    let client = reqwest::Client::new();
    let signing_key = random_signing_key();
    let verifying_key = signing_key.verifying_key();
    let public_key_hex = hex::encode(verifying_key.as_bytes());

    let mut hasher = Sha256::new();
    hasher.update(verifying_key.as_bytes());
    let hash = hasher.finalize();
    let fingerprint = base32::encode(base32::Alphabet::Rfc4648 { padding: false }, &hash[..20]);

    let genesis_sig = signing_key.sign(b"genesis");
    let resp = client
        .post(format!("{}/api/auth/register", base_url))
        .json(&json!({
            "public_key": public_key_hex,
            "fingerprint": fingerprint,
            "display_name": display_name,
            "encrypted_blob": hex::encode(b"test-blob"),
            "setup_token": setup_token,
            "genesis_signature": hex::encode(genesis_sig.to_bytes()),
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200, "Registration failed for {}", display_name);
    let body: serde_json::Value = resp.json().await.unwrap();
    let access_token = body["access_token"].as_str().unwrap().to_string();

    (access_token, fingerprint, signing_key)
}

#[tokio::test]
async fn test_ws_connection_with_valid_jwt() {
    let (base_url, setup_token, addr) = start_test_server().await;
    let (access_token, _fingerprint, _signing_key) =
        register_user(&base_url, &setup_token, "WsUser1").await;

    // Connect to WebSocket with valid JWT
    let ws_url = format!("ws://{}/ws?token={}", addr, access_token);
    let (ws_stream, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("Failed to connect to WebSocket");

    let (mut _write, mut read) = ws_stream.split();

    // Server sends presence snapshot on connect (own ONLINE status).
    // Drain initial presence messages, then verify connection stays open.
    drain_presence_messages(&mut read).await;

    // After draining presence, connection should stay open with no further messages
    let result = tokio::time::timeout(Duration::from_millis(500), read.next()).await;
    assert!(result.is_err(), "Expected timeout after presence drain, got message");
}

#[tokio::test]
async fn test_ws_auth_failure_expired_token() {
    let (_base_url, _setup_token, addr) = start_test_server().await;

    // Use a completely invalid token
    let ws_url = format!("ws://{}/ws?token=invalid_jwt_token", addr);
    let (ws_stream, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("WebSocket should upgrade even with invalid token");

    let (mut _write, mut read) = ws_stream.split();

    // Server should immediately send a close frame with code 4002 (token invalid)
    let msg = tokio::time::timeout(Duration::from_secs(2), read.next())
        .await
        .expect("Expected close message within timeout");

    match msg {
        Some(Ok(Message::Close(Some(frame)))) => {
            assert_eq!(
                frame.code,
                tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::from(4002),
                "Expected close code 4002 (token invalid)"
            );
        }
        Some(Ok(Message::Close(None))) => {
            // Close without frame — acceptable for invalid token
        }
        other => {
            // The connection might just close — that's also acceptable
            // as long as we don't get a normal message
            if let Some(Ok(msg)) = other {
                assert!(
                    msg.is_close(),
                    "Expected close message, got: {:?}",
                    msg
                );
            }
        }
    }
}

#[tokio::test]
async fn test_ws_ping_pong() {
    let (base_url, setup_token, addr) = start_test_server().await;
    let (access_token, _fingerprint, _signing_key) =
        register_user(&base_url, &setup_token, "PingPongUser").await;

    let ws_url = format!("ws://{}/ws?token={}", addr, access_token);
    let (ws_stream, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("Failed to connect");

    let (mut write, mut read) = ws_stream.split();

    // Drain presence snapshot messages first
    drain_presence_messages(&mut read).await;

    // Send a client ping
    write
        .send(Message::Ping(vec![42, 43, 44].into()))
        .await
        .expect("Failed to send ping");

    // We should receive a pong back
    let msg = tokio::time::timeout(Duration::from_secs(2), read.next())
        .await
        .expect("Expected pong within timeout");

    match msg {
        Some(Ok(Message::Pong(data))) => {
            assert_eq!(data.as_ref(), &[42, 43, 44], "Pong data should match ping");
        }
        other => {
            panic!("Expected Pong message, got: {:?}", other);
        }
    }
}

#[tokio::test]
async fn test_ws_protobuf_server_info_request() {
    let (base_url, setup_token, addr) = start_test_server().await;
    let (access_token, _fingerprint, _signing_key) =
        register_user(&base_url, &setup_token, "ProtoUser").await;

    let ws_url = format!("ws://{}/ws?token={}", addr, access_token);
    let (ws_stream, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("Failed to connect");

    let (mut write, mut read) = ws_stream.split();

    // Drain presence snapshot messages first
    drain_presence_messages(&mut read).await;

    // Send a ServerInfoRequest via protobuf envelope
    let envelope = united_server::proto::ws::Envelope {
        request_id: "test-req-1".to_string(),
        payload: Some(
            united_server::proto::ws::envelope::Payload::ServerInfoRequest(
                united_server::proto::ws::ServerInfoRequest {},
            ),
        ),
    };

    let mut buf = Vec::new();
    envelope.encode(&mut buf).expect("Failed to encode protobuf");
    write
        .send(Message::Binary(buf.into()))
        .await
        .expect("Failed to send protobuf");

    // Read the response
    let msg = tokio::time::timeout(Duration::from_secs(2), read.next())
        .await
        .expect("Expected response within timeout");

    match msg {
        Some(Ok(Message::Binary(data))) => {
            let response = united_server::proto::ws::Envelope::decode(data.as_ref())
                .expect("Failed to decode protobuf response");

            assert_eq!(response.request_id, "test-req-1", "Request ID should echo back");

            match response.payload {
                Some(united_server::proto::ws::envelope::Payload::ServerInfoResponse(info_resp)) => {
                    let info = info_resp.info.expect("Should contain server info");
                    assert!(!info.name.is_empty(), "Server name should not be empty");
                    assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
                }
                other => panic!("Expected ServerInfoResponse, got: {:?}", other),
            }
        }
        other => {
            panic!("Expected Binary message, got: {:?}", other);
        }
    }
}

#[tokio::test]
async fn test_ws_connection_cleanup_on_disconnect() {
    let (base_url, setup_token, addr) = start_test_server().await;
    let (access_token, _fingerprint, _signing_key) =
        register_user(&base_url, &setup_token, "CleanupUser").await;

    let ws_url = format!("ws://{}/ws?token={}", addr, access_token);

    // Connect and then immediately close
    {
        let (ws_stream, _) = tokio_tungstenite::connect_async(&ws_url)
            .await
            .expect("Failed to connect");

        let (mut write, _read) = ws_stream.split();

        // Send close frame
        write
            .send(Message::Close(None))
            .await
            .expect("Failed to send close");
    }

    // Give the server a moment to clean up
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Reconnect should work fine (connection was cleaned up)
    let (ws_stream2, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("Failed to reconnect after cleanup");

    let (mut _write2, mut read2) = ws_stream2.split();

    // Drain presence snapshot messages first
    drain_presence_messages(&mut read2).await;

    // After draining presence, connection should be alive with no further messages
    let result = tokio::time::timeout(Duration::from_millis(300), read2.next()).await;
    assert!(result.is_err(), "Expected timeout after presence drain (connection alive)");
}
