# Phase 2: Server Management - Research

**Researched:** 2026-02-24
**Domain:** Server-side CRUD for channels/categories/roles/permissions/bans/invites + SEC-12 device provisioning
**Confidence:** HIGH

## Summary

Phase 2 extends the Phase 1 foundation (auth, identity, WebSocket, server settings) with full server management capabilities. The core challenge is a well-structured SQLite schema extension (new migration on top of Migration 1), a permission system using bitwise flags with union resolution, and REST+WS API endpoints for admin operations. The existing patterns from Phase 1 -- axum route handlers, JWT Claims extractor, protobuf envelope dispatch, and rusqlite_migration -- all extend naturally.

The SEC-12 device provisioning requirement (QR-bootstrapped local key transfer) is architecturally distinct from the server management CRUD and should be planned as its own work stream. It requires QR code generation/scanning, ephemeral encryption, and local network connectivity -- none of which interact with the channel/role/invite systems.

**Primary recommendation:** Build the schema migration first (channels, categories, roles, user_roles, bans, invites tables), then layer REST endpoints for each domain using the existing axum pattern, then extend the WebSocket protobuf envelope with real-time push events (channel/role/member updates), and finally implement SEC-12 as a standalone module.

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
| SRVR-01 | Server admin can create, rename, and delete text and voice channels | SQLite schema (channels table with type column), REST endpoints, protobuf messages, position integer ordering |
| SRVR-02 | Server admin can organize channels into categories | SQLite schema (categories table), category_id FK on channels, position integers for both |
| SRVR-03 | Server admin can create and configure roles with specific permissions (send messages, manage channels, kick/ban, admin) | bitflags permission model (u32 bitfield), roles table, REST endpoints |
| SRVR-04 | Server admin can assign roles to users | user_roles junction table, REST endpoint, WS push for role changes |
| SRVR-05 | Server admin can kick users from the server | Kick endpoint removes user record but allows rejoin; WS close code 4003 variant or 4004 |
| SRVR-06 | Server admin can ban users from the server (propagated to peers to stop relaying banned user's content) | bans table with fingerprint, expiration, reason; ban check on WS connect and REST auth; 4003 close code |
| SRVR-08 | Server admin can generate invite links with optional expiration | invites table with code, expiration, max_uses, use_count; REST endpoint; landing page serving |
| SRVR-09 | New user can join a server via invite link, which bootstraps P2P peer discovery and begins content replication | Invite validation on registration, use_count increment; P2P bootstrap deferred to Phase 3 |
| SEC-12 | User can provision a new device by scanning a QR code from an existing device (direct encrypted key transfer, no server involvement) | QR code generation (qrcode crate or qrcode.react), ephemeral X25519 key exchange, AES-256-GCM encrypted transfer over local TCP, mDNS/manual IP discovery |
</phase_requirements>

## Standard Stack

### Core (already in project, extends naturally)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axum | 0.8 | HTTP server, REST endpoints | Already used in Phase 1; add new route groups |
| rusqlite | 0.38 | SQLite database | Already used; add Migration 2 |
| rusqlite_migration | 2.4 | Schema version tracking | Already used; append M::up() to migrations vec |
| prost | 0.14 | Protobuf encoding | Already used; extend .proto files with new messages |
| jsonwebtoken | 10.3 | JWT auth | Already used; Claims extractor for admin checks |
| dashmap | 6 | Connection registry | Already used; extend for channel subscriptions |
| chrono | 0.4 | Timestamps, ban expiration | Already used; expiration comparison |
| uuid | 1 (v7) | Record IDs | Already used; all new records use UUIDv7 |
| tower-http | 0.6 | Static file serving | Already in Cargo.toml; add `fs` feature for invite landing page |

### New Dependencies (Server)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bitflags | 2.11 | Permission bitfield type safety | Define Permissions struct with named flags |
| rand (already present) | 0.9 | Invite code generation | Generate random alphanumeric invite codes |

### New Dependencies (Client - SEC-12 only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| qrcode.react | (already present) | QR code rendering | Display QR for device provisioning |
| mdns-sd | 0.13 | mDNS local service discovery | Advertise/discover provisioning service on LAN |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bitflags crate | Raw integer constants (existing ROLE_ADMIN pattern) | bitflags provides type safety, Debug formatting, and named flags; raw integers work but are error-prone as permission count grows |
| mdns-sd for LAN discovery | Manual IP entry / BLE | mDNS is zero-config and works cross-platform; manual IP is simpler but worse UX; BLE requires native plugins |
| Separate invites table | Encode invite data in signed JWT | DB table allows use_count tracking, revocation, and admin listing; JWT invites are stateless but can't be revoked or counted |

### Installation

Server (add to Cargo.toml):
```toml
bitflags = "2.11"
```

tower-http already present; add `"fs"` to features:
```toml
tower-http = { version = "0.6", features = ["cors", "trace", "fs"] }
```

## Architecture Patterns

### Recommended Project Structure Additions

```
server/src/
  channels/
    mod.rs          # pub mod for channels module
    crud.rs         # Create, rename, delete channels and categories
    ordering.rs     # Position reorder logic
  roles/
    mod.rs          # pub mod for roles module
    crud.rs         # Create, update, delete roles
    permissions.rs  # Permissions bitflags definition and resolution
    assignment.rs   # Assign/remove roles to/from users
  moderation/
    mod.rs          # pub mod
    kick.rs         # Kick endpoint
    ban.rs          # Ban/unban endpoints and ban check middleware
  invite/
    mod.rs          # pub mod
    generate.rs     # Create invite with expiration + use count
    validate.rs     # Validate and consume invite codes
    landing.rs      # Serve invite landing page HTML
  provisioning/     # SEC-12 (may live in client main process instead)
    mod.rs
    qr.rs           # QR code content generation
    transfer.rs     # Local network encrypted key transfer

shared/proto/
  channels.proto    # Channel/category messages
  roles.proto       # Role/permission messages
  moderation.proto  # Kick/ban messages
  invite.proto      # Invite messages
  (ws.proto updated with new Envelope payload variants)
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
/// Otherwise, OR together permissions from all assigned roles.
pub fn compute_user_permissions(
    is_owner: bool,
    role_permissions: &[u32], // permission bits from each role
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
/// Returns the midpoint. If midpoint == before, renormalize the entire list.
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

**Source:** Common pattern in Trello, Notion, Discord for drag-and-drop ordering. Gap of 1000 allows ~1000 reorders before renormalization.

### Pattern 3: Schema Migration Extension

**What:** Append a new `M::up()` to the existing migrations vector. rusqlite_migration tracks applied migrations via SQLite `user_version` pragma.

**When to use:** Adding new tables for channels, categories, roles, bans, invites.

```rust
pub fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up("-- Migration 1: Initial schema (Phase 1)
            ...existing migration 1 SQL...
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

**Key:** Migration 1 is never modified. Migration 2 is appended. rusqlite_migration applies only unapplied migrations based on `user_version`.

### Pattern 4: Starter Template Seeding

**What:** On first server boot (after setup token consumed), seed default categories and channels.

**When to use:** After owner registration completes (or on first boot if migration adds defaults).

```rust
/// Seed the starter template: General category (#general, #introductions)
/// + Voice category (one voice channel).
fn seed_starter_template(conn: &rusqlite::Connection) -> Result<(), rusqlite::Error> {
    let now = chrono::Utc::now().to_rfc3339();

    // General category
    let general_cat_id = uuid::Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO categories (id, name, position, created_at) VALUES (?1, 'General', 1000, ?2)",
        rusqlite::params![general_cat_id, now],
    )?;

    // #general channel
    conn.execute(
        "INSERT INTO channels (id, name, channel_type, category_id, position, created_at) VALUES (?1, 'general', 'text', ?2, 1000, ?3)",
        rusqlite::params![uuid::Uuid::now_v7().to_string(), general_cat_id, now],
    )?;

    // #introductions channel
    conn.execute(
        "INSERT INTO channels (id, name, channel_type, category_id, position, created_at) VALUES (?1, 'introductions', 'text', ?2, 2000, ?3)",
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
        "INSERT INTO channels (id, name, channel_type, category_id, position, created_at) VALUES (?1, 'General', 'voice', ?2, 1000, ?3)",
        rusqlite::params![uuid::Uuid::now_v7().to_string(), voice_cat_id, now],
    )?;

    // Default @everyone role (all users auto-assigned)
    conn.execute(
        "INSERT INTO roles (id, name, permissions, position, is_default, created_at, updated_at) VALUES (?1, '@everyone', ?2, 0, 1, ?3, ?4)",
        rusqlite::params![uuid::Uuid::now_v7().to_string(), 0x01 /* SEND_MESSAGES */, now, now],
    )?;

    Ok(())
}
```

### Pattern 5: Ban Check Middleware (Lazy on Connection)

**What:** Check ban status on WebSocket connection and on REST endpoint auth. Use lazy evaluation -- check the bans table when the user connects or makes a request, not via a background polling task.

**When to use:** WebSocket upgrade handler and JWT Claims extractor.

```rust
/// Check if a user is banned. Returns ban info if active ban exists.
/// Lazy check: expired bans are cleaned up on read.
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

**Recommendation:** Lazy check on connection is simpler and sufficient. There is no need for a background task polling ban expiration -- a user who is temp-banned but not connected has no active session to close. When they reconnect after expiry, the lazy check clears the expired ban.

### Pattern 6: Invite Code Generation

**What:** Generate URL-safe random invite codes.

**When to use:** Admin creates an invite.

```rust
use rand::Rng;

/// Generate a random invite code: 8 characters, alphanumeric (base62).
/// 62^8 = ~218 trillion combinations -- sufficient for single-server use.
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

**Recommendation:** 8-character alphanumeric codes. URL-safe, easy to read/type, collision-resistant for single-server use.

### Pattern 7: Invite Landing Page (Embedded HTML)

**What:** Serve a simple HTML landing page at `/invite/{code}` showing server info and an "Open in UNITED" button.

**When to use:** When a user clicks an invite link in a browser.

```rust
use axum::response::Html;

/// GET /invite/{code} - Serve invite landing page
async fn invite_landing_page(
    Path(code): Path<String>,
    State(state): State<AppState>,
) -> Result<Html<String>, StatusCode> {
    // Validate invite exists and is not expired
    let invite = validate_invite(&state.db, &code)?;

    // Get server info
    let server_name = get_server_name(&state.db);

    // Return embedded HTML (no external dependencies)
    Ok(Html(format!(r#"<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Join {name} on UNITED</title>
<style>/* minimal dark theme styles */</style>
</head><body>
<div class="card">
  <h1>{name}</h1>
  <p>{desc}</p>
  <a href="united://invite/{code}" class="btn">Open in UNITED</a>
  <p class="small">Don't have UNITED? <a href="https://github.com/llanx/UNITED/releases">Download here</a></p>
</div>
</body></html>"#,
        name = server_name,
        desc = invite.description,
        code = code,
    )))
}
```

**Recommendation:** Embed the HTML directly as a format string in the Rust handler. No need for tower-http static file serving or template engine for a single simple page. The `united://invite/{code}` deep link enables the Electron app to handle the invite via custom protocol handler.

### Pattern 8: SEC-12 Device Provisioning Protocol

**What:** QR-bootstrapped local device transfer. The existing device generates an ephemeral encryption key, embeds it with its local network address in a QR code, the new device scans the QR, connects directly over local TCP, and receives the encrypted keypair.

**Protocol flow:**
1. Existing device generates ephemeral X25519 keypair
2. Existing device starts a temporary TCP listener on a random port
3. QR code encodes: `{ "ip": "192.168.1.x", "port": 12345, "pubkey": "<ephemeral X25519 public key hex>" }`
4. New device scans QR, performs X25519 key exchange using its own ephemeral keypair
5. Shared secret derived via HKDF-SHA256
6. Existing device sends: AES-256-GCM encrypted payload containing current Ed25519 keypair + mnemonic + passphrase-encrypted private key blob
7. New device decrypts, stores locally, confirms receipt
8. TCP listener and ephemeral keys are destroyed

**Recommendation for LAN discovery:** Skip mDNS for v1. Encode the IP address and port directly in the QR code. This is simpler, more reliable (mDNS has firewall issues), and the devices must be physically co-located anyway (QR scanning distance). mDNS can be added as an enhancement if users want wireless-only pairing without QR.

### Anti-Patterns to Avoid
- **Storing permissions as JSON arrays:** Use integer bitfields. JSON arrays require parsing, can't be OR'd efficiently, and waste storage.
- **Eager ban expiration cleanup:** Don't run a background task to poll bans. Lazy cleanup on read is sufficient and simpler.
- **Sending full channel list on every mutation:** Send targeted delta events over WebSocket (channel_created, channel_renamed, channel_deleted). The client maintains its own state.
- **Position integers starting at 0 with increment 1:** Causes cascading updates on every insert. Use gap strategy (start at 1000, increment 1000).
- **Re-implementing auth checks per endpoint:** Use the existing Claims extractor with a permissions helper. Don't duplicate JWT validation logic.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Permission bit manipulation | Manual bit shifting and masking | `bitflags` crate | Type safety, Debug impl, named flags, iterator support, serde integration |
| Invite code randomness | Custom random string with `rand::distributions` | Simple loop over charset (Pattern 6 above) | Simple enough to inline, but use `rand::rng()` not thread_rng() (same as Phase 1 pattern) |
| Schema migrations | Manual SQL file loading | `rusqlite_migration` (already used) | Atomic application, version tracking via user_version, rollback support |
| Timestamp comparison | Manual string parsing | `chrono::DateTime<Utc>` comparison | Already in project, handles ISO 8601 properly |
| QR code encoding | Manual QR matrix generation | `qrcode` crate (server) / `qrcode.react` (client) | QR encoding is complex (Reed-Solomon error correction, version selection) |

**Key insight:** Phase 2 is mostly CRUD with permission checks. The complexity is in getting the schema right and ensuring real-time WebSocket pushes keep all connected clients in sync. Don't over-engineer the permission system -- 5 flags in a u32 is trivial with bitflags.

## Common Pitfalls

### Pitfall 1: Migration 2 Must Be Additive Only
**What goes wrong:** Modifying Migration 1 SQL breaks existing databases (rusqlite_migration compares migration content hash).
**Why it happens:** Developer tries to ALTER TABLE in Migration 1 instead of adding Migration 2.
**How to avoid:** Never modify existing migrations. Always append a new M::up() entry. Migration 2 can ALTER TABLE or CREATE TABLE, but it runs as a separate migration.
**Warning signs:** Migration panic on server startup with "migration already applied but content differs."

### Pitfall 2: Foreign Key Cascade on User Deletion (Kick)
**What goes wrong:** Kick deletes the user row, cascading to delete their messages, roles, etc.
**Why it happens:** Using ON DELETE CASCADE on foreign keys referencing users.id.
**How to avoid:** Kick should NOT delete the user row in Phase 2 (messages don't exist yet). Instead, either: (a) remove user from user_roles and close their WS connection, or (b) add a `kicked` flag. For Phase 2, closing the WS connection and removing role assignments is sufficient -- the user can re-register with the same fingerprint on rejoin.
**Warning signs:** User data disappears after kick; user can't rejoin because fingerprint is "already registered" with deleted foreign key references.

### Pitfall 3: Position Integer Overflow/Collision
**What goes wrong:** Repeated reorders without renormalization cause position integers to collide (e.g., trying to insert between position 5 and 6).
**Why it happens:** Gap between adjacent positions shrinks to 0 or 1.
**How to avoid:** Use large initial gaps (1000). Detect when `position_between()` returns a value equal to one of its inputs, and trigger renormalization of the entire list.
**Warning signs:** Channels appear in wrong order after many reorders; identical position values in database.

### Pitfall 4: Race Condition on Invite Use Count
**What goes wrong:** Two concurrent registrations both read use_count=9 (max_uses=10), both increment to 10, invite is used 11 times.
**Why it happens:** Read-then-write without atomicity.
**How to avoid:** Use atomic SQL: `UPDATE invites SET use_count = use_count + 1 WHERE code = ?1 AND (max_uses IS NULL OR use_count < max_uses) RETURNING use_count`. If RETURNING yields no rows, invite is exhausted. SQLite's single-writer lock naturally serializes this, but the pattern should be correct anyway.
**Warning signs:** Invite use_count exceeds max_uses.

### Pitfall 5: Starter Template Double-Seeding
**What goes wrong:** Starter template channels created twice -- once during migration, once during owner setup.
**Why it happens:** Seed logic runs in both migration SQL and application code.
**How to avoid:** Seed the starter template in application code only (after owner registration), not in the migration SQL. The migration only creates empty tables. Check `SELECT COUNT(*) FROM categories` before seeding.
**Warning signs:** Duplicate "General" categories or "#general" channels after server setup.

### Pitfall 6: Ban Check Timing on WebSocket
**What goes wrong:** Banned user maintains existing WebSocket connection after ban is applied.
**Why it happens:** Ban is stored in DB but existing WS connections aren't terminated.
**How to avoid:** After inserting a ban, immediately look up the banned user's connections in the ConnectionRegistry and send a Close frame with code 4003 and the ban reason. The ban check on WS connect prevents new connections; force-closing existing ones prevents continued access.
**Warning signs:** Banned user can still send/receive messages until they reconnect.

### Pitfall 7: JWT Claims Don't Reflect Role Changes
**What goes wrong:** User's JWT still says `is_admin: false` after being assigned admin role.
**Why it happens:** JWT was issued before role change; JWTs are stateless and don't update.
**How to avoid:** The existing `is_admin` claim in JWT is from Phase 1 (owner bootstrap only). For Phase 2, compute permissions from the database on each request that requires permission checks, not from JWT claims alone. The JWT proves identity (user_id, fingerprint); the database provides current permissions. Alternatively, force a token refresh after role changes.
**Warning signs:** Permission checks fail immediately after role assignment; work after token refresh.

## Code Examples

### Example 1: Admin Permission Guard

```rust
/// Extract the calling user's effective permissions from the database.
/// Used in admin endpoints to verify the caller has required permissions.
async fn require_permission(
    db: &DbPool,
    user_id: &str,
    is_owner: bool,
    required: Permissions,
) -> Result<(), StatusCode> {
    if is_owner {
        return Ok(()); // Owner has all permissions
    }

    let db = db.clone();
    let uid = user_id.to_string();

    let has_permission = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Get all permission bits for user's roles
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

    if has_permission {
        Ok(())
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}
```

### Example 2: Channel CRUD Endpoint

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
            [&req.category_id],
            |row| row.get(0),
        ).unwrap_or(false);
        if !cat_exists {
            return Err((StatusCode::BAD_REQUEST, "Category not found".to_string()));
        }

        // Get next position in category
        let max_pos: i64 = conn.query_row(
            "SELECT COALESCE(MAX(position), 0) FROM channels WHERE category_id = ?1",
            [&req.category_id],
            |row| row.get(0),
        ).unwrap_or(0);

        let id = uuid::Uuid::now_v7().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let position = max_pos + 1000;

        conn.execute(
            "INSERT INTO channels (id, name, channel_type, category_id, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![id, req.name, req.channel_type, req.category_id, position, now],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        Ok(ChannelResponse { id, name: req.name, channel_type: req.channel_type, category_id: req.category_id, position })
    }).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))??;

    // Broadcast channel_created event to all connected clients
    broadcast_to_all(&state.connections, /* channel_created envelope */);

    Ok(Json(channel))
}
```

### Example 3: WebSocket Event Broadcasting

```rust
/// Broadcast a protobuf envelope to all connected users.
fn broadcast_to_all(registry: &ConnectionRegistry, envelope: &Envelope) {
    let mut buf = Vec::with_capacity(envelope.encoded_len());
    if envelope.encode(&mut buf).is_err() {
        return;
    }
    let msg = Message::Binary(buf.into());

    for entry in registry.iter() {
        for sender in entry.value().iter() {
            let _ = sender.send(msg.clone());
        }
    }
}

/// Broadcast to a specific user (all their connections).
fn send_to_user(registry: &ConnectionRegistry, user_id: &str, envelope: &Envelope) {
    let mut buf = Vec::with_capacity(envelope.encoded_len());
    if envelope.encode(&mut buf).is_err() {
        return;
    }
    let msg = Message::Binary(buf.into());

    if let Some(connections) = registry.get(user_id) {
        for sender in connections.value().iter() {
            let _ = sender.send(msg.clone());
        }
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON permission arrays in DB | Integer bitfields with bitflags | Industry standard since Discord (2015) | O(1) permission checks, compact storage |
| Sequential position integers | Gap-based position integers | Trello/Figma pattern (~2018) | Reduces write amplification on reorder |
| Polling for ban expiration | Lazy expiration check on access | Common in session management | Eliminates unnecessary background work |
| Full state sync on mutations | Delta events over WebSocket | Discord/Slack real-time pattern | Bandwidth efficient, supports offline catch-up |

**Deprecated/outdated:**
- Phase 1's `ROLE_ADMIN: i64 = 1` constant in `db/models.rs` will be superseded by the `bitflags` Permissions type. The existing `roles` integer column on the `users` table is Phase 1's simple admin flag; Phase 2 introduces proper roles via the `user_roles` junction table. The old `roles` column can be kept for backward compatibility (owner has it set to 1) or migrated to the new system.

## Open Questions

1. **Should the Phase 1 `users.roles` column be migrated or deprecated?**
   - What we know: Phase 1 uses `users.roles INTEGER` with `ROLE_ADMIN = 1` for the simple owner/admin flag. Phase 2 introduces a proper roles system via `roles` and `user_roles` tables.
   - What's unclear: Whether to keep `users.roles` for the owner flag or migrate it into the new roles system.
   - Recommendation: Keep `users.roles` and `users.is_owner` as-is for Phase 1 compatibility. The new permission system reads from `user_roles` + `roles` tables. The owner check remains `users.is_owner = true`. No migration needed -- the Phase 1 column becomes legacy but harmless.

2. **Kick behavior: delete user record or soft-remove?**
   - What we know: Context says "kicked user can rejoin immediately with a valid invite." The `users` table has the fingerprint used for auth.
   - What's unclear: If we delete the user row, they can re-register. If we keep it, they just need a new invite code (if invite-only) or can reconnect freely.
   - Recommendation: Do NOT delete the user row on kick. Close their WebSocket connections (force-close with a new close code, e.g., 4004 = kicked). Remove their role assignments (except @everyone). The user retains their identity on the server and can reconnect. This avoids re-registration friction and preserves message attribution for Phase 4.

3. **P2P peer discovery bootstrapping (SRVR-09 partial)**
   - What we know: SRVR-09 says "bootstraps P2P peer discovery and begins content replication." P2P is Phase 3.
   - What's unclear: How much of SRVR-09 to implement in Phase 2.
   - Recommendation: Phase 2 handles the invite validation and server join. P2P bootstrap is deferred to Phase 3. SRVR-09 is partially fulfilled in Phase 2 (join via invite) and completed in Phase 3 (P2P discovery).

4. **Custom protocol handler (`united://`) for invite deep links**
   - What we know: Invite landing page should have "Open in UNITED" button linking to `united://invite/{code}`.
   - What's unclear: Whether Electron custom protocol registration is in scope for Phase 2 or Phase 1 client work.
   - Recommendation: Register the `united://` custom protocol handler in the Electron main process as part of Phase 2 client work. It's minimal code (Electron's `protocol.registerSchemesAsPrivileged` + `app.setAsDefaultProtocolClient`) and required for invite links to work.

## Sources

### Primary (HIGH confidence)
- **Existing codebase** (`server/src/`) - Analyzed all Phase 1 source files for extension points
- **rusqlite_migration docs** (https://docs.rs/rusqlite_migration) - Migration append pattern verified
- **bitflags crate** (https://crates.io/crates/bitflags v2.11) - API and usage verified
- **Discord developer docs** (https://docs.discord.com/developers/topics/permissions) - Permission bitflag model and union resolution algorithm

### Secondary (MEDIUM confidence)
- **Signal device linking** (https://signal.org/blog/a-synchronized-start-for-linked-devices/) - QR + ephemeral key exchange protocol for device provisioning
- **mdns-sd crate** (https://crates.io/crates/mdns-sd v0.13) - LAN service discovery option
- **qrcode crate** (https://crates.io/crates/qrcode v0.14) - QR code generation for Rust
- **SQLite forum** (https://sqlite.org/forum/info/c4943eab84d63733) - Position integer gap strategy for ordering

### Tertiary (LOW confidence)
- **SEC-12 protocol design** - No existing implementation found for UNITED's specific local-only QR+AES-GCM+TCP pattern. The protocol design in Pattern 8 is synthesized from Signal's approach adapted for UNITED's no-server-involvement constraint. Needs validation during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use or well-known Rust ecosystem crates
- Architecture: HIGH - Extends established Phase 1 patterns (axum handlers, rusqlite, protobuf envelope)
- Schema design: HIGH - Standard relational patterns for RBAC, well-understood
- Permission model: HIGH - Discord's bitflag approach is battle-tested, adapted for simpler 5-permission set
- SEC-12 provisioning: MEDIUM - Protocol design is sound but novel combination; no existing reference implementation
- Pitfalls: HIGH - Based on direct codebase analysis and common Discord-clone patterns

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days -- stable domain, no fast-moving dependencies)
