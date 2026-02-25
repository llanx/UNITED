# Phase 2: Server Management - Research

**Researched:** 2026-02-24
**Domain:** Server-side CRUD for channels/categories/roles/permissions/bans/invites + SEC-12 device provisioning
**Confidence:** HIGH

## Summary

Phase 2 extends the Phase 1 foundation (auth, identity, WebSocket, server settings) with full server management capabilities: channels organized into categories, a role-based permission system using bitwise flags, moderation tools (kick/ban), invite links with landing pages, and SEC-12 device provisioning via QR code.

The existing Phase 1 architecture maps directly onto Phase 2 requirements. The `rusqlite_migration` system supports appending new migrations. The axum route handlers, JWT `Claims` extractor, protobuf Envelope dispatch, and `spawn_blocking` DB access pattern all extend naturally. The primary challenge is getting the schema right (6 new tables in Migration 2), implementing permission checks consistently across REST and WebSocket endpoints, and broadcasting real-time state changes to all connected clients.

SEC-12 (QR-bootstrapped local device provisioning) is architecturally distinct from the server management CRUD and should be planned as a standalone work stream. It operates entirely client-side (Electron main process + new device), uses ephemeral X25519 key exchange over a local TCP connection, and requires no server involvement.

**Primary recommendation:** Build the schema migration first (categories, channels, roles, user_roles, bans, invites tables), then implement server startup seeding (starter template + @everyone role), then layer REST endpoints using the established axum pattern with a `require_permission()` guard, then extend the WebSocket protobuf envelope with real-time push events for all mutations, and finally implement SEC-12 as a standalone client-side module.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Server starts with a **starter template**: General category (#general, #introductions) + Voice category (one voice channel)
- **Flat categories only** -- categories contain channels, no nested categories. Like Discord.
- Every channel **must belong to a category** -- no uncategorized/orphan channels. Starter template provides defaults so this adds no friction.
- **Manual drag-and-drop ordering** -- admin reorders channels by dragging. Server stores explicit position integers.
- Categories are also manually ordered with position integers.
- **Role-only permissions (server-wide)** -- no per-channel overrides in Phase 2. Data model designed to accommodate channel overrides later (v2 ASRV-01).
- **Minimal permission set:** `send_messages`, `manage_channels`, `kick_members`, `ban_members`, `admin`. Matches SRVR-03 exactly.
- **Default @everyone role** -- auto-assigned to all users on join. Permissions configurable by admin.
- **Union resolution** -- if ANY role grants a permission, the user has it. Bitwise OR of all role permission flags. No priority-based ordering.
- Owner role (from Phase 1 setup token) has all permissions implicitly -- not represented as a regular role.
- **Kick = soft removal** -- kicked user can rejoin immediately with a valid invite. Kick is a warning; ban is the escalation.
- **Clear ban notice** -- banned user sees "You have been banned from [server name]" with the optional reason. Uses existing 4003 WebSocket close code from Phase 1.
- **Optional ban reason** -- admin can write a reason when banning. Reason is shown to the banned user.
- **Permanent + temporary bans** -- admin can set an optional duration (e.g., 1h, 24h, 7d, custom). Ban auto-expires after duration. Permanent bans have no expiration.
- Ban records stored with: banned user fingerprint, admin who banned, reason (optional), timestamp, expiration (optional).
- **Server URL + code format** -- e.g., `https://myserver.com:1984/invite/abc123`. Server serves a landing page at that URL showing server info + "Open in UNITED" button + download link.
- **Expiration + use count limits** -- both optional. Admin can set time expiration (1h, 24h, 7d, never) AND max uses (1, 5, 10, 25, 100, unlimited).
- **QR-bootstrapped local device transfer (SEC-12)** -- QR code contains a short-lived encryption key + local network address. Devices connect directly over local network, transfer full current keypair encrypted. No server involvement.
- **Onboarding: straight to #general by default** -- no welcome screen unless admin explicitly enables it. Admin can configure a welcome overlay (server name + description + optional rules) in server settings.

### Claude's Discretion
- Invite code generation algorithm (random string length, character set)
- Exact QR code content format and encryption scheme for device provisioning
- Local network discovery mechanism for device-to-device transfer (mDNS, BLE, etc.)
- Invite landing page HTML/styling
- Position integer gap strategy for channel/category reordering (e.g., start at 1000, increment by 1000)
- Ban expiration check mechanism (polling vs. lazy check on connection)
- Welcome overlay component design and animation

### Deferred Ideas (OUT OF SCOPE)
- Channel-level permission overrides per role -- v2 (ASRV-01)
- Audit log for admin actions -- v2 (ASRV-03)
- Server rules/guidelines feature (beyond welcome screen description)
- "Muted" or "timeout" role for temporary restriction without kick/ban
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRVR-01 | Server admin can create, rename, and delete text and voice channels | SQLite schema (channels table with `channel_type` TEXT column), REST endpoints with `require_permission(MANAGE_CHANNELS)`, protobuf messages, position integer ordering, WS broadcast events |
| SRVR-02 | Server admin can organize channels into categories | SQLite schema (categories table), `category_id` FK on channels, both tables have position integers, starter template seeding on first boot |
| SRVR-03 | Server admin can create and configure roles with specific permissions (send messages, manage channels, kick/ban, admin) | `bitflags` crate for Permissions type (u32 bitfield, 5 named flags), roles table with INTEGER permissions column, REST endpoints for CRUD |
| SRVR-04 | Server admin can assign roles to users | `user_roles` junction table (composite PK), REST endpoint, WS push event for role changes, @everyone auto-assignment on join |
| SRVR-05 | Server admin can kick users from the server | Kick endpoint closes WS connections (via ConnectionRegistry) with close code 4004, removes non-default role assignments, does NOT delete user row. User can rejoin with valid invite. |
| SRVR-06 | Server admin can ban users from the server (propagated to peers to stop relaying banned user's content) | `bans` table with fingerprint, expiration, reason; lazy ban check on WS connect + REST auth; 4003 close code with reason; force-close existing WS connections on ban. P2P propagation deferred to Phase 3. |
| SRVR-08 | Server admin can generate invite links with optional expiration | `invites` table with code (8-char alphanumeric), expiration, max_uses, use_count; REST endpoint; atomic use_count increment via SQL WHERE clause; landing page at `/invite/{code}` |
| SRVR-09 | New user can join a server via invite link, which bootstraps P2P peer discovery and begins content replication | Invite validation on registration (code consumed atomically), user added to server with @everyone role and starter template visibility. P2P peer discovery deferred to Phase 3. |
| SEC-12 | User can provision a new device by scanning a QR code from an existing device (direct encrypted key transfer, no server involvement) | Client-side only: QR encodes ephemeral X25519 pubkey + IP + port; local TCP listener; HKDF-SHA256 shared secret; AES-256-GCM encrypted keypair transfer. Uses x25519-dalek 2.x (compatible with existing ed25519-dalek 2.2). |
</phase_requirements>

## Standard Stack

### Core (already in project, extends naturally)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axum | 0.8 | HTTP server, REST endpoints | Already used in Phase 1; add new route groups for channels, roles, moderation, invites |
| rusqlite | 0.38 | SQLite database | Already used; add Migration 2 with 6 new tables |
| rusqlite_migration | 2.4 | Schema version tracking | Already used; append `M::up()` to migrations vec. Tracks via SQLite `user_version` pragma. |
| prost | 0.14 | Protobuf encoding | Already used; extend .proto files with new messages for channels, roles, moderation, invites |
| jsonwebtoken | 10.3 | JWT auth | Already used; `Claims` extractor for admin/permission checks |
| dashmap | 6 | Connection registry | Already used; iterate for broadcast, lookup for targeted send/kick/ban force-close |
| chrono | 0.4 | Timestamps, ban expiration | Already used; ISO 8601 comparison for ban/invite expiration checks |
| uuid | 1 (v7) | Record IDs | Already used; all new records use UUIDv7 |
| rand | 0.9 | Random generation | Already used; invite code generation. Note: `gen_range` renamed to `random_range` in 0.9; `thread_rng()` renamed to `rng()`. Project already uses 0.9 API. |

### New Dependencies (Server)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bitflags | 2.11 | Permission bitfield type safety | Define `Permissions` struct with named flags. Provides `Debug`, `from_bits_truncate`, `contains`, `all()`, bitwise ops. |

### New Dependencies (Client - SEC-12)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| x25519-dalek | 2.x | Ephemeral X25519 key exchange | Device provisioning: ephemeral DH shared secret for encrypting keypair transfer. Compatible with existing ed25519-dalek 2.2 (shared curve25519-dalek 4.x dependency). |
| qrcode.react | (already present in client) | QR code rendering | Display QR for device provisioning (same lib used for TOTP QR). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bitflags crate | Raw integer constants (existing `ROLE_ADMIN: i64 = 1` pattern) | bitflags provides type safety, Debug formatting, named flags, and `contains()`. Raw integers work but are error-prone as the permission count grows beyond the initial `ROLE_ADMIN` constant. |
| Separate invites table | Encode invite data in signed JWT | DB table allows use_count tracking, revocation, and admin listing; JWT invites are stateless but can't be revoked or counted. |
| mdns-sd for LAN discovery (SEC-12) | Manual IP entry via QR | Encoding IP + port directly in QR code is simpler, more reliable (no firewall issues), and the devices must be physically co-located anyway. mDNS adds complexity without clear benefit for QR-based pairing. |
| tower-http `fs` feature for landing page | Embedded HTML string in handler | A single landing page doesn't justify a static file serving layer. Inline HTML via `axum::response::Html` is simpler and more maintainable. |
| Floating-point positions for ordering | Integer positions with gap strategy | Integer positions are simpler to reason about, have no precision issues, and the gap strategy (increment 1000) handles the same reorder patterns. Floating-point adds complexity for no benefit at this scale. |

### Installation

Server (add to Cargo.toml):
```toml
bitflags = "2"
```

No tower-http feature changes needed -- the invite landing page uses `axum::response::Html`, not static file serving.

For SEC-12 client-side (Rust-based provisioning helper, or Node.js):
```toml
# If using Rust for the provisioning TCP server (optional):
x25519-dalek = { version = "2", features = ["static_secrets"] }
```

## Architecture Patterns

### Recommended Project Structure Additions

```
server/src/
  channels/
    mod.rs          # pub mod for channels module
    crud.rs         # Create, rename, delete channels and categories
    ordering.rs     # Position reorder logic (gap strategy + renormalization)
  roles/
    mod.rs          # pub mod for roles module
    crud.rs         # Create, update, delete roles
    permissions.rs  # Permissions bitflags definition and resolution
    assignment.rs   # Assign/remove roles to/from users
  moderation/
    mod.rs          # pub mod
    kick.rs         # Kick endpoint + WS force-close
    ban.rs          # Ban/unban endpoints, ban check, force-close
  invite/
    mod.rs          # pub mod
    generate.rs     # Create invite with expiration + use count
    validate.rs     # Validate and consume invite codes (atomic)
    landing.rs      # Serve invite landing page HTML

shared/proto/
  channels.proto    # Channel/category messages
  roles.proto       # Role/permission messages
  moderation.proto  # Kick/ban messages
  invite.proto      # Invite messages
  (ws.proto updated with new Envelope payload variants)

client/src/
  main/
    provisioning/   # SEC-12: QR generation, TCP listener, encrypted transfer
```

### Pattern 1: Permission Bitflags

**What:** Define permissions as named bit flags in a u32 integer. Use bitwise OR for union resolution across all user roles. Store as INTEGER in SQLite.

**When to use:** All permission checks (REST endpoint guards, WS message authorization).

```rust
use bitflags::bitflags;

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
    /// ADMIN implies all other permissions
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
pub fn compute_user_permissions(
    is_owner: bool,
    role_permissions: &[u32],
) -> Permissions {
    if is_owner {
        return Permissions::all();
    }
    let combined = role_permissions.iter().fold(0u32, |acc, p| acc | p);
    Permissions::from_bits_truncate(combined).effective()
}
```

**Source:** Discord permission model (bitwise OR of role permissions, ADMINISTRATOR implies all). Adapted for UNITED's minimal 5-permission set.

### Pattern 2: Position Integer Gap Strategy

**What:** Assign position integers with large gaps (increments of 1000) to minimize cascading updates on reorder.

**When to use:** Channel and category ordering.

```rust
/// Default gap between position values
const POSITION_GAP: i64 = 1000;

/// Compute a new position between two existing positions.
/// Returns the midpoint. If midpoint equals either input, caller must renormalize.
fn position_between(before: i64, after: i64) -> i64 {
    (before + after) / 2
}

/// Assign initial positions to items in order.
/// Items get positions: 1000, 2000, 3000, ...
fn assign_initial_positions(count: usize) -> Vec<i64> {
    (1..=count as i64).map(|i| i * POSITION_GAP).collect()
}

/// Renormalize: reassign positions with even gaps when gaps collapse.
/// Called when position_between returns a duplicate.
fn renormalize_positions(item_ids: &[String], conn: &rusqlite::Connection, table: &str) {
    for (i, id) in item_ids.iter().enumerate() {
        let new_pos = (i as i64 + 1) * POSITION_GAP;
        conn.execute(
            &format!("UPDATE {} SET position = ?1 WHERE id = ?2", table),
            rusqlite::params![new_pos, id],
        ).ok();
    }
}
```

**Source:** Standard pattern used by Trello, Notion, Figma for drag-and-drop ordering. Gap of 1000 allows ~10 reorders between any two adjacent items before renormalization is needed.

### Pattern 3: Schema Migration Extension

**What:** Append a new `M::up()` to the existing migrations vector in `server/src/db/migrations.rs`. rusqlite_migration tracks applied migrations via SQLite `user_version` pragma and applies only unapplied migrations.

**When to use:** Adding new tables for Phase 2.

```rust
pub fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up("-- Migration 1: Initial schema (Phase 1)
            ...existing migration 1 SQL unchanged...
        "),
        M::up("-- Migration 2: Server Management (Phase 2)

            CREATE TABLE categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE channels (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                channel_type TEXT NOT NULL DEFAULT 'text',
                category_id TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                topic TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            );

            CREATE INDEX idx_channels_category ON channels(category_id);

            CREATE TABLE roles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                permissions INTEGER NOT NULL DEFAULT 0,
                color TEXT,
                position INTEGER NOT NULL DEFAULT 0,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE user_roles (
                user_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                assigned_at TEXT NOT NULL,
                PRIMARY KEY (user_id, role_id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (role_id) REFERENCES roles(id)
            );

            CREATE INDEX idx_user_roles_user ON user_roles(user_id);
            CREATE INDEX idx_user_roles_role ON user_roles(role_id);

            CREATE TABLE bans (
                id TEXT PRIMARY KEY,
                fingerprint TEXT NOT NULL,
                banned_by TEXT NOT NULL,
                reason TEXT,
                expires_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (banned_by) REFERENCES users(id)
            );

            CREATE UNIQUE INDEX idx_bans_fingerprint ON bans(fingerprint);

            CREATE TABLE invites (
                code TEXT PRIMARY KEY,
                created_by TEXT NOT NULL,
                max_uses INTEGER,
                use_count INTEGER NOT NULL DEFAULT 0,
                expires_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (created_by) REFERENCES users(id)
            );
        "),
    ])
}
```

**Key:** Migration 1 is NEVER modified. Migration 2 is appended. rusqlite_migration applies only unapplied migrations based on `user_version`.

### Pattern 4: Starter Template Seeding

**What:** On first server boot (after owner registers via setup token), seed default categories, channels, and the @everyone role.

**When to use:** After owner registration completes -- triggered in the registration handler when `is_owner == true`.

```rust
/// Seed the starter template: General category (#general, #introductions)
/// + Voice category (one voice channel) + @everyone role.
/// Only runs if no categories exist (prevents double-seeding).
fn seed_starter_template(conn: &rusqlite::Connection) -> Result<(), rusqlite::Error> {
    // Guard: don't seed if categories already exist
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM categories", [], |row| row.get(0)
    ).unwrap_or(0);
    if count > 0 { return Ok(()); }

    let now = chrono::Utc::now().to_rfc3339();

    // General category
    let general_cat_id = uuid::Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO categories (id, name, position, created_at) VALUES (?1, 'General', 1000, ?2)",
        rusqlite::params![general_cat_id, now],
    )?;

    // #general channel
    conn.execute(
        "INSERT INTO channels (id, name, channel_type, category_id, position, created_at) \
         VALUES (?1, 'general', 'text', ?2, 1000, ?3)",
        rusqlite::params![uuid::Uuid::now_v7().to_string(), general_cat_id, now],
    )?;

    // #introductions channel
    conn.execute(
        "INSERT INTO channels (id, name, channel_type, category_id, position, created_at) \
         VALUES (?1, 'introductions', 'text', ?2, 2000, ?3)",
        rusqlite::params![uuid::Uuid::now_v7().to_string(), general_cat_id, now],
    )?;

    // Voice category
    let voice_cat_id = uuid::Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO categories (id, name, position, created_at) VALUES (?1, 'Voice', 2000, ?2)",
        rusqlite::params![voice_cat_id, now],
    )?;

    // General voice channel
    conn.execute(
        "INSERT INTO channels (id, name, channel_type, category_id, position, created_at) \
         VALUES (?1, 'General', 'voice', ?2, 1000, ?3)",
        rusqlite::params![uuid::Uuid::now_v7().to_string(), voice_cat_id, now],
    )?;

    // Default @everyone role
    // SEND_MESSAGES (0x01) enabled by default
    conn.execute(
        "INSERT INTO roles (id, name, permissions, position, is_default, created_at, updated_at) \
         VALUES (?1, '@everyone', ?2, 0, 1, ?3, ?4)",
        rusqlite::params![uuid::Uuid::now_v7().to_string(), 0x01_i64, now, now],
    )?;

    Ok(())
}
```

### Pattern 5: Admin Permission Guard

**What:** Reusable function to check whether the calling user (identified by JWT Claims) has a specific permission. Reads from the database on each call (not from JWT claims) to reflect real-time role changes.

**When to use:** Every admin-facing REST endpoint.

```rust
/// Check if a user has the required permission.
/// Reads current roles from DB (not JWT) to reflect real-time changes.
/// Owner always passes. Returns Err(FORBIDDEN) on failure.
async fn require_permission(
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
        let mut stmt = conn.prepare(
            "SELECT r.permissions FROM roles r
             INNER JOIN user_roles ur ON ur.role_id = r.id
             WHERE ur.user_id = ?1
             UNION ALL
             SELECT r.permissions FROM roles r WHERE r.is_default = 1"
        ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let perms: Vec<u32> = stmt.query_map([&uid], |row| row.get(0))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .filter_map(|r| r.ok())
            .collect();

        let effective = compute_user_permissions(false, &perms);
        Ok::<bool, StatusCode>(effective.contains(required))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    if has_permission { Ok(()) } else { Err(StatusCode::FORBIDDEN) }
}
```

**Key design decision:** Permissions are computed from the database on each request, NOT from JWT claims. The JWT `is_admin` field from Phase 1 is used only as a hint for the owner bootstrap case; real permission checks go through `require_permission()`. This avoids the stale-JWT problem where role changes don't take effect until token refresh.

### Pattern 6: Ban Check (Lazy on Connection)

**What:** Check ban status on WebSocket connection and on REST endpoint auth. Use lazy evaluation -- check the bans table when the user connects or makes a request, not via a background polling task.

**When to use:** WebSocket upgrade handler (`ws_upgrade`) and any request that needs ban verification.

```rust
/// Check if a user is banned. Returns ban info if active ban exists.
/// Expired bans are cleaned up lazily on read.
pub fn check_ban(conn: &rusqlite::Connection, fingerprint: &str) -> Option<BanInfo> {
    let now = chrono::Utc::now().to_rfc3339();

    // Delete expired bans lazily
    conn.execute(
        "DELETE FROM bans WHERE fingerprint = ?1 AND expires_at IS NOT NULL AND expires_at < ?2",
        rusqlite::params![fingerprint, now],
    ).ok();

    // Check for active ban
    conn.query_row(
        "SELECT id, reason, expires_at FROM bans WHERE fingerprint = ?1",
        [fingerprint],
        |row| Ok(BanInfo {
            id: row.get(0)?,
            reason: row.get(1)?,
            expires_at: row.get(2)?,
        }),
    ).ok()
}
```

**Recommendation:** Lazy check on connection is sufficient. There is no need for a background task polling ban expiration. A temp-banned user who is not connected has no active session to close. When they reconnect after expiry, the lazy check clears the expired ban record.

### Pattern 7: Invite Code Generation

**What:** Generate URL-safe random invite codes.

**When to use:** Admin creates an invite.

```rust
use rand::Rng;

/// Generate a random invite code: 8 characters, alphanumeric (base62).
/// 62^8 = ~218 trillion combinations -- collision-resistant for single-server use.
fn generate_invite_code() -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::rng();
    (0..8)
        .map(|_| {
            let idx = rng.random_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}
```

**Note:** Uses `rand::rng()` (not `thread_rng()`) and `random_range()` (not `gen_range()`), matching the rand 0.9 API already used in the project.

### Pattern 8: Invite Landing Page (Embedded HTML)

**What:** Serve a simple HTML landing page at `/invite/{code}` showing server info and an "Open in UNITED" button.

**When to use:** When a user clicks an invite link in a browser.

```rust
use axum::response::Html;

/// GET /invite/{code} - Serve invite landing page
async fn invite_landing_page(
    Path(code): Path<String>,
    State(state): State<AppState>,
) -> Result<Html<String>, StatusCode> {
    // Validate invite exists and is not expired/exhausted
    let db = state.db.clone();
    let code_clone = code.clone();

    let (server_name, server_desc) = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Check invite is valid
        let now = chrono::Utc::now().to_rfc3339();
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM invites WHERE code = ?1 \
             AND (expires_at IS NULL OR expires_at > ?2) \
             AND (max_uses IS NULL OR use_count < max_uses)",
            rusqlite::params![code_clone, now],
            |row| row.get(0),
        ).unwrap_or(false);
        if !exists { return Err(StatusCode::NOT_FOUND); }

        let name = conn.query_row(
            "SELECT value FROM server_settings WHERE key = 'name'",
            [], |row| row.get::<_, String>(0),
        ).unwrap_or_else(|_| "UNITED Server".to_string());

        let desc = conn.query_row(
            "SELECT value FROM server_settings WHERE key = 'description'",
            [], |row| row.get::<_, String>(0),
        ).unwrap_or_default();

        Ok::<(String, String), StatusCode>((name, desc))
    }).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    Ok(Html(format!(r#"<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Join {name} on UNITED</title>
<style>
  body {{ margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#1e1f22; color:#fff; font-family:-apple-system,BlinkMacSystemFont,sans-serif; }}
  .card {{ text-align:center; padding:2rem; max-width:400px; }}
  h1 {{ margin:0 0 0.5rem; font-size:1.5rem; }}
  p {{ color:#b5bac1; font-size:0.9rem; margin:0.5rem 0; }}
  .btn {{ display:inline-block; margin-top:1.5rem; padding:0.75rem 2rem; background:#5865f2;
          color:#fff; text-decoration:none; border-radius:8px; font-weight:600; }}
  .btn:hover {{ background:#4752c4; }}
  .small {{ margin-top:1rem; font-size:0.75rem; color:#72767d; }}
  .small a {{ color:#5865f2; }}
</style>
</head><body>
<div class="card">
  <h1>{name}</h1>
  <p>{desc}</p>
  <a href="united://invite/{code}" class="btn">Open in UNITED</a>
  <p class="small">Don't have UNITED?
    <a href="https://github.com/llanx/UNITED/releases">Download here</a></p>
</div>
</body></html>"#,
        name = html_escape(&server_name),
        desc = html_escape(&server_desc),
        code = code,
    )))
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
        .replace('"', "&quot;").replace('\'', "&#39;")
}
```

**Recommendation:** Embed the HTML directly as a format string. No template engine or static file serving needed for a single page. The `united://invite/{code}` deep link enables the Electron app to handle invites via custom protocol handler.

### Pattern 9: SEC-12 Device Provisioning Protocol

**What:** QR-bootstrapped local device transfer. The existing device generates an ephemeral encryption key, embeds it with its local network address in a QR code, the new device scans the QR, connects directly over local TCP, and receives the encrypted keypair.

**Protocol flow:**
1. Existing device generates ephemeral X25519 keypair
2. Existing device starts a temporary TCP listener on a random port on the local network
3. QR code encodes JSON: `{ "ip": "192.168.1.x", "port": 12345, "pk": "<ephemeral X25519 public key hex>" }`
4. New device scans QR, generates its own ephemeral X25519 keypair
5. New device connects via TCP to the IP:port
6. New device sends its ephemeral X25519 public key (32 bytes)
7. Both sides compute shared secret via X25519 DH, derive key via HKDF-SHA256
8. Existing device sends: AES-256-GCM encrypted payload containing current Ed25519 private key + mnemonic words
9. New device decrypts, stores locally, confirms receipt with MAC
10. TCP listener and ephemeral keys are destroyed immediately

**Recommendation for LAN discovery:** Skip mDNS for v1. Encode the IP address and port directly in the QR code. This is simpler, more reliable (mDNS has firewall issues on Windows), and the devices must be physically co-located anyway (QR scanning requires camera distance). The client can use `os.networkInterfaces()` in Node.js to get the local IP.

**Key compatibility note:** x25519-dalek 2.x and ed25519-dalek 2.2 share the curve25519-dalek 4.x dependency. They are fully compatible and can coexist in the same project without version conflicts.

### Pattern 10: WebSocket Event Broadcasting

**What:** After any mutation (channel created, role assigned, user kicked, etc.), broadcast a protobuf-encoded event to all connected clients so their UI updates in real-time.

**When to use:** After every successful CRUD operation.

```rust
use prost::Message as ProstMessage;

/// Broadcast a protobuf envelope to all connected users.
fn broadcast_to_all(registry: &ConnectionRegistry, envelope: &Envelope) {
    let mut buf = Vec::with_capacity(envelope.encoded_len());
    if envelope.encode(&mut buf).is_err() {
        return;
    }
    let msg = axum::extract::ws::Message::Binary(buf.into());

    for entry in registry.iter() {
        for sender in entry.value().iter() {
            let _ = sender.send(msg.clone());
        }
    }
}

/// Send to a specific user (all their connections).
fn send_to_user(registry: &ConnectionRegistry, user_id: &str, envelope: &Envelope) {
    let mut buf = Vec::with_capacity(envelope.encoded_len());
    if envelope.encode(&mut buf).is_err() {
        return;
    }
    let msg = axum::extract::ws::Message::Binary(buf.into());

    if let Some(connections) = registry.get(user_id) {
        for sender in connections.value().iter() {
            let _ = sender.send(msg.clone());
        }
    }
}

/// Force-close all connections for a user (kick/ban).
fn force_close_user(
    registry: &ConnectionRegistry,
    user_id: &str,
    close_code: u16,
    reason: &str,
) {
    if let Some(connections) = registry.get(user_id) {
        let close_frame = axum::extract::ws::CloseFrame {
            code: close_code,
            reason: reason.into(),
        };
        for sender in connections.value().iter() {
            let _ = sender.send(axum::extract::ws::Message::Close(Some(close_frame.clone())));
        }
    }
}
```

### Pattern 11: Custom Protocol Handler for Invite Deep Links

**What:** Register `united://` as a custom protocol in Electron so clicking "Open in UNITED" on the invite landing page launches the app.

**When to use:** Electron main process startup.

```typescript
// In main/index.ts, before app.whenReady():
import { app, protocol } from 'electron'

// Register scheme before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'united', privileges: { standard: true, secure: true } }
])

// After app is ready:
app.setAsDefaultProtocolClient('united')

// Handle the deep link (Windows/Linux: second-instance event)
app.on('second-instance', (_event, argv) => {
  const url = argv.find(arg => arg.startsWith('united://'))
  if (url) handleDeepLink(url)
})

// Handle the deep link (macOS: open-url event)
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

function handleDeepLink(url: string) {
  // Parse: united://invite/{code}
  const parsed = new URL(url)
  if (parsed.host === 'invite') {
    const code = parsed.pathname.replace(/^\//, '')
    // Navigate to join flow with invite code pre-filled
  }
}
```

**Note:** Custom protocol registration works differently across platforms. On Windows it works at runtime; on macOS/Linux it requires packaging. This should work for development on Windows (the project's primary dev platform) and will need packaging config for distribution.

### Anti-Patterns to Avoid
- **Storing permissions as JSON arrays:** Use integer bitfields. JSON arrays require parsing, can't be OR'd efficiently, and waste storage.
- **Eager ban expiration cleanup:** Don't run a background task to poll bans. Lazy cleanup on read is sufficient and simpler.
- **Sending full channel list on every mutation:** Send targeted delta events over WebSocket (channel_created, channel_renamed, channel_deleted). The client maintains its own state.
- **Position integers starting at 0 with increment 1:** Causes cascading updates on every insert. Use gap strategy (start at 1000, increment 1000).
- **Re-implementing auth checks per endpoint:** Use the `require_permission()` helper with the existing Claims extractor. Don't duplicate JWT validation logic.
- **Reading permissions from JWT claims:** JWT is issued at login time and goes stale when roles change. Always read current permissions from the database via `require_permission()`.
- **Modifying Migration 1:** Never change existing migrations. Append Migration 2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Permission bit manipulation | Manual bit shifting and masking | `bitflags` crate | Type safety, Debug impl, named flags, `contains()`, serde support |
| Invite code randomness | Custom random string with `rand::distributions` | Simple loop over charset using `rand::rng().random_range()` | Simple enough to inline; the rand 0.9 API is already established in the project |
| Schema migrations | Manual SQL file loading or ALTER TABLE sequences | `rusqlite_migration` (already used) | Atomic application, version tracking via user_version, guards against re-execution |
| Timestamp comparison | Manual string parsing | `chrono::DateTime<Utc>` comparison | Already in project, handles ISO 8601 properly, timezone-aware |
| QR code encoding | Manual QR matrix generation | `qrcode` crate (server/Rust) or `qrcode.react` (client) | QR encoding is complex (Reed-Solomon error correction, version selection, masking) |
| X25519 key exchange | Manual ECDH implementation | `x25519-dalek` crate | Audited, compatible with existing ed25519-dalek, constant-time operations |
| HTML escaping | Manual string replacement | Simple helper function (5 replacements) | No need for a full template engine; the landing page is a single string |

**Key insight:** Phase 2 is mostly CRUD with permission checks. The complexity is in getting the schema right and ensuring real-time WebSocket pushes keep all connected clients in sync. Don't over-engineer the permission system -- 5 flags in a u32 is trivial with bitflags.

## Common Pitfalls

### Pitfall 1: Migration 2 Must Be Additive Only
**What goes wrong:** Modifying Migration 1 SQL breaks existing databases (rusqlite_migration compares migration content hash).
**Why it happens:** Developer tries to ALTER TABLE in Migration 1 instead of adding Migration 2.
**How to avoid:** Never modify existing migrations. Always append a new `M::up()` entry. Migration 2 can CREATE TABLE freely but must not modify Migration 1's SQL text.
**Warning signs:** Migration panic on server startup: "migration already applied but content differs."

### Pitfall 2: Foreign Key Cascade on User Deletion (Kick)
**What goes wrong:** Kick deletes the user row, cascading to delete role assignments, future messages, etc.
**Why it happens:** Using ON DELETE CASCADE on foreign keys referencing `users.id`, or deleting the user row on kick.
**How to avoid:** Kick should NOT delete the user row. Close their WebSocket connections (force-close with code 4004 for "kicked"), remove non-default role assignments. The user retains their identity on the server and can reconnect with a valid invite. This preserves message attribution for Phase 4.
**Warning signs:** User data disappears after kick; user can't rejoin because fingerprint "already registered" but all their data is gone.

### Pitfall 3: Position Integer Overflow/Collision
**What goes wrong:** Repeated reorders without renormalization cause position integers to collide (e.g., trying to insert between position 5 and 6).
**Why it happens:** Gap between adjacent positions shrinks to 0 or 1 after many reorders.
**How to avoid:** Use large initial gaps (1000). Detect when `position_between()` returns a value equal to one of its inputs, and trigger renormalization of the entire list within that category.
**Warning signs:** Channels appear in wrong order after many reorders; identical position values in database.

### Pitfall 4: Race Condition on Invite Use Count
**What goes wrong:** Two concurrent registrations both read use_count=9 (max_uses=10), both increment to 10, invite used 11 times.
**Why it happens:** Read-then-write without atomicity.
**How to avoid:** Use atomic SQL: `UPDATE invites SET use_count = use_count + 1 WHERE code = ?1 AND (max_uses IS NULL OR use_count < max_uses)`. Check rows affected -- if 0, invite is exhausted. SQLite's single-writer lock naturally serializes concurrent writes, but the pattern should be correct regardless.
**Warning signs:** `invite.use_count` exceeds `invite.max_uses`.

### Pitfall 5: Starter Template Double-Seeding
**What goes wrong:** Starter template channels created twice -- once during migration, once during owner setup.
**Why it happens:** Seed logic runs in both migration SQL and application code.
**How to avoid:** Seed the starter template in application code only (triggered after owner registration), NOT in the migration SQL. The migration only creates empty tables. Guard with `SELECT COUNT(*) FROM categories` before seeding.
**Warning signs:** Duplicate "General" categories or "#general" channels.

### Pitfall 6: Ban Check Timing on WebSocket
**What goes wrong:** Banned user maintains existing WebSocket connection after ban is applied.
**Why it happens:** Ban is stored in DB but existing WS connections aren't terminated.
**How to avoid:** After inserting a ban record, immediately look up the banned user's connections in the ConnectionRegistry and send a Close frame with code 4003 and the ban reason. The ban check on WS connect prevents new connections; force-closing existing ones prevents continued access.
**Warning signs:** Banned user can still send/receive messages until they manually reconnect.

### Pitfall 7: JWT Claims Don't Reflect Role Changes
**What goes wrong:** User's JWT still says `is_admin: false` after being assigned an admin role. Permission checks based on JWT claims fail.
**Why it happens:** JWTs are stateless; they were issued before the role change and don't update until refresh.
**How to avoid:** Compute permissions from the database on each request via `require_permission()`, not from JWT claims. The JWT proves identity (user_id, fingerprint, is_owner); the database provides current permissions. The Phase 1 `is_admin` JWT claim becomes a legacy hint, not the source of truth.
**Warning signs:** Permission checks fail immediately after role assignment; work only after manual token refresh.

### Pitfall 8: @everyone Role Not Included in Permission Computation
**What goes wrong:** A user with no explicitly assigned roles has zero permissions, even though @everyone should grant `SEND_MESSAGES`.
**Why it happens:** The permission query only joins `user_roles` but forgets to include the default role.
**How to avoid:** The `require_permission()` query uses `UNION ALL` to include both explicitly assigned roles (`user_roles` join) AND default roles (`WHERE r.is_default = 1`). See Pattern 5 above.
**Warning signs:** New users can't send messages despite @everyone having `SEND_MESSAGES` enabled.

### Pitfall 9: Invite Registration Without Ban Check
**What goes wrong:** A banned user creates a new keypair and joins via an invite link, bypassing the ban.
**Why it happens:** Ban check uses fingerprint, but banned user generates a new identity with a different fingerprint.
**How to avoid:** This is a fundamental limitation of keypair-based identity -- a determined user can always create a new identity. The ban prevents the SAME identity from rejoining. For Phase 2, this is acceptable. IP-based bans or more sophisticated identity linking are out of scope. Document this as a known limitation.
**Warning signs:** None visible in logs (it looks like a legitimate new user registration).

### Pitfall 10: Protobuf Envelope Field Number Collisions
**What goes wrong:** New payload variants in `ws.proto` use field numbers already taken by Phase 1 payloads.
**Why it happens:** Developer doesn't check existing field numbers before adding new ones.
**How to avoid:** Phase 1 uses field numbers 10-43 and 99. Reserve contiguous blocks: channels (50-59), roles (60-69), moderation (70-79), invites (80-89). Document the allocation in a comment.
**Warning signs:** Protobuf decode errors; wrong message type dispatched.

## Code Examples

### Example 1: Channel CRUD Endpoint

```rust
/// POST /api/channels - Create a new channel
async fn create_channel(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<CreateChannelRequest>,
) -> Result<Json<ChannelResponse>, (StatusCode, String)> {
    // Permission check: requires manage_channels or admin
    require_permission(
        &state.db, &claims.sub, claims.is_owner,
        Permissions::MANAGE_CHANNELS,
    ).await.map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let channel = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        // Verify category exists
        let cat_exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM categories WHERE id = ?1",
            [&req.category_id], |row| row.get(0),
        ).unwrap_or(false);
        if !cat_exists {
            return Err((StatusCode::BAD_REQUEST, "Category not found".to_string()));
        }

        // Get next position in category (append to end)
        let max_pos: i64 = conn.query_row(
            "SELECT COALESCE(MAX(position), 0) FROM channels WHERE category_id = ?1",
            [&req.category_id], |row| row.get(0),
        ).unwrap_or(0);

        let id = uuid::Uuid::now_v7().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let position = max_pos + 1000;

        conn.execute(
            "INSERT INTO channels (id, name, channel_type, category_id, position, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![id, req.name, req.channel_type, req.category_id, position, now],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        Ok(ChannelResponse { id, name: req.name, channel_type: req.channel_type,
                             category_id: req.category_id, position })
    }).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))??;

    // Broadcast channel_created event to all connected clients via WS
    broadcast_to_all(&state.connections, &make_channel_created_envelope(&channel));

    Ok(Json(channel))
}
```

### Example 2: Atomic Invite Consumption

```rust
/// Atomically consume an invite code during registration.
/// Returns Ok(()) if invite was valid and consumed, Err if expired/exhausted/invalid.
fn consume_invite(conn: &rusqlite::Connection, code: &str) -> Result<(), (StatusCode, String)> {
    let now = chrono::Utc::now().to_rfc3339();

    let rows_affected = conn.execute(
        "UPDATE invites SET use_count = use_count + 1 \
         WHERE code = ?1 \
         AND (expires_at IS NULL OR expires_at > ?2) \
         AND (max_uses IS NULL OR use_count < max_uses)",
        rusqlite::params![code, now],
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if rows_affected == 0 {
        return Err((StatusCode::BAD_REQUEST, "Invalid, expired, or exhausted invite code".to_string()));
    }

    Ok(())
}
```

### Example 3: Ban with Force-Close

```rust
/// POST /api/moderation/ban - Ban a user
async fn ban_user(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<BanRequest>,
) -> Result<Json<BanResponse>, (StatusCode, String)> {
    require_permission(
        &state.db, &claims.sub, claims.is_owner,
        Permissions::BAN_MEMBERS,
    ).await.map_err(|s| (s, "Insufficient permissions".to_string()))?;

    let db = state.db.clone();
    let ban = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        // Look up the target user
        let (target_user_id, target_fingerprint): (String, String) = conn.query_row(
            "SELECT id, fingerprint FROM users WHERE id = ?1",
            [&req.user_id], |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| (StatusCode::NOT_FOUND, "User not found".to_string()))?;

        // Cannot ban the owner
        let is_target_owner: bool = conn.query_row(
            "SELECT is_owner FROM users WHERE id = ?1",
            [&req.user_id], |row| row.get(0),
        ).unwrap_or(false);
        if is_target_owner {
            return Err((StatusCode::FORBIDDEN, "Cannot ban the server owner".to_string()));
        }

        let id = uuid::Uuid::now_v7().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT OR REPLACE INTO bans (id, fingerprint, banned_by, reason, expires_at, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![id, target_fingerprint, claims.sub, req.reason, req.expires_at, now],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        Ok((target_user_id, target_fingerprint, id))
    }).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))??;

    let (target_user_id, _fingerprint, ban_id) = ban;

    // Force-close all WebSocket connections for the banned user
    let reason = req.reason.as_deref().unwrap_or("You have been banned from this server");
    force_close_user(&state.connections, &target_user_id, 4003, reason);

    Ok(Json(BanResponse { ban_id }))
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON permission arrays in DB | Integer bitfields with bitflags | Industry standard since Discord (2015) | O(1) permission checks, compact storage, 53-bit integer in Discord |
| Sequential position integers | Gap-based position integers | Trello/Figma pattern (~2018) | Reduces write amplification on reorder from O(n) to O(1) |
| Polling for ban expiration | Lazy expiration check on access | Common in session management | Eliminates unnecessary background work |
| Full state sync on mutations | Delta events over WebSocket | Discord/Slack real-time pattern | Bandwidth efficient, supports incremental client state |
| Permissions in JWT claims | Permissions computed from DB on each request | Modern RBAC best practice | Avoids stale-JWT problem when roles change |

**Deprecated/outdated in this codebase:**
- Phase 1's `ROLE_ADMIN: i64 = 1` constant in `db/models.rs` will be superseded by the `bitflags` Permissions type. The existing `roles` integer column on the `users` table is Phase 1's simple admin flag. Phase 2 introduces proper roles via the `roles` + `user_roles` tables. The `users.roles` column and `ROLE_ADMIN` constant should be kept for backward compatibility (owner bootstrap) but NOT used for Phase 2+ permission checks.

## Open Questions

1. **Should the Phase 1 `users.roles` column be migrated or deprecated?**
   - What we know: Phase 1 uses `users.roles INTEGER` with `ROLE_ADMIN = 1` for the simple owner/admin flag. Phase 2 introduces proper roles via `roles` and `user_roles` tables.
   - What's unclear: Whether to keep `users.roles` for the owner flag or migrate it into the new roles system.
   - Recommendation: Keep `users.roles` and `users.is_owner` as-is for Phase 1 compatibility. The new permission system reads from `user_roles` + `roles` tables. The owner check remains `users.is_owner = true`. No migration needed -- the Phase 1 column becomes legacy but harmless. The `is_admin` JWT claim continues to be set based on `users.is_owner` for backward compatibility.

2. **Kick behavior: keep user record or soft-remove?**
   - What we know: Context says "kicked user can rejoin immediately with a valid invite." The `users` table has the fingerprint used for auth.
   - What's unclear: Whether to preserve or remove role assignments on kick.
   - Recommendation: Do NOT delete the user row on kick. Force-close their WebSocket connections with close code 4004 ("kicked"). Remove their explicitly assigned roles (but they retain @everyone on rejoin). The user retains their identity on the server and can reconnect with a valid invite (or freely if server is open). This avoids re-registration friction and preserves message attribution for Phase 4.

3. **P2P peer discovery bootstrapping (SRVR-09 partial)**
   - What we know: SRVR-09 says "bootstraps P2P peer discovery and begins content replication." P2P is Phase 3.
   - What's unclear: How much of SRVR-09 to implement in Phase 2.
   - Recommendation: Phase 2 handles invite validation and server join (user record creation, @everyone role assignment, starter template visibility). P2P bootstrap is deferred to Phase 3. SRVR-09 is partially fulfilled in Phase 2 (join via invite) and completed in Phase 3 (P2P discovery).

4. **Custom protocol handler (`united://`) for invite deep links**
   - What we know: Invite landing page links to `united://invite/{code}`. Electron supports custom protocol registration.
   - What's unclear: Whether Electron custom protocol registration is in scope for Phase 2 or should be a separate concern.
   - Recommendation: Register the `united://` custom protocol handler in the Electron main process as part of Phase 2 client work. It's minimal code (`protocol.registerSchemesAsPrivileged` + `app.setAsDefaultProtocolClient` + `second-instance` / `open-url` event handlers). Required for invite links to actually work end-to-end.

5. **SEC-12: Rust or Node.js for the provisioning TCP listener?**
   - What we know: The device provisioning protocol requires a temporary TCP listener, X25519 key exchange, and AES-256-GCM encryption. The client is an Electron app with a Node.js main process.
   - What's unclear: Whether to implement the TCP listener in Node.js (using net module) or as a Rust native module.
   - Recommendation: Use Node.js `net` module for the TCP listener and `crypto` module for HKDF + AES-256-GCM. Node.js's built-in crypto supports X25519 (`crypto.diffieHellman` with `x25519` curve), HKDF, and AES-256-GCM natively. No need for a Rust native module or x25519-dalek on the client side. The QR code is rendered using the already-present qrcode.react library. This keeps the implementation purely in the Electron main process without additional native dependencies.

## Sources

### Primary (HIGH confidence)
- **Existing codebase** (`server/src/`, `client/src/`, `shared/`) -- Analyzed all Phase 1 source files for extension points, schema, routes, state, IPC bridge, stores
- **rusqlite_migration** (https://docs.rs/rusqlite_migration/2.4.0) -- Migration append pattern, `user_version` tracking, `M::up()` API
- **bitflags crate** (https://crates.io/crates/bitflags v2.11) -- API, `from_bits_truncate`, `contains`, `all()`, serde feature
- **Discord developer docs** (https://discord.com/developers/docs/topics/permissions) -- Permission bitflag model, union resolution, ADMINISTRATOR implies all, 53-bit integer
- **rand crate 0.9 migration guide** (https://rust-random.github.io/book/update-0.9.html) -- `gen_range` renamed to `random_range`, `thread_rng()` renamed to `rng()`
- **Electron protocol docs** (https://www.electronjs.org/docs/latest/api/protocol) -- `registerSchemesAsPrivileged`, `protocol.handle`, deep linking tutorial

### Secondary (MEDIUM confidence)
- **x25519-dalek crate** (https://docs.rs/x25519-dalek) -- EphemeralSecret API, compatibility with ed25519-dalek via shared curve25519-dalek 4.x
- **tower-http ServeDir** (https://docs.rs/tower-http/latest/tower_http/services/struct.ServeDir.html) -- Verified "fs" feature usage, decided against for single-page landing
- **SQLite ordering patterns** (https://sqlite.org/forum/info/c4943eab84d63733) -- Position gap strategy, renormalization approaches
- **mdns-sd crate** (https://crates.io/crates/mdns-sd v0.13.11) -- LAN service discovery option, decided against for v1 simplicity

### Tertiary (LOW confidence)
- **SEC-12 protocol design** -- No existing implementation found for UNITED's specific local-only QR+X25519+AES-GCM+TCP pattern. The protocol design is synthesized from Signal's device linking approach adapted for UNITED's no-server-involvement constraint. Needs validation during implementation, particularly around: (a) Node.js `crypto.diffieHellman` X25519 support at runtime, (b) QR code payload size for JSON with hex-encoded 32-byte pubkey + IP + port.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All core libraries already in project; bitflags is well-established (2.11, actively maintained)
- Architecture: HIGH -- Extends established Phase 1 patterns (axum handlers, spawn_blocking, rusqlite, protobuf envelope, DashMap registry)
- Schema design: HIGH -- Standard relational patterns for RBAC; flat categories, junction tables, indexed foreign keys
- Permission model: HIGH -- Discord's bitflag approach is battle-tested; adapted for simpler 5-permission set with union resolution
- SEC-12 provisioning: MEDIUM -- Protocol design is sound but novel combination; Node.js X25519 support needs runtime validation
- Pitfalls: HIGH -- Based on direct codebase analysis, Phase 1 implementation patterns, and common Discord-clone architecture patterns

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days -- stable domain, no fast-moving dependencies)
