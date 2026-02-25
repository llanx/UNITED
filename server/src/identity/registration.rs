use axum::{extract::State, http::StatusCode, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::admin::setup;
use crate::auth::jwt;
use crate::db::models::ROLE_ADMIN;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterApiRequest {
    /// Hex-encoded Ed25519 public key (32 bytes)
    pub public_key: String,
    /// Public key fingerprint (base32-encoded SHA-256 truncated to 20 bytes)
    pub fingerprint: String,
    /// Server-local display name (unique per server)
    pub display_name: String,
    /// Client-encrypted identity blob (hex-encoded)
    pub encrypted_blob: String,
    /// Optional: setup token for admin bootstrap (first user becomes owner)
    #[serde(default)]
    pub setup_token: Option<String>,
    /// Hex-encoded Ed25519 signature of the genesis record
    pub genesis_signature: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterApiResponse {
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub is_owner: bool,
}

/// POST /api/auth/register
/// Create a new user with Ed25519 public key. If setup token provided and valid,
/// make user the server owner.
pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterApiRequest>,
) -> Result<Json<RegisterApiResponse>, (StatusCode, String)> {
    // Validate display name is not empty
    if req.display_name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Display name cannot be empty".to_string(),
        ));
    }

    // Validate public key is 32 bytes hex (64 chars)
    let public_key_bytes =
        hex::decode(&req.public_key).map_err(|_| (StatusCode::BAD_REQUEST, "Invalid public key hex".to_string()))?;
    if public_key_bytes.len() != 32 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Public key must be 32 bytes".to_string(),
        ));
    }

    // Validate the public key is a valid Ed25519 key
    ed25519_dalek::VerifyingKey::from_bytes(
        &public_key_bytes
            .clone()
            .try_into()
            .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid public key".to_string()))?,
    )
    .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Ed25519 public key".to_string()))?;

    // Check registration mode
    let db = state.db.clone();
    let reg_mode = state.registration_mode.clone();

    // Check if setup token is provided and valid
    let is_owner = if let Some(ref token) = req.setup_token {
        setup::verify_setup_token(&state.db, token)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    } else {
        false
    };

    // If invite-only and no valid setup token, reject
    if reg_mode == "invite-only" && !is_owner {
        return Err((
            StatusCode::FORBIDDEN,
            "Server is in invite-only mode".to_string(),
        ));
    }

    let fingerprint = req.fingerprint.clone();
    let display_name = req.display_name.clone();
    let encrypted_blob =
        hex::decode(&req.encrypted_blob).map_err(|_| (StatusCode::BAD_REQUEST, "Invalid blob hex".to_string()))?;
    let genesis_signature =
        hex::decode(&req.genesis_signature).map_err(|_| (StatusCode::BAD_REQUEST, "Invalid genesis signature hex".to_string()))?;
    let jwt_secret = state.jwt_secret.clone();

    // Insert user, genesis rotation record, and identity blob in a transaction
    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB lock: {}", e)))?;

        // Check fingerprint uniqueness
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM users WHERE fingerprint = ?1",
                [&fingerprint],
                |row| row.get(0),
            )
            .ok();
        if existing.is_some() {
            return Err((StatusCode::CONFLICT, "Fingerprint already registered".to_string()));
        }

        // Check display name uniqueness
        let name_taken: Option<String> = conn
            .query_row(
                "SELECT id FROM users WHERE display_name = ?1",
                [&display_name],
                |row| row.get(0),
            )
            .ok();
        if name_taken.is_some() {
            return Err((StatusCode::CONFLICT, "Display name already taken".to_string()));
        }

        let user_id = Uuid::now_v7().to_string();
        let now = Utc::now().to_rfc3339();
        let roles: i64 = if is_owner { ROLE_ADMIN } else { 0 };

        // Insert user
        conn.execute(
            "INSERT INTO users (id, public_key, fingerprint, display_name, roles, is_owner, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![user_id, public_key_bytes, fingerprint, display_name, roles, is_owner, now, now],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Insert user: {}", e)))?;

        // Insert genesis rotation record
        let rotation_id = Uuid::now_v7().to_string();
        conn.execute(
            "INSERT INTO rotation_records (id, fingerprint, record_type, new_key, signature_new, created_at) VALUES (?1, ?2, 'genesis', ?3, ?4, ?5)",
            rusqlite::params![rotation_id, fingerprint, public_key_bytes, genesis_signature, now],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Insert genesis: {}", e)))?;

        // Store encrypted identity blob
        conn.execute(
            "INSERT INTO identity_blobs (fingerprint, encrypted_blob, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![fingerprint, encrypted_blob, now, now],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Insert blob: {}", e)))?;

        // Ensure @everyone role exists and auto-assign to new user
        let everyone_id: Option<String> = conn
            .query_row(
                "SELECT id FROM roles WHERE is_default = 1",
                [],
                |row| row.get(0),
            )
            .ok();

        let everyone_role_id = if let Some(id) = everyone_id {
            id
        } else {
            // Create @everyone role with SEND_MESSAGES permission (0x01)
            let eid = Uuid::now_v7().to_string();
            conn.execute(
                "INSERT INTO roles (id, name, permissions, color, position, is_default, created_at, updated_at) VALUES (?1, 'everyone', 1, '', 0, 1, ?2, ?3)",
                rusqlite::params![eid, now, now],
            )
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Insert @everyone: {}", e)))?;
            eid
        };

        // Assign @everyone role to the new user
        conn.execute(
            "INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![user_id, everyone_role_id, now],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Assign @everyone: {}", e)))?;

        // Seed starter template on first boot (owner registration)
        if is_owner {
            crate::channels::seed::seed_starter_template(&conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Seed template: {}", e)))?;
        }

        // Issue JWT tokens
        let is_admin = is_owner; // Owner is also admin
        let access_token = jwt::issue_access_token(&jwt_secret, &user_id, &fingerprint, is_owner, is_admin)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("JWT: {}", e)))?;
        let (refresh_token, refresh_hash) = jwt::issue_refresh_token();

        // Store refresh token
        let refresh_id = Uuid::now_v7().to_string();
        let expires_at = (Utc::now() + chrono::Duration::days(7)).to_rfc3339();
        conn.execute(
            "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![refresh_id, user_id, refresh_hash, expires_at, now],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Insert refresh: {}", e)))?;

        Ok((user_id, access_token, refresh_token, is_owner))
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    let (user_id, access_token, refresh_token, is_owner) = result;

    // If setup token was consumed, mark it
    if is_owner {
        setup::consume_setup_token(&state.db)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Consume token: {}", e)))?;
        tracing::info!("Server owner established: {} ({})", req.display_name, req.fingerprint);
    }

    tracing::info!("User registered: {} ({})", req.display_name, req.fingerprint);

    Ok(Json(RegisterApiResponse {
        user_id,
        access_token,
        refresh_token,
        is_owner,
    }))
}
