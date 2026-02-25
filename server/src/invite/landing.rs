use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Html,
};
use chrono::Utc;

use crate::state::AppState;

/// Escape HTML special characters.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// GET /invite/{code} — Public landing page for invite links.
/// Shows server info and an "Open in UNITED" deep link.
pub async fn invite_landing_page(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> Result<Html<String>, StatusCode> {
    let db = state.db.clone();
    let invite_code = code.clone();

    let (server_name, server_description) = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let now = Utc::now().to_rfc3339();

        // Verify invite exists and is valid
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM invites WHERE code = ?1 AND (expires_at IS NULL OR expires_at > ?2) AND (max_uses IS NULL OR use_count < max_uses)",
                rusqlite::params![invite_code, now],
                |row| row.get::<_, i64>(0).map(|c| c > 0),
            )
            .unwrap_or(false);

        if !exists {
            return Err(StatusCode::NOT_FOUND);
        }

        // Get server name and description
        let name: String = conn
            .query_row(
                "SELECT value FROM server_settings WHERE key = 'name'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "UNITED Server".to_string());

        let description: String = conn
            .query_row(
                "SELECT value FROM server_settings WHERE key = 'description'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_default();

        Ok::<_, StatusCode>((name, description))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let escaped_name = html_escape(&server_name);
    let escaped_desc = html_escape(&server_description);
    let escaped_code = html_escape(&code);

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Join {name} on UNITED</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }}
        .card {{ background: #16213e; border-radius: 12px; padding: 2rem; max-width: 400px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }}
        h1 {{ color: #fff; margin-bottom: 0.5rem; }}
        .desc {{ color: #a0a0a0; margin-bottom: 1.5rem; }}
        .btn {{ display: inline-block; background: #0f3460; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 1.1rem; margin: 0.5rem; }}
        .btn:hover {{ background: #1a4a7a; }}
        .code {{ font-family: monospace; background: #0f3460; padding: 4px 8px; border-radius: 4px; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>{name}</h1>
        <p class="desc">{desc}</p>
        <p>You've been invited to join this server!</p>
        <p>Invite code: <span class="code">{code}</span></p>
        <a class="btn" href="united://invite/{code}">Open in UNITED</a>
        <br>
        <a class="btn" href="https://github.com/llanx/UNITED/releases">Download UNITED</a>
    </div>
</body>
</html>"#,
        name = escaped_name,
        desc = escaped_desc,
        code = escaped_code,
    );

    Ok(Html(html))
}
