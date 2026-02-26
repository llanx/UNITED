//! Integration tests for invite system: creation, consumption, landing page, limits.

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

/// Start a test server in invite-only mode.
async fn start_invite_only_server() -> (String, String, SocketAddr) {
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
        registration_mode: "invite-only".to_string(),
        swarm_cmd_tx,
        peer_directory: Arc::new(united_server::p2p::PeerDirectory::new()),
        server_peer_id: "test-peer-id".to_string(),
        libp2p_port: 0,
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
    (
        body["access_token"].as_str().unwrap().to_string(),
        body["user_id"].as_str().unwrap().to_string(),
    )
}

/// Register a user with optional invite_code. Returns (access_token, user_id).
async fn register_with_invite(
    base_url: &str,
    name: &str,
    invite_code: Option<&str>,
) -> Result<(String, String), u16> {
    let client = reqwest::Client::new();
    let signing_key = random_signing_key();
    let verifying_key = signing_key.verifying_key();
    let public_key_hex = hex::encode(verifying_key.as_bytes());

    let mut hasher = Sha256::new();
    hasher.update(verifying_key.as_bytes());
    let hash = hasher.finalize();
    let fingerprint = base32::encode(base32::Alphabet::Rfc4648 { padding: false }, &hash[..20]);

    let genesis_sig = signing_key.sign(b"genesis");
    let mut body = json!({
        "public_key": public_key_hex,
        "fingerprint": fingerprint,
        "display_name": name,
        "encrypted_blob": hex::encode(b"test-blob"),
        "genesis_signature": hex::encode(genesis_sig.to_bytes()),
    });

    if let Some(code) = invite_code {
        body["invite_code"] = json!(code);
    }

    let resp = client
        .post(format!("{}/api/auth/register", base_url))
        .json(&body)
        .send()
        .await
        .unwrap();

    let status = resp.status().as_u16();
    if status == 200 {
        let body: serde_json::Value = resp.json().await.unwrap();
        Ok((
            body["access_token"].as_str().unwrap().to_string(),
            body["user_id"].as_str().unwrap().to_string(),
        ))
    } else {
        Err(status)
    }
}

// =============================================================================
// Tests
// =============================================================================

#[tokio::test]
async fn test_create_invite() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();
    let expires = (chrono::Utc::now() + chrono::Duration::hours(1)).to_rfc3339();
    let resp = client
        .post(format!("{}/api/invites", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "max_uses": 5, "expires_at": expires }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 201, "POST /api/invites should return 201");
    let body: serde_json::Value = resp.json().await.unwrap();
    let code = body["code"].as_str().unwrap();
    assert_eq!(code.len(), 8, "Invite code should be 8 characters");
    assert!(
        code.chars().all(|c| c.is_ascii_alphanumeric()),
        "Invite code should be alphanumeric"
    );
}

#[tokio::test]
async fn test_invite_landing_page() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();

    // Create an invite
    let resp = client
        .post(format!("{}/api/invites", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    let body: serde_json::Value = resp.json().await.unwrap();
    let code = body["code"].as_str().unwrap();

    // Get landing page (public, no auth)
    let landing_resp = client
        .get(format!("{}/invite/{}", base_url, code))
        .send()
        .await
        .unwrap();

    assert_eq!(landing_resp.status(), 200, "Landing page should return 200");
    let html = landing_resp.text().await.unwrap();
    assert!(html.contains("UNITED"), "Landing page should mention UNITED");
    assert!(
        html.contains(&format!("united://invite/{}", code)),
        "Landing page should contain deep link"
    );
}

#[tokio::test]
async fn test_join_via_invite() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();

    // Create invite
    let resp = client
        .post(format!("{}/api/invites", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "max_uses": 10 }))
        .send()
        .await
        .unwrap();
    let inv_body: serde_json::Value = resp.json().await.unwrap();
    let code = inv_body["code"].as_str().unwrap();

    // Register with invite code
    let (user_token, user_id) = register_with_invite(&base_url, "InviteUser", Some(code))
        .await
        .expect("Registration with invite should succeed");

    // Verify user has @everyone role
    let roles_resp = client
        .get(format!("{}/api/roles/user/{}", base_url, user_id))
        .header("Authorization", format!("Bearer {}", user_token))
        .send()
        .await
        .unwrap();
    assert_eq!(roles_resp.status(), 200);
    let roles: serde_json::Value = roles_resp.json().await.unwrap();
    let role_list = roles["roles"].as_array().unwrap();
    assert!(
        role_list.iter().any(|r| r["name"].as_str().unwrap() == "everyone"),
        "User should have @everyone role"
    );

    // Verify use_count incremented
    let invites_resp = client
        .get(format!("{}/api/invites", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();
    let invites: serde_json::Value = invites_resp.json().await.unwrap();
    let inv = invites["invites"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["code"].as_str().unwrap() == code)
        .expect("Should find invite");
    assert_eq!(inv["use_count"].as_i64().unwrap(), 1, "use_count should be 1");
}

#[tokio::test]
async fn test_invite_max_uses_enforced() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();

    // Create invite with max_uses=1
    let resp = client
        .post(format!("{}/api/invites", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "max_uses": 1 }))
        .send()
        .await
        .unwrap();
    let inv_body: serde_json::Value = resp.json().await.unwrap();
    let code = inv_body["code"].as_str().unwrap();

    // First use — should succeed
    register_with_invite(&base_url, "User1", Some(code))
        .await
        .expect("First use should succeed");

    // Second use — should fail
    let result = register_with_invite(&base_url, "User2", Some(code)).await;
    assert!(result.is_err(), "Second use should fail");
}

#[tokio::test]
async fn test_invite_expiration_enforced() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();

    // Create invite that expires in 1 second
    let expires = (chrono::Utc::now() + chrono::Duration::seconds(1)).to_rfc3339();
    let resp = client
        .post(format!("{}/api/invites", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "expires_at": expires }))
        .send()
        .await
        .unwrap();
    let inv_body: serde_json::Value = resp.json().await.unwrap();
    let code = inv_body["code"].as_str().unwrap().to_string();

    // Wait for expiry
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // Try to use it — should fail
    let result = register_with_invite(&base_url, "LateUser", Some(&code)).await;
    assert!(result.is_err(), "Expired invite should be rejected");
}

#[tokio::test]
async fn test_invite_only_mode_rejects_without_code() {
    let (base_url, setup_token, _) = start_invite_only_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;

    // Try to register without invite code — should fail
    let result = register_with_invite(&base_url, "NoInvite", None).await;
    assert!(result.is_err(), "Registration without invite in invite-only mode should fail");

    let client = reqwest::Client::new();

    // Create invite
    let resp = client
        .post(format!("{}/api/invites", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    let inv_body: serde_json::Value = resp.json().await.unwrap();
    let code = inv_body["code"].as_str().unwrap();

    // Register with invite code — should succeed
    let result = register_with_invite(&base_url, "WithInvite", Some(code)).await;
    assert!(result.is_ok(), "Registration with invite in invite-only mode should succeed");
}

#[tokio::test]
async fn test_delete_invite() {
    let (base_url, setup_token, _) = start_test_server().await;
    let (owner_token, _) = register_owner(&base_url, &setup_token).await;

    let client = reqwest::Client::new();

    // Create invite
    let resp = client
        .post(format!("{}/api/invites", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    let inv_body: serde_json::Value = resp.json().await.unwrap();
    let code = inv_body["code"].as_str().unwrap().to_string();

    // Delete it
    let resp = client
        .delete(format!("{}/api/invites/{}", base_url, code))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200, "DELETE /api/invites/:code should return 200");

    // Verify landing page returns 404
    let landing = client
        .get(format!("{}/invite/{}", base_url, code))
        .send()
        .await
        .unwrap();
    assert_eq!(landing.status(), 404, "Deleted invite landing page should return 404");
}
