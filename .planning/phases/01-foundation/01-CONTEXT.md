# Phase 1: Foundation - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Rust coordination server foundation for UNITED. Users can create a self-sovereign Ed25519 keypair identity, authenticate via challenge-response signature, and connect to a self-hosted coordination server. Server handles identity storage, TOTP 2FA, key rotation, JWT sessions, WebSocket connections, and server settings. The Electron/React client is built separately by benzybones (Dev B) — this context covers matts' (Dev A) server-side work only.

**Requirements:** SEC-01, SEC-02, SEC-08, SEC-09, SEC-10, SEC-11, SEC-12, APP-01, SRVR-07
**Identity Architecture:** See IDENTITY-ARCHITECTURE.md for full design

</domain>

<decisions>
## Implementation Decisions

### Auth Behavior
- First identity to authenticate on a fresh server becomes admin (via setup token — see Server Admin Bootstrap)
- JWT strategy: 15-minute access token + 7-day refresh token. Client auto-refreshes silently. Confirmed by IDENTITY-ARCHITECTURE.md.
- Passphrase policy: 12-character minimum enforced by client. Server never sees or stores passphrases. Per IDENTITY-ARCHITECTURE.md.
- Registration mode: Configurable toggle between open and invite-only. Default open. Admin can change via API at runtime.
- Rate limiting: Basic IP-based rate limiting on challenge-response auth endpoint (e.g., 5 attempts per minute per IP)
- Sessions: Multiple active sessions allowed. Each device has its own refresh token. No single-session enforcement.
- Display name: Required at identity registration. Unique per server — no two users can share the same display name on a given server. No discriminator system.

### WebSocket Protocol
- Message encoding: Protobuf binary from day 1. Server uses prost for Rust codegen from shared .proto files. No JSON-to-protobuf migration.
- Auth failure handling: WebSocket close codes (4001=token expired, 4002=token invalid, 4003=banned, etc.). Client maps codes to behavior locally.

### Config & Deployment
- Config file: Default location is `./united.toml` in working directory. Override via `--config <path>` CLI flag. Individual settings overridable via env vars (e.g., `UNITED_PORT=8080`). Precedence: CLI flag > env vars > config file > built-in defaults.
- Config generation: No auto-generate on boot. Server runs with built-in defaults out of the box. `united-server --generate-config` outputs a fully-commented TOML template.
- Default port: 1984. Reclaiming Big Brother's IANA-registered port for anti-surveillance software.
- Bind address: 0.0.0.0 (all interfaces) by default. Configurable via `bind_address` in united.toml.
- Logging: Human-readable pretty-printed logs by default. `--json-logs` flag (or `UNITED_LOG_FORMAT=json` env var) for structured JSON output in Docker/production.
- Log level: INFO by default. Use `RUST_LOG=united_server=debug` for development verbosity.
- Docker: Multi-stage Dockerfile ships with Phase 1, built as the final task. Users can run via Docker or standalone binary.

### Server Admin Bootstrap
- Admin establishment: Setup token printed to server console on first boot. First identity to present the valid token becomes server owner.
- Owner vs Admin: Two tiers. Owner (setup token claimer) has powers admins don't: delete server, transfer ownership, demote admins. Admin is a grantable role below owner.
- Admin transferable: Owner can promote others to admin and transfer ownership to another identity.
- Admin recovery: `united-server reset-admin` CLI command generates a new setup token. Requires server console access. Same pattern as initial setup.
- TOTP enrollment: Prompted during admin setup but skippable. Persistent security warning shown on every admin action until TOTP is enrolled.
- Server info: Defaults on first boot (name = hostname, no icon, no description). Admin updates via REST API at any time. Config file can set initial values that API overrides.
- Registration mode: Changeable via admin API at runtime (not just config file). Consistent with server info being API-driven.

### Identity Storage
- Encrypted blob access: Public by fingerprint with rate limiting. Anyone with the fingerprint can request the encrypted blob — required for recovery (user can't sign a challenge when they've lost their key). Argon2id passphrase encryption is the security layer.
- Key rotation behavior: Immediately switch on rotation. New key is active immediately. Old key can only submit cancellation within 72-hour window, not perform normal auth.
- TOTP secret storage: Encrypted with a server-side key in the database. Defense-in-depth even on single-machine deployments.
- Rotation chain: Full chain persisted (genesis record + all rotation records). Required for old message verification, audit trail, and cross-server identity proof. Storage cost is negligible (~200 bytes per rotation).

### Claude's Discretion
- WebSocket heartbeat/keepalive strategy (likely server-side WS pings for Phase 1, app-level presence heartbeats in Phase 4)
- Actor-per-connection pattern details (reader/writer tokio tasks, mpsc channels)
- Exact WebSocket close code assignments beyond 4001/4002/4003
- Argon2id parameters for server-side operations
- JWT signing key management
- SQLite schema details and migration strategy
- Exact rate limiting implementation (tower middleware, in-memory counters, etc.)
- Docker base image choice and caching strategy

</decisions>

<specifics>
## Specific Ideas

- Port 1984: IANA-registered to "Big Brother" monitoring software. Using it for UNITED (anti-surveillance, sovereignty-first) is a deliberate reclamation — "we took Big Brother's port."
- Config pattern inspired by Caddy and Traefik: sensible defaults, override what you need, `--generate-config` for discoverability
- Setup token pattern matches Gitea, Synapse, and Vaultwarden — proven for self-hosted admin establishment
- Identity architecture from IDENTITY-ARCHITECTURE.md is the authoritative reference for all auth, recovery, and key rotation decisions
- Protobuf encoding uses same .proto files in `shared/proto/` for both Rust (prost) and TypeScript (@bufbuild/protobuf) — byte-level compatibility guaranteed

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-23*
