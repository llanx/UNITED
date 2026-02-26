//! Integration tests for role CRUD, assignment, permission resolution,
//! and @everyone auto-assignment on user registration.

use ed25519_dalek::{Signer, SigningKey};
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

/// Helper: start the server on a random port and return "base_url|setup_token".
async fn start_test_server() -> (String, SocketAddr) {
    let tmp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let data_dir = tmp_dir.path().to_str().unwrap().to_string();

    let db = united_server::db::init_db(&data_dir).expect("Failed to init DB");
    let jwt_secret = united_server::auth::jwt::load_or_generate_jwt_secret(&data_dir)
        .expect("Failed to generate JWT secret");
    let encryption_key = united_server::auth::jwt::load_or_generate_encryption_key(&data_dir)
        .expect("Failed to generate encryption key");
    let setup_token = united_server::admin::setup::maybe_generate_setup_token(&db)
        .expect("Failed to generate setup token")
        .expect("Expected setup token on fresh DB");

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

    (format!("http://{}|{}", addr, setup_token), addr)
}

fn parse_server_info(combined: &str) -> (&str, &str) {
    let parts: Vec<&str> = combined.splitn(2, '|').collect();
    (parts[0], parts[1])
}

/// Generate a test Ed25519 keypair and return (signing_key, public_key_hex, fingerprint).
fn generate_test_identity() -> (SigningKey, String, String) {
    let signing_key = random_signing_key();
    let verifying_key = signing_key.verifying_key();
    let public_key_hex = hex::encode(verifying_key.as_bytes());

    let mut hasher = Sha256::new();
    hasher.update(verifying_key.as_bytes());
    let hash = hasher.finalize();
    let fingerprint = base32::encode(base32::Alphabet::Rfc4648 { padding: false }, &hash[..20]);

    (signing_key, public_key_hex, fingerprint)
}

/// Register a user and return (user_id, access_token).
async fn register_user(
    client: &reqwest::Client,
    base_url: &str,
    name: &str,
    setup_token: Option<&str>,
) -> (String, String) {
    let (signing_key, public_key_hex, fingerprint) = generate_test_identity();
    let genesis_sig = signing_key.sign(b"genesis");

    let mut body = json!({
        "public_key": public_key_hex,
        "fingerprint": fingerprint,
        "display_name": name,
        "encrypted_blob": hex::encode(b"test-blob"),
        "genesis_signature": hex::encode(genesis_sig.to_bytes()),
    });

    if let Some(token) = setup_token {
        body["setup_token"] = json!(token);
    }

    let resp = client
        .post(format!("{}/api/auth/register", base_url))
        .json(&body)
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200, "Registration failed for {}", name);
    let resp_body: serde_json::Value = resp.json().await.unwrap();
    (
        resp_body["user_id"].as_str().unwrap().to_string(),
        resp_body["access_token"].as_str().unwrap().to_string(),
    )
}

// ---- Tests ----

/// Test 1: After owner registration, the @everyone role should exist with
/// is_default=true and SEND_MESSAGES permission (0x01).
#[tokio::test]
async fn test_everyone_role_created_on_seed() {
    let (combined, _) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);
    let client = reqwest::Client::new();

    let (_owner_id, owner_token) = register_user(&client, base_url, "Owner", Some(setup_token)).await;

    let resp = client
        .get(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    let roles = body["roles"].as_array().expect("Expected roles array");
    let everyone = roles
        .iter()
        .find(|r| r["is_default"].as_bool() == Some(true))
        .expect("Expected @everyone role");
    assert_eq!(everyone["name"].as_str().unwrap(), "everyone");
    // SEND_MESSAGES = 0x01 = 1
    assert_eq!(everyone["permissions"].as_u64().unwrap(), 1);
}

/// Test 2: Create a role with name, permissions, and color.
#[tokio::test]
async fn test_create_role() {
    let (combined, _) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);
    let client = reqwest::Client::new();

    let (_owner_id, owner_token) = register_user(&client, base_url, "Owner", Some(setup_token)).await;

    // KICK_MEMBERS (0x04) | BAN_MEMBERS (0x08) = 0x0C = 12
    let resp = client
        .post(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({
            "name": "Moderator",
            "permissions": 12,
            "color": "#ff0000"
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 201, "Create role should return 201");
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["name"].as_str().unwrap(), "Moderator");
    assert_eq!(body["permissions"].as_u64().unwrap(), 12);
    assert_eq!(body["color"].as_str().unwrap(), "#ff0000");
    assert!(body["id"].as_str().is_some());
}

/// Test 3: Update a role's permissions.
#[tokio::test]
async fn test_update_role_permissions() {
    let (combined, _) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);
    let client = reqwest::Client::new();

    let (_owner_id, owner_token) = register_user(&client, base_url, "Owner", Some(setup_token)).await;

    // Create role first
    let create_resp = client
        .post(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({
            "name": "TestRole",
            "permissions": 1,
            "color": "#000000"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(create_resp.status(), 201);
    let created: serde_json::Value = create_resp.json().await.unwrap();
    let role_id = created["id"].as_str().unwrap();

    // Update to all permissions (0x1F = 31)
    let update_resp = client
        .put(format!("{}/api/roles/{}", base_url, role_id))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "permissions": 31 }))
        .send()
        .await
        .unwrap();

    assert_eq!(update_resp.status(), 200);
    let updated: serde_json::Value = update_resp.json().await.unwrap();
    assert_eq!(updated["permissions"].as_u64().unwrap(), 31);
}

/// Test 4: Delete a role, verify it's gone from the list.
#[tokio::test]
async fn test_delete_role() {
    let (combined, _) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);
    let client = reqwest::Client::new();

    let (_owner_id, owner_token) = register_user(&client, base_url, "Owner", Some(setup_token)).await;

    // Create a role
    let create_resp = client
        .post(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({
            "name": "ToDelete",
            "permissions": 1,
            "color": ""
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(create_resp.status(), 201);
    let created: serde_json::Value = create_resp.json().await.unwrap();
    let role_id = created["id"].as_str().unwrap();

    // Delete it
    let delete_resp = client
        .delete(format!("{}/api/roles/{}", base_url, role_id))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();
    assert_eq!(delete_resp.status(), 200);

    // Verify it's gone
    let list_resp = client
        .get(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();
    assert_eq!(list_resp.status(), 200);
    let list_body: serde_json::Value = list_resp.json().await.unwrap();
    let roles = list_body["roles"].as_array().unwrap();
    assert!(
        !roles.iter().any(|r| r["id"].as_str() == Some(role_id)),
        "Deleted role should not appear in role list"
    );
}

/// Test 5: Cannot delete the @everyone default role.
#[tokio::test]
async fn test_cannot_delete_everyone_role() {
    let (combined, _) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);
    let client = reqwest::Client::new();

    let (_owner_id, owner_token) = register_user(&client, base_url, "Owner", Some(setup_token)).await;

    // Get the @everyone role ID
    let list_resp = client
        .get(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();
    let list_body: serde_json::Value = list_resp.json().await.unwrap();
    let roles = list_body["roles"].as_array().unwrap();
    let everyone_id = roles
        .iter()
        .find(|r| r["is_default"].as_bool() == Some(true))
        .unwrap()["id"]
        .as_str()
        .unwrap();

    // Attempt to delete it
    let delete_resp = client
        .delete(format!("{}/api/roles/{}", base_url, everyone_id))
        .header("Authorization", format!("Bearer {}", owner_token))
        .send()
        .await
        .unwrap();

    assert_eq!(delete_resp.status(), 400, "Deleting @everyone should return 400");
}

/// Test 6: Assign a role to a user.
#[tokio::test]
async fn test_assign_role_to_user() {
    let (combined, _) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);
    let client = reqwest::Client::new();

    let (_owner_id, owner_token) = register_user(&client, base_url, "Owner", Some(setup_token)).await;
    let (user_id, _user_token) = register_user(&client, base_url, "RegularUser", None).await;

    // Create a role
    let create_resp = client
        .post(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({
            "name": "VIP",
            "permissions": 1,
            "color": "#gold"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(create_resp.status(), 201);
    let created: serde_json::Value = create_resp.json().await.unwrap();
    let role_id = created["id"].as_str().unwrap();

    // Assign to user
    let assign_resp = client
        .post(format!("{}/api/roles/assign", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({
            "user_id": user_id,
            "role_id": role_id
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(assign_resp.status(), 200, "Assign role should return 200");
}

/// Test 7: Remove a role from a user.
#[tokio::test]
async fn test_remove_role_from_user() {
    let (combined, _) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);
    let client = reqwest::Client::new();

    let (_owner_id, owner_token) = register_user(&client, base_url, "Owner", Some(setup_token)).await;
    let (user_id, _user_token) = register_user(&client, base_url, "RegularUser", None).await;

    // Create and assign a role
    let create_resp = client
        .post(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({
            "name": "Temp",
            "permissions": 1,
            "color": ""
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(create_resp.status(), 201);
    let created: serde_json::Value = create_resp.json().await.unwrap();
    let role_id = created["id"].as_str().unwrap();

    let assign_resp = client
        .post(format!("{}/api/roles/assign", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "user_id": user_id, "role_id": role_id }))
        .send()
        .await
        .unwrap();
    assert_eq!(assign_resp.status(), 200);

    // Remove the role
    let remove_resp = client
        .post(format!("{}/api/roles/remove", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "user_id": user_id, "role_id": role_id }))
        .send()
        .await
        .unwrap();

    assert_eq!(remove_resp.status(), 200, "Remove role should return 200");
}

/// Test 8: Permission union resolution (bitwise OR of all assigned roles).
#[tokio::test]
async fn test_permission_union_resolution() {
    let (combined, _) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);
    let client = reqwest::Client::new();

    let (_owner_id, owner_token) = register_user(&client, base_url, "Owner", Some(setup_token)).await;
    let (user_id, user_token) = register_user(&client, base_url, "RegularUser", None).await;

    // Create role_a with SEND_MESSAGES (0x01)
    let resp_a = client
        .post(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "name": "RoleA", "permissions": 1, "color": "" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp_a.status(), 201);
    let role_a: serde_json::Value = resp_a.json().await.unwrap();
    let role_a_id = role_a["id"].as_str().unwrap();

    // Create role_b with KICK_MEMBERS (0x04)
    let resp_b = client
        .post(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "name": "RoleB", "permissions": 4, "color": "" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp_b.status(), 201);
    let role_b: serde_json::Value = resp_b.json().await.unwrap();
    let role_b_id = role_b["id"].as_str().unwrap();

    // Assign both roles to user
    let assign_a = client
        .post(format!("{}/api/roles/assign", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "user_id": user_id, "role_id": role_a_id }))
        .send()
        .await
        .unwrap();
    assert_eq!(assign_a.status(), 200);

    let assign_b = client
        .post(format!("{}/api/roles/assign", base_url))
        .header("Authorization", format!("Bearer {}", owner_token))
        .json(&json!({ "user_id": user_id, "role_id": role_b_id }))
        .send()
        .await
        .unwrap();
    assert_eq!(assign_b.status(), 200);

    // Verify user has both permissions by querying their roles
    let user_roles_resp = client
        .get(format!("{}/api/roles/user/{}", base_url, user_id))
        .header("Authorization", format!("Bearer {}", user_token))
        .send()
        .await
        .unwrap();

    assert_eq!(user_roles_resp.status(), 200);
    let user_roles_body: serde_json::Value = user_roles_resp.json().await.unwrap();
    let user_roles = user_roles_body["roles"].as_array().expect("Expected roles array");

    // User should have @everyone + RoleA + RoleB = at least 3 roles
    assert!(user_roles.len() >= 3, "User should have at least 3 roles (everyone + A + B)");

    // Compute union of all permissions
    let combined_perms: u64 = user_roles
        .iter()
        .map(|r| r["permissions"].as_u64().unwrap_or(0))
        .fold(0, |acc, p| acc | p);

    // Should have SEND_MESSAGES (1) from @everyone/RoleA and KICK_MEMBERS (4) from RoleB
    assert!(combined_perms & 1 != 0, "Should have SEND_MESSAGES");
    assert!(combined_perms & 4 != 0, "Should have KICK_MEMBERS");
}

/// Test 9: Role CRUD requires ADMIN permission (non-owner gets 403).
#[tokio::test]
async fn test_role_crud_requires_admin_permission() {
    let (combined, _) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);
    let client = reqwest::Client::new();

    // Register owner first (consumes setup token)
    let (_owner_id, _owner_token) = register_user(&client, base_url, "Owner", Some(setup_token)).await;
    // Register a regular user (no setup token = not owner, no admin)
    let (_user_id, user_token) = register_user(&client, base_url, "NormalUser", None).await;

    // Non-admin tries to create a role
    let resp = client
        .post(format!("{}/api/roles", base_url))
        .header("Authorization", format!("Bearer {}", user_token))
        .json(&json!({
            "name": "Hacker",
            "permissions": 31,
            "color": ""
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 403, "Non-admin should get 403 FORBIDDEN");
}

/// Test 10: New user automatically gets the @everyone role on registration.
#[tokio::test]
async fn test_new_user_gets_everyone_role() {
    let (combined, _) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);
    let client = reqwest::Client::new();

    let (_owner_id, _owner_token) = register_user(&client, base_url, "Owner", Some(setup_token)).await;
    let (user_id, user_token) = register_user(&client, base_url, "NewUser", None).await;

    // Query the user's roles
    let resp = client
        .get(format!("{}/api/roles/user/{}", base_url, user_id))
        .header("Authorization", format!("Bearer {}", user_token))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    let roles = body["roles"].as_array().expect("Expected roles array");

    // Should have at least the @everyone role
    let has_everyone = roles
        .iter()
        .any(|r| r["is_default"].as_bool() == Some(true));
    assert!(has_everyone, "New user should have the @everyone role");
}
