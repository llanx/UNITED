//! Integration tests for channel and category CRUD operations.
//! Tests cover: starter template seeding, create/rename/delete channels,
//! create/delete categories, reorder channels, and permission checks.

use ed25519_dalek::{SigningKey, Signer};
use rand::Rng;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

/// Generate a signing key from random bytes (avoids rand_core version conflict).
fn random_signing_key() -> SigningKey {
    let secret: [u8; 32] = rand::rng().random();
    SigningKey::from_bytes(&secret)
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
        max_upload_size_mb: None,
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

/// Register a user as owner (with setup_token) and return (access_token, user_id).
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

/// Register a non-owner user (open registration, no setup_token) and return access_token.
async fn register_regular_user(base_url: &str, name: &str) -> String {
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
    body["access_token"].as_str().unwrap().to_string()
}

// =============================================================================
// Tests
// =============================================================================

#[tokio::test]
async fn test_get_channels_returns_starter_template() {
    let (base_url, setup_token, _addr) = start_test_server().await;
    let (token, _user_id) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200, "GET /api/channels should return 200");
    let body: serde_json::Value = resp.json().await.unwrap();

    // Should have categories array
    let categories = body["categories"].as_array().expect("Expected categories array");
    assert_eq!(categories.len(), 2, "Should have 2 categories (General + Voice)");

    // General category should have #general and #introductions
    let general_cat = &categories[0];
    assert_eq!(general_cat["category"]["name"].as_str().unwrap(), "General");
    let general_channels = general_cat["channels"].as_array().unwrap();
    assert_eq!(general_channels.len(), 2, "General should have 2 channels");
    assert_eq!(general_channels[0]["name"].as_str().unwrap(), "general");
    assert_eq!(general_channels[1]["name"].as_str().unwrap(), "introductions");

    // Voice category should have one voice channel
    let voice_cat = &categories[1];
    assert_eq!(voice_cat["category"]["name"].as_str().unwrap(), "Voice");
    let voice_channels = voice_cat["channels"].as_array().unwrap();
    assert_eq!(voice_channels.len(), 1, "Voice should have 1 channel");
    assert_eq!(voice_channels[0]["channel_type"].as_str().unwrap(), "voice");
}

#[tokio::test]
async fn test_create_channel() {
    let (base_url, setup_token, _addr) = start_test_server().await;
    let (token, _user_id) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();

    // First get the channel list to find the General category ID
    let list_resp = client
        .get(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();
    let list_body: serde_json::Value = list_resp.json().await.unwrap();
    let category_id = list_body["categories"][0]["category"]["id"]
        .as_str()
        .unwrap()
        .to_string();

    // Create a new text channel
    let resp = client
        .post(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({
            "name": "test-channel",
            "channel_type": "text",
            "category_id": category_id,
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 201, "POST /api/channels should return 201");
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body["id"].as_str().is_some(), "Should have an id");
    assert_eq!(body["name"].as_str().unwrap(), "test-channel");
    assert!(body["position"].as_i64().is_some(), "Should have a position");
}

#[tokio::test]
async fn test_rename_channel() {
    let (base_url, setup_token, _addr) = start_test_server().await;
    let (token, _user_id) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();

    // Get channel list to find General category ID
    let list_resp = client
        .get(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();
    let list_body: serde_json::Value = list_resp.json().await.unwrap();
    let category_id = list_body["categories"][0]["category"]["id"]
        .as_str()
        .unwrap()
        .to_string();

    // Create a channel to rename
    let create_resp = client
        .post(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({
            "name": "to-rename",
            "channel_type": "text",
            "category_id": category_id,
        }))
        .send()
        .await
        .unwrap();
    let create_body: serde_json::Value = create_resp.json().await.unwrap();
    let channel_id = create_body["id"].as_str().unwrap();

    // Rename the channel
    let resp = client
        .put(format!("{}/api/channels/{}", base_url, channel_id))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({ "name": "renamed" }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200, "PUT /api/channels/:id should return 200");
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["name"].as_str().unwrap(), "renamed");
}

#[tokio::test]
async fn test_delete_channel() {
    let (base_url, setup_token, _addr) = start_test_server().await;
    let (token, _user_id) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();

    // Get channel list to find General category ID
    let list_resp = client
        .get(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();
    let list_body: serde_json::Value = list_resp.json().await.unwrap();
    let category_id = list_body["categories"][0]["category"]["id"]
        .as_str()
        .unwrap()
        .to_string();

    // Create a channel to delete
    let create_resp = client
        .post(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({
            "name": "to-delete",
            "channel_type": "text",
            "category_id": category_id,
        }))
        .send()
        .await
        .unwrap();
    let create_body: serde_json::Value = create_resp.json().await.unwrap();
    let channel_id = create_body["id"].as_str().unwrap().to_string();

    // Delete the channel
    let resp = client
        .delete(format!("{}/api/channels/{}", base_url, channel_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200, "DELETE /api/channels/:id should return 200");

    // Verify it's gone from the channel list
    let list_resp2 = client
        .get(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();
    let list_body2: serde_json::Value = list_resp2.json().await.unwrap();
    let all_channels: Vec<&serde_json::Value> = list_body2["categories"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|cat| cat["channels"].as_array().unwrap())
        .collect();
    assert!(
        !all_channels.iter().any(|c| c["id"].as_str().unwrap() == channel_id),
        "Deleted channel should not appear in channel list"
    );
}

#[tokio::test]
async fn test_create_category() {
    let (base_url, setup_token, _addr) = start_test_server().await;
    let (token, _user_id) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/categories", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({ "name": "New Category" }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 201, "POST /api/categories should return 201");
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body["id"].as_str().is_some(), "Should have an id");
    assert_eq!(body["name"].as_str().unwrap(), "New Category");
    assert!(body["position"].as_i64().is_some(), "Should have a position");
}

#[tokio::test]
async fn test_delete_category_fails_if_has_channels() {
    let (base_url, setup_token, _addr) = start_test_server().await;
    let (token, _user_id) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();

    // Get the General category ID (it has channels from the starter template)
    let list_resp = client
        .get(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();
    let list_body: serde_json::Value = list_resp.json().await.unwrap();
    let category_id = list_body["categories"][0]["category"]["id"]
        .as_str()
        .unwrap();

    // Try to delete it - should fail with 400
    let resp = client
        .delete(format!("{}/api/categories/{}", base_url, category_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();

    assert_eq!(
        resp.status(),
        400,
        "DELETE /api/categories/:id with channels should return 400"
    );
}

#[tokio::test]
async fn test_reorder_channels() {
    let (base_url, setup_token, _addr) = start_test_server().await;
    let (token, _user_id) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();

    // Get channel list to find General category ID
    let list_resp = client
        .get(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();
    let list_body: serde_json::Value = list_resp.json().await.unwrap();
    let category_id = list_body["categories"][0]["category"]["id"]
        .as_str()
        .unwrap()
        .to_string();

    // Create 3 channels
    let mut channel_ids = Vec::new();
    for i in 1..=3 {
        let resp = client
            .post(format!("{}/api/channels", base_url))
            .header("Authorization", format!("Bearer {}", token))
            .json(&json!({
                "name": format!("reorder-{}", i),
                "channel_type": "text",
                "category_id": category_id,
            }))
            .send()
            .await
            .unwrap();
        let body: serde_json::Value = resp.json().await.unwrap();
        channel_ids.push(body["id"].as_str().unwrap().to_string());
    }

    // Reorder: reverse the 3 channels
    let reorder_entries: Vec<serde_json::Value> = channel_ids
        .iter()
        .enumerate()
        .map(|(i, id)| {
            json!({
                "id": id,
                "position": ((channel_ids.len() - i) as i64) * 1000,
            })
        })
        .collect();

    let resp = client
        .put(format!("{}/api/channels/reorder", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({ "entries": reorder_entries }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200, "PUT /api/channels/reorder should return 200");

    // Verify new ordering by getting the channel list
    let list_resp2 = client
        .get(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();
    let list_body2: serde_json::Value = list_resp2.json().await.unwrap();
    let general_channels = list_body2["categories"][0]["channels"]
        .as_array()
        .unwrap();

    // Find the reorder-* channels in the list and verify positions
    let reordered: Vec<&serde_json::Value> = general_channels
        .iter()
        .filter(|c| {
            c["name"]
                .as_str()
                .unwrap_or("")
                .starts_with("reorder-")
        })
        .collect();

    assert_eq!(reordered.len(), 3, "Should have 3 reordered channels");

    // After reorder, channel_ids[0] (reorder-1) should have position 3000 (highest = last)
    // and channel_ids[2] (reorder-3) should have position 1000 (lowest = first)
    // Channels are ordered by position ascending, so reorder-3 should come first
    assert_eq!(
        reordered[0]["name"].as_str().unwrap(),
        "reorder-3",
        "reorder-3 should be first (lowest position)"
    );
    assert_eq!(
        reordered[2]["name"].as_str().unwrap(),
        "reorder-1",
        "reorder-1 should be last (highest position)"
    );
}

#[tokio::test]
async fn test_channel_crud_requires_manage_channels_permission() {
    let (base_url, setup_token, _addr) = start_test_server().await;

    // Register the owner first (consumes setup token)
    let (_owner_token, _owner_id) = register_owner(&base_url, &setup_token).await;

    // Register a regular user (no MANAGE_CHANNELS permission)
    let user_token = register_regular_user(&base_url, "RegularUser").await;

    let client = reqwest::Client::new();

    // Try to create a channel as a regular user - should get 403 FORBIDDEN
    let resp = client
        .post(format!("{}/api/channels", base_url))
        .header("Authorization", format!("Bearer {}", user_token))
        .json(&json!({
            "name": "unauthorized",
            "channel_type": "text",
            "category_id": "some-category-id",
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(
        resp.status(),
        403,
        "Non-admin user should get 403 FORBIDDEN for channel creation"
    );
}
