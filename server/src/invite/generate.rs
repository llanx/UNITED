use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::auth::middleware::Claims;
use crate::roles::permissions::{require_permission, Permissions};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateInviteRequest {
    #[serde(default)]
    pub max_uses: i64,
    #[serde(default)]
    pub expires_at: String,
}

#[derive(Debug, Serialize)]
pub struct InviteResponse {
    pub code: String,
    pub created_by: String,
    pub max_uses: i64,
    pub use_count: i64,
    pub expires_at: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct InviteListResponse {
    pub invites: Vec<InviteResponse>,
}

/// Generate an 8-character alphanumeric invite code.
fn generate_code() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::rng();
    (0..8)
        .map(|_| {
            let idx = rng.random_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// POST /api/invites — Create a new invite (requires ADMIN).
pub async fn create_invite(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<CreateInviteRequest>,
) -> Result<(StatusCode, Json<InviteResponse>), (StatusCode, String)> {
    require_permission(&state.db, &claims.sub, claims.is_owner, Permissions::ADMIN)
        .await
        .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let created_by = claims.sub.clone();
    let max_uses = req.max_uses;
    let expires_at = req.expires_at.clone();

    let invite = tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        let code = generate_code();
        let now = Utc::now().to_rfc3339();
        let exp = if expires_at.is_empty() {
            None
        } else {
            Some(expires_at.as_str())
        };
        let max = if max_uses == 0 { None } else { Some(max_uses) };

        conn.execute(
            "INSERT INTO invites (code, created_by, max_uses, use_count, expires_at, created_at) VALUES (?1, ?2, ?3, 0, ?4, ?5)",
            rusqlite::params![code, created_by, max, exp, now],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Insert invite: {}", e)))?;

        Ok::<_, (StatusCode, String)>(InviteResponse {
            code,
            created_by,
            max_uses,
            use_count: 0,
            expires_at: exp.unwrap_or("").to_string(),
            created_at: now,
        })
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    Ok((StatusCode::CREATED, Json(invite)))
}

/// GET /api/invites — List all invites (requires ADMIN).
pub async fn list_invites(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<InviteListResponse>, (StatusCode, String)> {
    require_permission(&state.db, &claims.sub, claims.is_owner, Permissions::ADMIN)
        .await
        .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();

    let invites = tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        let mut stmt = conn
            .prepare("SELECT code, created_by, max_uses, use_count, expires_at, created_at FROM invites")
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Query invites".to_string()))?;

        let invites: Vec<InviteResponse> = stmt
            .query_map([], |row| {
                Ok(InviteResponse {
                    code: row.get(0)?,
                    created_by: row.get(1)?,
                    max_uses: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                    use_count: row.get(3)?,
                    expires_at: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                    created_at: row.get(5)?,
                })
            })
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Read invites".to_string()))?
            .filter_map(|r| r.ok())
            .collect();

        Ok::<_, (StatusCode, String)>(invites)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    Ok(Json(InviteListResponse { invites }))
}

/// DELETE /api/invites/{code} — Delete an invite (requires ADMIN).
pub async fn delete_invite(
    State(state): State<AppState>,
    claims: Claims,
    Path(code): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_permission(&state.db, &claims.sub, claims.is_owner, Permissions::ADMIN)
        .await
        .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;
        conn.execute("DELETE FROM invites WHERE code = ?1", [&code])
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Delete invite: {}", e),
                )
            })?;
        Ok::<_, (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    Ok(StatusCode::OK)
}
