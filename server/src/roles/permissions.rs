use axum::http::StatusCode;
use bitflags::bitflags;

use crate::db::DbPool;

bitflags! {
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct Permissions: u32 {
        const SEND_MESSAGES   = 1 << 0;  // 0x01
        const MANAGE_CHANNELS = 1 << 1;  // 0x02
        const KICK_MEMBERS    = 1 << 2;  // 0x04
        const BAN_MEMBERS     = 1 << 3;  // 0x08
        const ADMIN           = 1 << 4;  // 0x10
    }
}

impl Permissions {
    /// ADMIN implies all other permissions.
    pub fn effective(self) -> Permissions {
        if self.contains(Permissions::ADMIN) {
            Permissions::all()
        } else {
            self
        }
    }
}

/// Compute effective permissions for a user.
/// Owner always has all permissions.
/// Otherwise, OR together permissions from all assigned roles (including @everyone).
pub fn compute_user_permissions(is_owner: bool, role_permissions: &[u32]) -> Permissions {
    if is_owner {
        return Permissions::all();
    }
    let combined = role_permissions.iter().fold(0u32, |acc, p| acc | p);
    Permissions::from_bits_truncate(combined).effective()
}

/// Check if a user has the required permission.
/// Reads current roles from DB (not JWT) to reflect real-time changes.
/// Owner always passes. Returns Err(FORBIDDEN) on failure.
pub async fn require_permission(
    db: &DbPool,
    user_id: &str,
    is_owner: bool,
    required: Permissions,
) -> Result<(), StatusCode> {
    if is_owner {
        return Ok(());
    }

    let db = db.clone();
    let uid = user_id.to_string();

    let has_permission = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Get permission bits from all assigned roles + @everyone (is_default=1)
        let mut stmt = conn
            .prepare(
                "SELECT r.permissions FROM roles r
                 INNER JOIN user_roles ur ON ur.role_id = r.id
                 WHERE ur.user_id = ?1
                 UNION ALL
                 SELECT r.permissions FROM roles r WHERE r.is_default = 1",
            )
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let perms: Vec<u32> = stmt
            .query_map([&uid], |row| row.get(0))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        let effective = compute_user_permissions(false, &perms);
        Ok::<bool, StatusCode>(effective.contains(required))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    if has_permission {
        Ok(())
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}
