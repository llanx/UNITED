# Phase 1: Foundation — Discussion Progress (Resume File)

**Saved:** 2026-02-22
**Status:** In progress — resume from Config & Deployment (logging question)
**Developer scope:** matts (Dev A) — Rust coordination server side only

## Context Already Read

- ROADMAP.md (updated with identity architecture changes)
- IDENTITY-ARCHITECTURE.md (new — Ed25519 keypair identity, challenge-response auth)
- REQUIREMENTS.md (updated — SEC-09 through SEC-12 added to Phase 1)
- PARALLEL-DEV.md (matts = Rust server, benzybones = Electron/React client)
- PROJECT.md (updated)

## Areas Selected for Discussion

1. Auth behavior — COMPLETE (8 questions answered)
2. WebSocket protocol — COMPLETE (4 questions answered)
3. Config & Deployment — IN PROGRESS (2 of ~4 questions answered, stopped at logging format)
4. Server admin bootstrap — NOT STARTED
5. Identity storage details — NOT STARTED

## Decisions Made

### Auth Behavior (COMPLETE)

1. **First admin**: First identity to register/authenticate automatically becomes server admin
2. **JWT strategy**: Short access (15min) + refresh token (7-day). Client auto-refreshes silently. Confirmed by IDENTITY-ARCHITECTURE.md.
3. **Password policy**: SUPERSEDED — No passwords. Passphrase encrypts local private key. 12-char minimum enforced by client (per IDENTITY-ARCHITECTURE.md). Server never sees it.
4. **Registration mode**: Configurable — server config toggle between open and invite-only. Default open, admin can lock down. Mechanism is now "present public key + sign challenge."
5. **Rate limiting**: Basic IP-based rate limiting on auth endpoints (challenge-response endpoint). E.g. 5 attempts per minute.
6. **Sessions**: Multiple active sessions allowed. Each device has its own refresh token.
7. **Display name**: Required at registration
8. **Display name uniqueness**: Unique per server. No discriminator system.

### WebSocket Protocol (COMPLETE)

1. **Heartbeat/keepalive**: Claude's discretion — will use server-side WebSocket pings for Phase 1, layer app-level presence heartbeats in Phase 4
2. **Auth failure handling**: Close with WebSocket error codes (4001=token expired, 4002=invalid, 4003=banned, etc). Client maps codes to behavior.
3. **Message encoding**: Protobuf (binary) from day 1. Both sides wire up prost (Rust) and @bufbuild/protobuf (TS) immediately. No JSON→protobuf migration needed.
4. **Remaining WS details**: Claude's discretion (actor pattern, exact close codes, message dispatch)

### Config & Deployment (IN PROGRESS)

1. **Config file location**: Working directory default (`./united.toml`) + `--config <path>` CLI override + env var overrides. Precedence: CLI flag > env vars > config file > defaults.
2. **Default port**: 1984 — Reclaiming Big Brother's IANA-registered port for anti-surveillance software.
3. **Logging format**: NOT YET DECIDED — was about to answer when discussion paused
4. **Docker setup**: NOT YET DISCUSSED

### Server Admin Bootstrap — NOT STARTED

Key questions to cover:
- How first admin works with keypair identity (no email/password anymore)
- Server setup flow on first boot
- TOTP enrollment for the first admin
- Server name/icon/description configuration

### Identity Storage Details — NOT STARTED

Key questions to cover:
- How server stores/serves encrypted identity blobs (SEC-09)
- Key rotation state machine on the server (SEC-11)
- TOTP secret storage and management (SEC-10)
- Device provisioning relay role (SEC-12)

## Deferred Ideas

None so far — discussion stayed within phase scope.

## Key Architecture Changes Since Discussion Started

The identity model changed from email+password to Ed25519 keypair during this session. User pulled updated IDENTITY-ARCHITECTURE.md which:
- Replaces email/password with Ed25519 keypair + passphrase encryption
- Adds challenge-response authentication (server never sees credentials)
- Adds three-tier recovery (mnemonic, encrypted server blobs, device provisioning)
- Adds TOTP 2FA (default-on, admin-configurable)
- Adds key rotation with 72-hour cancellation window
- Adds 4 new requirements: SEC-09, SEC-10, SEC-11, SEC-12

---
*Progress saved: 2026-02-22*
*Resume with: /gsd:discuss-phase 1 (point it at this file to skip ahead)*
