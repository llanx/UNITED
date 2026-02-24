use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

/// Public server info response (visible to anyone)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerInfoResponse {
    pub name: String,
    pub description: String,
    pub registration_mode: String,
    pub version: String,
}

/// Admin-only settings update request
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSettingsRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub registration_mode: Option<String>,
}

/// GET /api/server/info - Public endpoint, no auth required
pub async fn get_server_info(
    State(state): State<AppState>,
) -> Result<Json<ServerInfoResponse>, StatusCode> {
    let db = state.db.clone();

    let info = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let name = get_setting(&conn, "name").unwrap_or_else(|| get_default_server_name());
        let description = get_setting(&conn, "description").unwrap_or_default();
        let registration_mode =
            get_setting(&conn, "registration_mode").unwrap_or_else(|| "open".to_string());

        Ok::<ServerInfoResponse, StatusCode>(ServerInfoResponse {
            name,
            description,
            registration_mode,
            version: env!("CARGO_PKG_VERSION").to_string(),
        })
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(info))
}

/// PUT /api/server/settings - Admin-only endpoint
pub async fn update_server_settings(
    State(state): State<AppState>,
    claims: crate::auth::middleware::Claims,
    Json(req): Json<UpdateSettingsRequest>,
) -> Result<Json<ServerInfoResponse>, StatusCode> {
    // Check admin or owner role
    if !claims.is_admin && !claims.is_owner {
        return Err(StatusCode::FORBIDDEN);
    }

    let db = state.db.clone();

    let info = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        if let Some(name) = &req.name {
            set_setting(&conn, "name", name)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
        if let Some(description) = &req.description {
            set_setting(&conn, "description", description)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
        if let Some(mode) = &req.registration_mode {
            match mode.as_str() {
                "open" | "invite-only" => {
                    set_setting(&conn, "registration_mode", mode)
                        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                }
                _ => return Err(StatusCode::BAD_REQUEST),
            }
        }

        // Return updated info
        let name = get_setting(&conn, "name").unwrap_or_else(|| get_default_server_name());
        let description = get_setting(&conn, "description").unwrap_or_default();
        let registration_mode =
            get_setting(&conn, "registration_mode").unwrap_or_else(|| "open".to_string());

        Ok::<ServerInfoResponse, StatusCode>(ServerInfoResponse {
            name,
            description,
            registration_mode,
            version: env!("CARGO_PKG_VERSION").to_string(),
        })
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Json(info))
}

/// Get a setting value from server_settings table
fn get_setting(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM server_settings WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .ok()
}

/// Set a setting value in server_settings table (insert or replace)
fn set_setting(
    conn: &rusqlite::Connection,
    key: &str,
    value: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO server_settings (key, value) VALUES (?1, ?2)",
        [key, value],
    )?;
    Ok(())
}

/// Default server name based on hostname
fn get_default_server_name() -> String {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "UNITED Server".to_string())
}
