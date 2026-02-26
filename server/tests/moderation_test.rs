//! Integration tests for moderation: kick and ban.

use ed25519_dalek::{Signer, SigningKey};
use rand::Rng;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

fn random_signing_key() -> SigningKey {
    let secret: [u8; 32] = rand::rng().random();
    SigningKey::from_bytes(&secret)
}

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

async fn register_owner(base_url: &str, setup_token: &str) -> (String, String) {
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
            "display_name": "Owner",
            "encrypted_blob": hex::encode(b"test-blob"),
            "setup_token": setup_token,
            "genesis_signature": hex::encode(genesis_sig.to_bytes()),
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200, "Owner registration failed");
    let body: serde_json::Value = resp.json().await.unwrap();
    let access_token = body["access_token"].as_str().unwrap().to_string();
    let user_id = body["user_id"].as_str().unwrap().to_string();
    (access_token, user_id)
}

/// Register a regular user and return (access_token, user_id, fingerprint).
async fn register_user(base_url: &str, name: &str) -> (String, String, String) {
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
            "display_name": name,
            "encrypted_blob": hex::encode(b"test-blob"),
            "genesis_signature": hex::encode(genesis_sig.to_bytes()),
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200, "User registration failed for {}", name);
    let body: serde_json::Value = resp.json().await.unwrap();
    let access_token = body["access_token"].as_str().unwrap().to_string();
    let user_id = body["user_id"].as_str().unwrap().to_string();
    (access_token, user_id, fingerprint)
}

// =============================================================================
// Tests
// =============================================================================

#[tokio::test]
async fn test_kick_user() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;
    let (_, user_id, _) = register_user(&base_url, "KickTarget").await;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/moderation/kick", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "user_id": user_id }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200, "Kick should return 200");
}

#[tokio::test]
async fn test_kick_requires_kick_members_permission() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (_, owner_id) = register_owner(&base_url, &setup_token).await;
    let (user_token, _, _) = register_user(&base_url, "RegularUser").await;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/moderation/kick", base_url))
        .header("Authorization", format!("Bearer {}", user_token))
        .json(&json!({ "user_id": owner_id }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 403, "Non-admin kick should return 403");
}

#[tokio::test]
async fn test_ban_user() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;
    let (_, user_id, _) = register_user(&base_url, "BanTarget").await;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/moderation/ban", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "user_id": user_id, "reason": "spam" }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200, "Ban should return 200");
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body["ban_id"].as_str().is_some(), "Should return ban_id");
}

#[tokio::test]
async fn test_ban_with_expiration() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;
    let (_, user_id, fingerprint) = register_user(&base_url, "TempBan").await;

    let client = reqwest::Client::new();

    // Ban for 2 seconds
    let expires_at = (chrono::Utc::now() + chrono::Duration::seconds(2)).to_rfc3339();
    let resp = client
        .post(format!("{}/api/moderation/ban", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "user_id": user_id, "expires_at": expires_at }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    // Verify ban is active via ban list
    let bans_resp = client
        .get(format!("{}/api/moderation/bans", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();
    assert_eq!(bans_resp.status(), 200);
    let bans: serde_json::Value = bans_resp.json().await.unwrap();
    let bans_list = bans["bans"].as_array().unwrap();
    assert!(
        bans_list.iter().any(|b| b["fingerprint"].as_str().unwrap() == fingerprint),
        "Banned user should appear in ban list"
    );

    // Wait for expiry
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    // Verify ban has expired (lazy cleanup)
    let bans_resp2 = client
        .get(format!("{}/api/moderation/bans", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();
    let bans2: serde_json::Value = bans_resp2.json().await.unwrap();
    let bans_list2 = bans2["bans"].as_array().unwrap();
    assert!(
        !bans_list2.iter().any(|b| b["fingerprint"].as_str().unwrap() == fingerprint),
        "Expired ban should no longer appear in ban list"
    );
}

#[tokio::test]
async fn test_cannot_ban_owner() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, owner_id) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/moderation/ban", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "user_id": owner_id }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 403, "Cannot ban the server owner");
}

#[tokio::test]
async fn test_unban_user() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;
    let (_, user_id, fingerprint) = register_user(&base_url, "UnbanTarget").await;

    let client = reqwest::Client::new();

    // Ban user
    let resp = client
        .post(format!("{}/api/moderation/ban", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "user_id": user_id }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    // Unban user
    let resp = client
        .post(format!("{}/api/moderation/unban", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "fingerprint": fingerprint }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200, "Unban should return 200");

    // Verify ban list is empty
    let bans_resp = client
        .get(format!("{}/api/moderation/bans", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();
    let bans: serde_json::Value = bans_resp.json().await.unwrap();
    let bans_list = bans["bans"].as_array().unwrap();
    assert!(bans_list.is_empty(), "Ban list should be empty after unban");
}

#[tokio::test]
async fn test_ban_includes_reason() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;
    let (_, user_id, fingerprint) = register_user(&base_url, "ReasonBan").await;

    let client = reqwest::Client::new();

    // Ban with reason
    let resp = client
        .post(format!("{}/api/moderation/ban", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "user_id": user_id, "reason": "spamming" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    // Verify reason in ban list
    let bans_resp = client
        .get(format!("{}/api/moderation/bans", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();
    let bans: serde_json::Value = bans_resp.json().await.unwrap();
    let bans_list = bans["bans"].as_array().unwrap();
    let ban = bans_list
        .iter()
        .find(|b| b["fingerprint"].as_str().unwrap() == fingerprint)
        .expect("Should find ban");
    assert_eq!(ban["reason"].as_str().unwrap(), "spamming");
}
