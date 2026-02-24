use axum::{extract::State, http::StatusCode, Json};
use chrono::{Duration, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rand::Rng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::jwt;
use crate::db::models::ROLE_ADMIN;
use crate::state::{AppState, ChallengeEntry};

// --- Request/Response types for JSON API ---

#[derive(Debug, Serialize, Deserialize)]
pub struct ChallengeApiResponse {
    pub challenge_id: String,
    /// Hex-encoded 32-byte challenge
    pub challenge_bytes: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyApiRequest {
    /// Challenge ID from ChallengeApiResponse
    pub challenge_id: String,
    /// Hex-encoded Ed25519 public key (32 bytes)
    pub public_key: String,
    /// Hex-encoded Ed25519 signature (64 bytes)
    pub signature: String,
    /// Public key fingerprint for user lookup
    pub fingerprint: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthTokensResponse {
    pub access_token: String,
    pub refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshApiRequest {
    pub refresh_token: String,
}

// --- Handlers ---

/// POST /api/auth/challenge
/// Generate a 32-byte random challenge with UUIDv7 ID and 60-second expiry.
/// No auth required.
pub async fn issue_challenge(
    State(state): State<AppState>,
) -> Result<Json<ChallengeApiResponse>, StatusCode> {
    let challenge_bytes: [u8; 32] = rand::rng().random();
    let challenge_id = Uuid::now_v7().to_string();

    state.challenges.insert(
        challenge_id.clone(),
        ChallengeEntry {
            bytes: challenge_bytes.to_vec(),
            expires_at: Utc::now() + Duration::seconds(60),
        },
    );

    Ok(Json(ChallengeApiResponse {
        challenge_id,
        challenge_bytes: hex::encode(challenge_bytes),
    }))
}

/// POST /api/auth/verify
/// Consume challenge, verify Ed25519 signature, look up user by fingerprint, issue JWT.
pub async fn verify_challenge(
    State(state): State<AppState>,
    Json(req): Json<VerifyApiRequest>,
) -> Result<Json<AuthTokensResponse>, StatusCode> {
    // Retrieve and consume the challenge (one-time use)
    let (_, challenge) = state
        .challenges
        .remove(&req.challenge_id)
        .ok_or(StatusCode::BAD_REQUEST)?;

    // Check expiry
    if challenge.expires_at < Utc::now() {
        return Err(StatusCode::GONE);
    }

    // Decode public key from hex
    let pk_bytes: Vec<u8> =
        hex::decode(&req.public_key).map_err(|_| StatusCode::BAD_REQUEST)?;
    let pk_array: [u8; 32] = pk_bytes
        .try_into()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let verifying_key =
        VerifyingKey::from_bytes(&pk_array).map_err(|_| StatusCode::BAD_REQUEST)?;

    // Decode signature from hex
    let sig_bytes: Vec<u8> =
        hex::decode(&req.signature).map_err(|_| StatusCode::BAD_REQUEST)?;
    let sig_array: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let signature = Signature::from_bytes(&sig_array);

    // Verify the signature over the challenge bytes
    verifying_key
        .verify(&challenge.bytes, &signature)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Look up user by fingerprint in DB
    let db = state.db.clone();
    let fingerprint = req.fingerprint.clone();
    let jwt_secret = state.jwt_secret.clone();

    let tokens = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let user: Result<(String, bool, i64), _> = conn.query_row(
            "SELECT id, is_owner, roles FROM users WHERE fingerprint = ?1",
            [&fingerprint],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, bool>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        );

        match user {
            Ok((user_id, is_owner, roles)) => {
                let is_admin = (roles & ROLE_ADMIN) != 0;

                // Issue access token
                let access_token = jwt::issue_access_token(
                    &jwt_secret,
                    &user_id,
                    &fingerprint,
                    is_owner,
                    is_admin,
                )
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

                // Issue refresh token
                let (refresh_token, refresh_hash) = jwt::issue_refresh_token();
                drop(conn); // Release lock before store_refresh_token reacquires it

                // We need the db again — get from a cloned reference
                // Actually, we already dropped conn. We need a different approach.
                // Let's return the data and do the DB write outside.
                Ok::<(String, String, String, String), StatusCode>((
                    access_token,
                    refresh_token,
                    refresh_hash,
                    user_id,
                ))
            }
            Err(_) => Err(StatusCode::UNAUTHORIZED),
        }
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let (access_token, refresh_token, refresh_hash, user_id) = tokens;

    // Store refresh token hash in DB
    let db2 = state.db.clone();
    tokio::task::spawn_blocking(move || {
        jwt::store_refresh_token(&db2, &user_id, &refresh_hash)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(AuthTokensResponse {
        access_token,
        refresh_token,
    }))
}

/// POST /api/auth/refresh
/// Validate refresh token, issue new access + refresh pair, delete old (rotation).
pub async fn refresh_tokens(
    State(state): State<AppState>,
    Json(req): Json<RefreshApiRequest>,
) -> Result<Json<AuthTokensResponse>, StatusCode> {
    let db = state.db.clone();
    let refresh_token = req.refresh_token.clone();

    // Validate and consume the refresh token
    let user_id = tokio::task::spawn_blocking(move || {
        jwt::validate_and_consume_refresh_token(&db, &refresh_token)
            .map_err(|_| StatusCode::UNAUTHORIZED)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    // Look up user info for new access token
    let db2 = state.db.clone();
    let uid = user_id.clone();
    let jwt_secret = state.jwt_secret.clone();

    let (access_token, new_refresh, new_hash) = tokio::task::spawn_blocking(move || {
        let conn = db2.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let user: (String, bool, i64) = conn
            .query_row(
                "SELECT fingerprint, is_owner, roles FROM users WHERE id = ?1",
                [&uid],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, bool>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )
            .map_err(|_| StatusCode::UNAUTHORIZED)?;

        let (fingerprint, is_owner, roles) = user;
        let is_admin = (roles & ROLE_ADMIN) != 0;

        let access_token =
            jwt::issue_access_token(&jwt_secret, &uid, &fingerprint, is_owner, is_admin)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let (new_refresh, new_hash) = jwt::issue_refresh_token();

        Ok::<(String, String, String), StatusCode>((access_token, new_refresh, new_hash))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    // Store new refresh token
    let db3 = state.db.clone();
    let uid2 = user_id;
    tokio::task::spawn_blocking(move || {
        jwt::store_refresh_token(&db3, &uid2, &new_hash)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(AuthTokensResponse {
        access_token: access_token,
        refresh_token: new_refresh,
    }))
}
