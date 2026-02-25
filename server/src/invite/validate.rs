use axum::http::StatusCode;
use chrono::Utc;

/// Atomically consume an invite code.
/// Increments use_count if the invite is valid, not expired, and not exhausted.
/// Returns Ok(()) on success or Err with status and message on failure.
pub fn consume_invite(
    conn: &rusqlite::Connection,
    code: &str,
) -> Result<(), (StatusCode, String)> {
    let now = Utc::now().to_rfc3339();

    let rows_affected = conn
        .execute(
            "UPDATE invites SET use_count = use_count + 1 WHERE code = ?1 AND (expires_at IS NULL OR expires_at > ?2) AND (max_uses IS NULL OR use_count < max_uses)",
            rusqlite::params![code, now],
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Consume invite: {}", e),
            )
        })?;

    if rows_affected == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid, expired, or exhausted invite code".to_string(),
        ));
    }

    Ok(())
}
