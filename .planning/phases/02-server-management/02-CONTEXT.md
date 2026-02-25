# Phase 2: Server Management - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Server admins can fully structure their community with channels, categories, roles, and permissions, and new users can join via invite links. This builds on the Phase 1 foundation (auth, identity, WebSocket, server settings).

**Requirements:** SRVR-01, SRVR-02, SRVR-03, SRVR-04, SRVR-05, SRVR-06, SRVR-08, SRVR-09, SEC-12

</domain>

<decisions>
## Implementation Decisions

### Channel & category structure
- Server starts with a **starter template**: General category (#general, #introductions) + Voice category (one voice channel)
- **Flat categories only** — categories contain channels, no nested categories. Like Discord.
- Every channel **must belong to a category** — no uncategorized/orphan channels. Starter template provides defaults so this adds no friction.
- **Manual drag-and-drop ordering** — admin reorders channels by dragging. Server stores explicit position integers.
- Categories are also manually ordered with position integers.

### Permission model
- **Role-only permissions (server-wide)** — no per-channel overrides in Phase 2. Data model designed to accommodate channel overrides later (v2 ASRV-01).
- **Minimal permission set:** `send_messages`, `manage_channels`, `kick_members`, `ban_members`, `admin`. Matches SRVR-03 exactly.
- **Default @everyone role** — auto-assigned to all users on join. Permissions configurable by admin.
- **Union resolution** — if ANY role grants a permission, the user has it. Bitwise OR of all role permission flags. No priority-based ordering.
- Owner role (from Phase 1 setup token) has all permissions implicitly — not represented as a regular role.

### Moderation actions
- **Kick = soft removal** — kicked user can rejoin immediately with a valid invite. Kick is a warning; ban is the escalation.
- **Clear ban notice** — banned user sees "You have been banned from [server name]" with the optional reason. Uses existing 4003 WebSocket close code from Phase 1. Transparent, aligns with UNITED's sovereignty values.
- **Optional ban reason** — admin can write a reason when banning. Reason is shown to the banned user.
- **Permanent + temporary bans** — admin can set an optional duration (e.g., 1h, 24h, 7d, custom). Ban auto-expires after duration. Permanent bans have no expiration.
- Ban records stored with: banned user fingerprint, admin who banned, reason (optional), timestamp, expiration (optional).

### Invite & onboarding
- **Server URL + code format** — e.g., `https://myserver.com:1984/invite/abc123`. Server serves a landing page at that URL showing server info + "Open in UNITED" button + download link.
- **Expiration + use count limits** — both optional. Admin can set time expiration (1h, 24h, 7d, never) AND max uses (1, 5, 10, 25, 100, unlimited).
- **QR-bootstrapped local device transfer (SEC-12)** — QR code contains a short-lived encryption key + local network address. Devices connect directly over local network, transfer full current keypair encrypted. No server involvement. Handles key rotation correctly (transfers current key, not genesis).
- **Onboarding: straight to #general by default** — no welcome screen unless admin explicitly enables it. Admin can configure a welcome overlay (server name + description + optional rules) in server settings. If enabled, new joiners see the overlay with a "Jump in" button.

### Claude's Discretion
- Invite code generation algorithm (random string length, character set)
- Exact QR code content format and encryption scheme for device provisioning
- Local network discovery mechanism for device-to-device transfer (mDNS, BLE, etc.)
- Invite landing page HTML/styling
- Position integer gap strategy for channel/category reordering (e.g., start at 1000, increment by 1000)
- Ban expiration check mechanism (polling vs. lazy check on connection)
- Welcome overlay component design and animation

</decisions>

<specifics>
## Specific Ideas

- Starter template mirrors Discord's new server experience — familiar for migrating users
- Ban transparency aligns with UNITED's sovereignty mission — users have a right to know why their access was revoked
- Invite link format doubles as a landing page for users who don't have the app yet — critical for growth
- SEC-12 device provisioning via QR is a local-only operation — consistent with UNITED's "no third party touches your data" principle
- Permission model is intentionally minimal for v1 — ASRV-01 (channel overrides) is explicitly deferred to v2

</specifics>

<deferred>
## Deferred Ideas

- Channel-level permission overrides per role — v2 (ASRV-01)
- Audit log for admin actions — v2 (ASRV-03)
- Server rules/guidelines feature (beyond welcome screen description)
- "Muted" or "timeout" role for temporary restriction without kick/ban

</deferred>

---

*Phase: 02-server-management*
*Context gathered: 2026-02-23*
