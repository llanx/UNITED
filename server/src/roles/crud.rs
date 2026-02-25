use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::middleware::Claims;
use crate::roles::permissions::{require_permission, Permissions};
use crate::state::AppState;
use crate::ws::broadcast::broadcast_to_all;
use crate::proto::ws::{envelope::Payload, Envelope};
use crate::proto::roles as proto_roles;

#[derive(Debug, Serialize, Deserialize)]
pub struct RoleResponse {
    pub id: String,
    pub name: String,
    pub permissions: u32,
    pub color: String,
    pub position: i64,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoleListResponse {
    pub roles: Vec<RoleResponse>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoleRequest {
    pub name: String,
    pub permissions: u32,
    #[serde(default)]
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoleRequest {
    pub name: Option<String>,
    pub permissions: Option<u32>,
    pub color: Option<String>,
}

/// GET /api/roles — List all roles ordered by position.
pub async fn list_roles(
    State(state): State<AppState>,
    _claims: Claims,
) -> Result<Json<RoleListResponse>, StatusCode> {
    let db = state.db.clone();

    let roles = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let mut stmt = conn
            .prepare("SELECT id, name, permissions, color, position, is_default FROM roles ORDER BY position ASC")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let rows: Vec<RoleResponse> = stmt
            .query_map([], |row| {
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

    Ok(Json(RoleListResponse { roles }))
}

/// POST /api/roles — Create a new role (requires ADMIN permission).
pub async fn create_role(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<CreateRoleRequest>,
) -> Result<(StatusCode, Json<RoleResponse>), (StatusCode, String)> {
    // Permission check
    require_permission(&state.db, &claims.sub, claims.is_owner, Permissions::ADMIN)
        .await
        .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    if req.name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Role name cannot be empty".to_string()));
    }

    let db = state.db.clone();
    let name = req.name.clone();
    let permissions = req.permissions;
    let color = req.color.clone();

    let role = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        // Get next position
        let max_pos: i64 = conn
            .query_row("SELECT COALESCE(MAX(position), 0) FROM roles", [], |row| row.get(0))
            .unwrap_or(0);

        let role_id = Uuid::now_v7().to_string();
        let now = Utc::now().to_rfc3339();
        let position = max_pos + 1;

        conn.execute(
            "INSERT INTO roles (id, name, permissions, color, position, is_default, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)",
            rusqlite::params![role_id, name, permissions, color, position, now, now],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Insert role: {}", e)))?;

        Ok::<_, (StatusCode, String)>(RoleResponse {
            id: role_id,
            name,
            permissions,
            color,
            position,
            is_default: false,
        })
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast RoleCreatedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::RoleCreatedEvent(proto_roles::RoleCreatedEvent {
            role: Some(proto_roles::Role {
                id: role.id.clone(),
                name: role.name.clone(),
                permissions: role.permissions,
                color: role.color.clone(),
                position: role.position,
                is_default: false,
            }),
        })),
    };
    broadcast_to_all(&state.connections, &event);

    Ok((StatusCode::CREATED, Json(role)))
}

/// PUT /api/roles/{id} — Update a role (requires ADMIN permission).
pub async fn update_role(
    State(state): State<AppState>,
    claims: Claims,
    Path(role_id): Path<String>,
    Json(req): Json<UpdateRoleRequest>,
) -> Result<Json<RoleResponse>, (StatusCode, String)> {
    require_permission(&state.db, &claims.sub, claims.is_owner, Permissions::ADMIN)
        .await
        .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let rid = role_id.clone();

    let role = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        // Check role exists
        let exists: bool = conn
            .query_row("SELECT COUNT(*) FROM roles WHERE id = ?1", [&rid], |row| {
                row.get::<_, i64>(0).map(|c| c > 0)
            })
            .unwrap_or(false);

        if !exists {
            return Err((StatusCode::NOT_FOUND, "Role not found".to_string()));
        }

        let now = Utc::now().to_rfc3339();

        // Apply optional updates
        if let Some(ref name) = req.name {
            conn.execute(
                "UPDATE roles SET name = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![name, now, rid],
            )
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Update name: {}", e)))?;
        }

        if let Some(permissions) = req.permissions {
            conn.execute(
                "UPDATE roles SET permissions = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![permissions, now, rid],
            )
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Update perms: {}", e)))?;
        }

        if let Some(ref color) = req.color {
            conn.execute(
                "UPDATE roles SET color = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![color, now, rid],
            )
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Update color: {}", e)))?;
        }

        // Read back updated role
        let role = conn
            .query_row(
                "SELECT id, name, permissions, color, position, is_default FROM roles WHERE id = ?1",
                [&rid],
                |row| {
                    Ok(RoleResponse {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        permissions: row.get::<_, u32>(2)?,
                        color: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                        position: row.get(4)?,
                        is_default: row.get::<_, bool>(5)?,
                    })
                },
            )
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Read role: {}", e)))?;

        Ok::<_, (StatusCode, String)>(role)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast RoleUpdatedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::RoleUpdatedEvent(proto_roles::RoleUpdatedEvent {
            role: Some(proto_roles::Role {
                id: role.id.clone(),
                name: role.name.clone(),
                permissions: role.permissions,
                color: role.color.clone(),
                position: role.position,
                is_default: role.is_default,
            }),
        })),
    };
    broadcast_to_all(&state.connections, &event);

    Ok(Json(role))
}

/// DELETE /api/roles/{id} — Delete a role (requires ADMIN permission).
/// Cannot delete the default (@everyone) role.
pub async fn delete_role(
    State(state): State<AppState>,
    claims: Claims,
    Path(role_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_permission(&state.db, &claims.sub, claims.is_owner, Permissions::ADMIN)
        .await
        .map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let rid = role_id.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "DB lock".to_string()))?;

        // Check if role is default
        let is_default: bool = conn
            .query_row(
                "SELECT is_default FROM roles WHERE id = ?1",
                [&rid],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|_| (StatusCode::NOT_FOUND, "Role not found".to_string()))?;

        if is_default {
            return Err((StatusCode::BAD_REQUEST, "Cannot delete the default role".to_string()));
        }

        // Delete user_roles entries for this role first (cascade)
        conn.execute("DELETE FROM user_roles WHERE role_id = ?1", [&rid])
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Delete user_roles: {}", e)))?;

        // Delete the role
        conn.execute("DELETE FROM roles WHERE id = ?1", [&rid])
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Delete role: {}", e)))?;

        Ok::<_, (StatusCode, String)>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))??;

    // Broadcast RoleDeletedEvent
    let event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::RoleDeletedEvent(proto_roles::RoleDeletedEvent {
            role_id: role_id.clone(),
        })),
    };
    broadcast_to_all(&state.connections, &event);

    Ok(StatusCode::OK)
}

