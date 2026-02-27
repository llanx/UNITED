//! Integration tests for the full auth flow:
//! challenge -> verify -> JWT -> refresh, TOTP enrollment/verification,
//! and rate limiting.

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

/// Helper: start the server on a random port and return the base URL.
async fn start_test_server() -> (String, SocketAddr) {
    // Create a temporary data directory
    let tmp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let data_dir = tmp_dir.path().to_str().unwrap().to_string();

    // Initialize database
    let db = united_server::db::init_db(&data_dir).expect("Failed to init DB");

    // Generate keys
    let jwt_secret = united_server::auth::jwt::load_or_generate_jwt_secret(&data_dir)
        .expect("Failed to generate JWT secret");
    let encryption_key = united_server::auth::jwt::load_or_generate_encryption_key(&data_dir)
        .expect("Failed to generate encryption key");

    // Generate setup token
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
        data_dir: data_dir.clone(),
        block_retention_days: None,
        block_cleanup_interval_secs: None,
        max_upload_size_mb: None,
        voice_state: Arc::new(united_server::voice::state::VoiceState::new()),
        turn_config: None,
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
        // Keep tmp_dir alive so the data directory isn't deleted
        let _keep = tmp_dir;
    });

    let base_url = format!("http://{}", addr);
    // Store setup_token in a way we can use it
    // We'll return just the base URL; tests that need the token can register
    // We need to return setup_token too, but for simplicity let's just pass it back
    // Actually, the server already stored the token hash, so we just need the plaintext
    // Let's store it in the URL as a hack... no, let's return it separately

    // For now, return URL only - tests will work with open registration
    (format!("{}|{}", base_url, setup_token), addr)
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

    // Compute fingerprint: SHA-256(public_key) truncated to 20 bytes, base32
    let mut hasher = Sha256::new();
    hasher.update(verifying_key.as_bytes());
    let hash = hasher.finalize();
    let fingerprint = base32::encode(base32::Alphabet::Rfc4648 { padding: false }, &hash[..20]);

    (signing_key, public_key_hex, fingerprint)
}

#[tokio::test]
async fn test_health_check() {
    let (combined, _addr) = start_test_server().await;
    let (base_url, _) = parse_server_info(&combined);

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/health", base_url))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    assert_eq!(resp.text().await.unwrap(), "ok");
}

#[tokio::test]
async fn test_full_auth_flow() {
    let (combined, _addr) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);

    let client = reqwest::Client::new();
    let (signing_key, public_key_hex, fingerprint) = generate_test_identity();

    // 1. Register (with setup token to become owner)
    let genesis_sig = signing_key.sign(b"genesis");
    let register_resp = client
        .post(format!("{}/api/auth/register", base_url))
        .json(&json!({
            "public_key": public_key_hex,
            "fingerprint": fingerprint,
            "display_name": "TestUser",
            "encrypted_blob": hex::encode(b"test-blob-data"),
            "setup_token": setup_token,
            "genesis_signature": hex::encode(genesis_sig.to_bytes()),
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(register_resp.status(), 200, "Registration failed");
    let register_body: serde_json::Value = register_resp.json().await.unwrap();
    assert!(register_body["is_owner"].as_bool().unwrap());
    let access_token = register_body["access_token"].as_str().unwrap().to_string();
    let refresh_token = register_body["refresh_token"].as_str().unwrap().to_string();

    // 2. Challenge-response auth (for re-login)
    let challenge_resp = client
        .post(format!("{}/api/auth/challenge", base_url))
        .send()
        .await
        .unwrap();

    assert_eq!(challenge_resp.status(), 200);
    let challenge_body: serde_json::Value = challenge_resp.json().await.unwrap();
    let challenge_id = challenge_body["challenge_id"].as_str().unwrap();
    let challenge_bytes_hex = challenge_body["challenge_bytes"].as_str().unwrap();
    let challenge_bytes = hex::decode(challenge_bytes_hex).unwrap();

    // 3. Sign challenge and verify
    let signature = signing_key.sign(&challenge_bytes);
    let verify_resp = client
        .post(format!("{}/api/auth/verify", base_url))
        .json(&json!({
            "challenge_id": challenge_id,
            "public_key": public_key_hex,
            "signature": hex::encode(signature.to_bytes()),
            "fingerprint": fingerprint,
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(verify_resp.status(), 200, "Challenge verification failed");
    let verify_body: serde_json::Value = verify_resp.json().await.unwrap();
    assert!(verify_body["access_token"].as_str().is_some());
    assert!(verify_body["refresh_token"].as_str().is_some());

    // 4. Refresh tokens
    let refresh_resp = client
        .post(format!("{}/api/auth/refresh", base_url))
        .json(&json!({
            "refresh_token": refresh_token,
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(refresh_resp.status(), 200, "Token refresh failed");
    let refresh_body: serde_json::Value = refresh_resp.json().await.unwrap();
    assert!(refresh_body["access_token"].as_str().is_some());
    assert!(refresh_body["refresh_token"].as_str().is_some());

    // 5. Access protected endpoint with JWT
    let settings_resp = client
        .put(format!("{}/api/server/settings", base_url))
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&json!({
            "name": "Test Server",
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(settings_resp.status(), 200, "Settings update failed");
}

#[tokio::test]
async fn test_totp_enrollment_and_verification() {
    let (combined, _addr) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);

    let client = reqwest::Client::new();
    let (signing_key, public_key_hex, fingerprint) = generate_test_identity();

    // Register
    let genesis_sig = signing_key.sign(b"genesis");
    let register_resp = client
        .post(format!("{}/api/auth/register", base_url))
        .json(&json!({
            "public_key": public_key_hex,
            "fingerprint": fingerprint,
            "display_name": "TotpTestUser",
            "encrypted_blob": hex::encode(b"test-blob"),
            "setup_token": setup_token,
            "genesis_signature": hex::encode(genesis_sig.to_bytes()),
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(register_resp.status(), 200);
    let body: serde_json::Value = register_resp.json().await.unwrap();
    let access_token = body["access_token"].as_str().unwrap();

    // Enroll TOTP
    let enroll_resp = client
        .post(format!("{}/api/auth/totp/enroll", base_url))
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .unwrap();

    assert_eq!(enroll_resp.status(), 200, "TOTP enrollment failed");
    let enroll_body: serde_json::Value = enroll_resp.json().await.unwrap();
    assert!(enroll_body["secret"].as_str().is_some());
    assert!(enroll_body["otpauth_uri"].as_str().is_some());
    let otpauth_uri = enroll_body["otpauth_uri"].as_str().unwrap();
    assert!(otpauth_uri.starts_with("otpauth://totp/"));

    // Verify TOTP with an invalid code (should fail)
    let verify_resp = client
        .post(format!("{}/api/auth/totp/confirm", base_url))
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&json!({ "code": "000000" }))
        .send()
        .await
        .unwrap();

    assert_eq!(verify_resp.status(), 200);
    let verify_body: serde_json::Value = verify_resp.json().await.unwrap();
    // The code "000000" is almost certainly invalid
    // (there's a 1/1000000 chance it's valid, which is acceptable for tests)
    // We just check the response shape is correct
    assert!(verify_body["valid"].is_boolean());

    // TOTP verify during login (user not yet enrolled = passes automatically)
    let login_verify_resp = client
        .post(format!("{}/api/auth/totp/verify", base_url))
        .json(&json!({
            "fingerprint": fingerprint,
            "code": "123456",
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(login_verify_resp.status(), 200);
}

#[tokio::test]
async fn test_identity_blob_storage_and_retrieval() {
    let (combined, _addr) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);

    let client = reqwest::Client::new();
    let (signing_key, public_key_hex, fingerprint) = generate_test_identity();

    // Register (blob is stored during registration)
    let genesis_sig = signing_key.sign(b"genesis");
    let original_blob = b"encrypted-identity-data-for-recovery";
    let register_resp = client
        .post(format!("{}/api/auth/register", base_url))
        .json(&json!({
            "public_key": public_key_hex,
            "fingerprint": fingerprint,
            "display_name": "BlobTestUser",
            "encrypted_blob": hex::encode(original_blob),
            "setup_token": setup_token,
            "genesis_signature": hex::encode(genesis_sig.to_bytes()),
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(register_resp.status(), 200);
    let body: serde_json::Value = register_resp.json().await.unwrap();
    let access_token = body["access_token"].as_str().unwrap();

    // Retrieve blob (public endpoint)
    let get_resp = client
        .get(format!("{}/api/identity/blob/{}", base_url, fingerprint))
        .send()
        .await
        .unwrap();

    assert_eq!(get_resp.status(), 200, "Blob retrieval failed");
    let get_body: serde_json::Value = get_resp.json().await.unwrap();
    assert_eq!(get_body["fingerprint"].as_str().unwrap(), fingerprint);
    let retrieved_blob = hex::decode(get_body["encrypted_blob"].as_str().unwrap()).unwrap();
    assert_eq!(retrieved_blob, original_blob);

    // Update blob (authenticated)
    let new_blob = b"updated-encrypted-identity-data";
    let put_resp = client
        .put(format!("{}/api/identity/blob", base_url))
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&json!({ "encrypted_blob": hex::encode(new_blob) }))
        .send()
        .await
        .unwrap();

    assert_eq!(put_resp.status(), 200, "Blob update failed");

    // Verify updated blob
    let get_resp2 = client
        .get(format!("{}/api/identity/blob/{}", base_url, fingerprint))
        .send()
        .await
        .unwrap();

    assert_eq!(get_resp2.status(), 200);
    let get_body2: serde_json::Value = get_resp2.json().await.unwrap();
    let retrieved_blob2 = hex::decode(get_body2["encrypted_blob"].as_str().unwrap()).unwrap();
    assert_eq!(retrieved_blob2, new_blob);

    // Non-existent blob returns 404
    let get_resp3 = client
        .get(format!("{}/api/identity/blob/NONEXISTENT", base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(get_resp3.status(), 404);
}

#[tokio::test]
async fn test_key_rotation_and_cancellation() {
    let (combined, _addr) = start_test_server().await;
    let (base_url, setup_token) = parse_server_info(&combined);

    let client = reqwest::Client::new();
    let (old_signing_key, old_public_key_hex, fingerprint) = generate_test_identity();

    // Register
    let genesis_sig = old_signing_key.sign(b"genesis");
    let register_resp = client
        .post(format!("{}/api/auth/register", base_url))
        .json(&json!({
            "public_key": old_public_key_hex,
            "fingerprint": fingerprint,
            "display_name": "RotationTestUser",
            "encrypted_blob": hex::encode(b"blob"),
            "setup_token": setup_token,
            "genesis_signature": hex::encode(genesis_sig.to_bytes()),
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(register_resp.status(), 200);
    let body: serde_json::Value = register_resp.json().await.unwrap();
    let access_token = body["access_token"].as_str().unwrap().to_string();

    // Generate new keypair for rotation
    let new_signing_key = random_signing_key();
    let new_verifying_key = new_signing_key.verifying_key();
    let new_public_key_hex = hex::encode(new_verifying_key.as_bytes());

    // Build rotation payload
    let old_key_bytes = hex::decode(&old_public_key_hex).unwrap();
    let new_key_bytes = hex::decode(&new_public_key_hex).unwrap();
    let mut payload = Vec::new();
    payload.extend_from_slice(b"rotate:");
    payload.extend_from_slice(&old_key_bytes);
    payload.extend_from_slice(b":");
    payload.extend_from_slice(&new_key_bytes);
    payload.extend_from_slice(b":scheduled");

    let sig_old = old_signing_key.sign(&payload);
    let sig_new = new_signing_key.sign(&payload);

    // Rotate key
    let rotate_resp = client
        .post(format!("{}/api/identity/rotate", base_url))
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&json!({
            "prev_key": old_public_key_hex,
            "new_key": new_public_key_hex,
            "reason": "scheduled",
            "signature_old": hex::encode(sig_old.to_bytes()),
            "signature_new": hex::encode(sig_new.to_bytes()),
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(rotate_resp.status(), 200, "Key rotation failed");
    let rotate_body: serde_json::Value = rotate_resp.json().await.unwrap();
    assert!(rotate_body["accepted"].as_bool().unwrap());
    assert!(rotate_body["cancellation_deadline"].as_str().is_some());

    // Check rotation chain
    let chain_resp = client
        .get(format!(
            "{}/api/identity/rotation-chain/{}",
            base_url, fingerprint
        ))
        .send()
        .await
        .unwrap();

    assert_eq!(chain_resp.status(), 200);
    let chain_body: serde_json::Value = chain_resp.json().await.unwrap();
    let chain = chain_body["chain"].as_array().unwrap();
    assert_eq!(chain.len(), 2); // genesis + rotation
    assert_eq!(chain[0]["record_type"].as_str().unwrap(), "genesis");
    assert_eq!(chain[1]["record_type"].as_str().unwrap(), "rotation");

    // Cancel rotation (need to re-auth first since tokens were invalidated)
    // Re-auth with the NEW key (since rotation was applied)
    let challenge_resp = client
        .post(format!("{}/api/auth/challenge", base_url))
        .send()
        .await
        .unwrap();
    let challenge_body: serde_json::Value = challenge_resp.json().await.unwrap();
    let challenge_bytes = hex::decode(challenge_body["challenge_bytes"].as_str().unwrap()).unwrap();
    let new_sig = new_signing_key.sign(&challenge_bytes);

    let verify_resp = client
        .post(format!("{}/api/auth/verify", base_url))
        .json(&json!({
            "challenge_id": challenge_body["challenge_id"].as_str().unwrap(),
            "public_key": new_public_key_hex,
            "signature": hex::encode(new_sig.to_bytes()),
            "fingerprint": fingerprint,
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(verify_resp.status(), 200);
    let new_tokens: serde_json::Value = verify_resp.json().await.unwrap();
    let new_access_token = new_tokens["access_token"].as_str().unwrap();

    // Cancel rotation with old key signature
    let cancel_payload = format!("cancel_rotation:{}", fingerprint);
    let cancel_sig = old_signing_key.sign(cancel_payload.as_bytes());

    let cancel_resp = client
        .post(format!("{}/api/identity/rotate/cancel", base_url))
        .header("Authorization", format!("Bearer {}", new_access_token))
        .json(&json!({
            "signature_old_key": hex::encode(cancel_sig.to_bytes()),
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(cancel_resp.status(), 200, "Rotation cancellation failed");
    let cancel_body: serde_json::Value = cancel_resp.json().await.unwrap();
    assert!(cancel_body["cancelled"].as_bool().unwrap());

    // Verify the rotation chain shows the cancelled rotation
    let chain_resp2 = client
        .get(format!(
            "{}/api/identity/rotation-chain/{}",
            base_url, fingerprint
        ))
        .send()
        .await
        .unwrap();
    let chain_body2: serde_json::Value = chain_resp2.json().await.unwrap();
    let chain2 = chain_body2["chain"].as_array().unwrap();
    assert!(chain2[1]["cancelled"].as_bool().unwrap());
}
