use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::auth::middleware::Claims;
use crate::roles::permissions::{require_permission, Permissions};
use crate::state::AppState;
use crate::ws::broadcast::broadcast_to_all;
use crate::proto::ws::{envelope::Payload, Envelope};
use crate::proto::roles as proto_roles;

use super::crud::RoleResponse;

#[derive(Debug, Deserialize)]
pub struct AssignRoleRequest {
    pub user_id: String,
    pub role_id: String,
}

#[derive(Debug, Deserialize)]
pub struct RemoveRoleRequest {
    pub user_id: String,
    pub role_id: String,
}

#[derive(Debug, Serialize)]
pub struct UserRolesResponse {
    pub roles: Vec<RoleResponse>,
}

/// POST /api/roles/assign — Assign a role to a user (requires ADMIN permission).
pub async fn assign_role(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<AssignRoleRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_permission(&state.db, &claims.sub, claims.is_owner, Permissions::ADMIN)
        .await
        .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let user_id = req.user_id.clone();
    let role_id = req.role_id.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        // Verify user exists
        let user_exists: bool = conn
            .query_row("SELECT COUNT(*) FROM users WHERE id = ?1", [&user_id], |row| {
                row.get::<_, i64>(0).map(|c| c > 0)
            })
            .unwrap_or(false);
        if !user_exists {
            return Err((StatusCode::NOT_FOUND, "User not found".to_string()));
        }

        // Verify role exists
        let role_exists: bool = conn
            .query_row("SELECT COUNT(*) FROM roles WHERE id = ?1", [&role_id], |row| {
                row.get::<_, i64>(0).map(|c| c > 0)
            })
            .unwrap_or(false);
        if !role_exists {
            return Err((StatusCode::NOT_FOUND, "Role not found".to_string()));
        }

        let now = Utc::now().to_rfc3339();

        // Insert (ignore if already exists)
        conn.execute(
            "INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![user_id, role_id, now],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Assign role: {}", e)))?;

        Ok::<_, (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast RoleAssignedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::RoleAssignedEvent(proto_roles::RoleAssignedEvent {
            user_id: req.user_id,
            role_id: req.role_id,
        })),
    };
    broadcast_to_all(&state.connections, &event);

    Ok(StatusCode::OK)
}

/// POST /api/roles/remove — Remove a role from a user (requires ADMIN permission).
/// Cannot remove the @everyone (default) role from users.
pub async fn remove_role(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<RemoveRoleRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_permission(&state.db, &claims.sub, claims.is_owner, Permissions::ADMIN)
        .await
        .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let user_id = req.user_id.clone();
    let role_id = req.role_id.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        // Check if role is default — cannot remove @everyone
        let is_default: bool = conn
            .query_row(
                "SELECT is_default FROM roles WHERE id = ?1",
                [&role_id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|_| (StatusCode::NOT_FOUND, "Role not found".to_string()))?;

        if is_default {
            return Err((
                StatusCode::BAD_REQUEST,
                "Cannot remove the default role".to_string(),
            ));
        }

        conn.execute(
            "DELETE FROM user_roles WHERE user_id = ?1 AND role_id = ?2",
            rusqlite::params![user_id, role_id],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Remove role: {}", e)))?;

        Ok::<_, (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast RoleRemovedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::RoleRemovedEvent(proto_roles::RoleRemovedEvent {
            user_id: req.user_id,
            role_id: req.role_id,
        })),
    };
    broadcast_to_all(&state.connections, &event);

    Ok(StatusCode::OK)
}

/// GET /api/roles/user/{user_id} — Get all roles assigned to a user.
/// Includes @everyone (default) role via UNION with explicit assignments.
pub async fn get_user_roles(
    State(state): State<AppState>,
    _claims: Claims,
    Path(user_id): Path<String>,
) -> Result<Json<UserRolesResponse>, StatusCode> {
    let db = state.db.clone();

    let roles = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Get roles from user_roles + default roles (UNION to include @everyone)
        let mut stmt = conn
            .prepare(
                "SELECT r.id, r.name, r.permissions, r.color, r.position, r.is_default
                 FROM roles r
                 INNER JOIN user_roles ur ON ur.role_id = r.id
                 WHERE ur.user_id = ?1
                 UNION
                 SELECT r.id, r.name, r.permissions, r.color, r.position, r.is_default
                 FROM roles r
                 WHERE r.is_default = 1
                 ORDER BY position ASC",
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let rows: Vec<RoleResponse> = stmt
            .query_map([&user_id], |row| {
                Ok(RoleResponse {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    permissions: row.get::<_, u32>(2)?,
                    color: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    position: row.get(4)?,
                    is_default: row.get::<_, bool>(5)?,
                })
            })
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        Ok::<_, StatusCode>(rows)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(UserRolesResponse { roles }))
}
