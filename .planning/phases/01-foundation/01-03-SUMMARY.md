---
phase: 01-foundation
plan: 03
subsystem: auth
tags: [rust, axum, totp, aes-256-gcm, ed25519, websocket, protobuf, docker, cargo-chef, dashmap, tokio-tungstenite]

# Dependency graph
requires:
  - phase: 01-foundation/02
    provides: "Axum server, SQLite schema, JWT auth, AppState, routes, challenge-response flow"
provides:
  - "TOTP 2FA enrollment and verification with AES-256-GCM encrypted secrets"
  - "Identity blob storage and retrieval by fingerprint (public GET, authenticated PUT)"
  - "Key rotation with dual Ed25519 signature verification and 72-hour cancellation window"
  - "WebSocket handler with actor-per-connection pattern and protobuf dispatch"
  - "Connection registry tracking active WebSocket sessions per user"
  - "Multi-stage Docker image with cargo-chef dependency caching"
  - "10 integration tests covering auth flows, TOTP, blobs, rotation, and WebSocket"
affects: [01-04, 01-06, 02-01, 03-01]

# Tech tracking
tech-stack:
  added: [totp-rs, aes-gcm, futures-util, tokio-tungstenite, cargo-chef]
  patterns: [actor-per-connection-websocket, mpsc-split-reader-writer, aes-256-gcm-secret-encryption, dual-signature-rotation, protobuf-envelope-dispatch]

key-files:
  created:
    - server/src/auth/totp.rs
    - server/src/identity/blob.rs
    - server/src/identity/rotation.rs
    - server/src/ws/mod.rs
    - server/src/ws/handler.rs
    - server/src/ws/actor.rs
    - server/src/ws/protocol.rs
    - server/Dockerfile
    - server/.dockerignore
    - server/src/lib.rs
    - server/tests/auth_test.rs
    - server/tests/ws_test.rs
  modified:
    - server/src/auth/mod.rs
    - server/src/auth/jwt.rs
    - server/src/identity/mod.rs
    - server/src/main.rs
    - server/src/routes.rs
    - server/src/state.rs
    - server/Cargo.toml
    - server/Cargo.lock

key-decisions:
  - "AES-256-GCM for TOTP secret encryption with server-generated 256-bit key (not Argon2id — random key, no password derivation needed server-side)"
  - "Actor-per-connection WebSocket pattern: split into reader/writer with mpsc::unbounded_channel for backpressure-free server-to-client sends"
  - "JWT auth for WebSocket via ?token= query parameter (not header — WebSocket API doesn't support custom headers)"
  - "WebSocket close codes: 4001 expired, 4002 invalid, 4003 banned (per client context decisions)"
  - "Rotation payload format: dual signatures (old + new key) on canonical byte payload for non-repudiation"
  - "72-hour cancellation window stored as ISO 8601 deadline in rotation_records table"
  - "random_signing_key() helper avoids rand_core 0.6/0.9 version conflict between ed25519-dalek and rand"

patterns-established:
  - "Actor-per-connection: split WebSocket, spawn writer/ping tasks, register in DashMap<UserId, Vec<Sender>>"
  - "Protobuf envelope dispatch: decode Envelope, match payload variant, call typed handler"
  - "AES-256-GCM encryption pattern: nonce || ciphertext stored as single blob, split on decrypt"
  - "Dual-signature verification: both old and new keys must sign rotation payload"
  - "Integration test pattern: start_test_server() returns (base_url, setup_token), random port per test"

requirements-completed: [SEC-09, SEC-10, SEC-11]

# Metrics
duration: 45min
completed: 2026-02-24
---

# Phase 1 Plan 3: Server Advanced Auth Summary

**TOTP 2FA with AES-256-GCM encrypted secrets, identity blob storage, Ed25519 key rotation with 72-hour cancellation, actor-per-connection WebSocket with protobuf dispatch, and multi-stage Docker build**

## Performance

- **Duration:** 45 min
- **Started:** 2026-02-24T03:40:00Z
- **Completed:** 2026-02-24T04:27:00Z
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments
- TOTP 2FA enrollment, confirmation, and login verification with secrets encrypted at rest using AES-256-GCM
- Identity blob PUT (authenticated, 64KB max) and GET (public, rate-limited 10/min/IP) endpoints
- Key rotation with dual Ed25519 signature verification, 72-hour cancellation window, and automatic refresh token invalidation
- Full rotation chain persistence and retrieval (genesis + all rotations ordered by created_at)
- WebSocket handler with JWT auth via query parameter and proper close codes (4001/4002/4003)
- Actor-per-connection pattern: split reader/writer, mpsc channel, server-side ping (30s) with pong timeout (10s)
- Protobuf envelope decode and dispatch (ServerInfoRequest implemented as extensible pattern)
- Connection registry (DashMap) tracking all active sessions per user with automatic cleanup on disconnect
- Multi-stage Docker image: cargo-chef for dependency caching, debian-slim runtime, non-root user, port 1984
- 10 integration tests: 5 auth (health, full flow, TOTP, blobs, rotation) + 5 WebSocket (valid JWT, auth failure, ping/pong, protobuf dispatch, cleanup)

## Task Commits

Each task was committed atomically:

1. **Task 1: TOTP, identity blobs, and key rotation** - `170644c` (feat)
2. **Task 2: WebSocket handler, Docker, and integration tests** - `51016b3` (feat, with intermediate WIP `1eae1b0`)

## Files Created/Modified
- `server/src/auth/totp.rs` - TOTP enrollment, confirmation, verification; AES-256-GCM encrypt/decrypt helpers
- `server/src/identity/blob.rs` - GET blob by fingerprint (public), PUT blob (authenticated, 64KB max)
- `server/src/identity/rotation.rs` - Key rotation with dual signatures, 72h cancellation, rotation chain queries
- `server/src/ws/mod.rs` - ConnectionSender type, ConnectionRegistry (DashMap), factory function
- `server/src/ws/handler.rs` - WebSocket upgrade with JWT auth from query param, close codes
- `server/src/ws/actor.rs` - Actor-per-connection: split reader/writer, ping/pong keepalive, registry management
- `server/src/ws/protocol.rs` - Protobuf Envelope decode, payload dispatch, ServerInfoRequest handler
- `server/Dockerfile` - Multi-stage build: cargo-chef planner, recipe cook, builder, debian-slim runtime
- `server/.dockerignore` - Exclude target/, .git/, data/
- `server/src/lib.rs` - Library target re-exporting all modules for integration test access
- `server/tests/auth_test.rs` - 5 integration tests: health, full auth flow, TOTP, blobs, rotation
- `server/tests/ws_test.rs` - 5 integration tests: WS connect, auth failure, ping/pong, protobuf, cleanup
- `server/src/auth/mod.rs` - Added pub mod totp
- `server/src/auth/jwt.rs` - Added load_or_generate_encryption_key()
- `server/src/identity/mod.rs` - Added pub mod blob, pub mod rotation
- `server/src/main.rs` - Added mod ws, encryption key loading, connection registry creation
- `server/src/routes.rs` - Added all new endpoints with rate limiting (identity 10/min/IP), WS route
- `server/src/state.rs` - Added encryption_key and connections fields to AppState
- `server/Cargo.toml` - Added futures-util, dev-dependencies (tokio-tungstenite, reqwest, prost)
- `server/Cargo.lock` - Updated with new dependency tree

## Decisions Made
- AES-256-GCM chosen for TOTP secret encryption (server-side random key, no password derivation needed)
- WebSocket auth via query parameter (WebSocket API has no custom header support in browsers)
- Close codes 4001/4002/4003 match client context decisions document
- Actor-per-connection with mpsc::unbounded_channel (backpressure handled by TCP, not application layer)
- Server-side ping every 30s with 10s pong timeout (per Pitfall 5 in research doc)
- Dual-signature rotation: old key proves continuity, new key proves possession
- 72-hour cancellation stored as ISO 8601 deadline (not duration) for deterministic comparison
- Created random_signing_key() helper in tests to avoid rand_core 0.6/0.9 version conflict

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Message::Ping type mismatch**
- **Found during:** Task 2
- **Issue:** axum::extract::ws::Message::Ping expects Bytes, not Vec<u8>
- **Fix:** Added .into() conversion for ping payloads
- **Files modified:** server/src/ws/actor.rs
- **Committed in:** 51016b3 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed SinkExt::close() misuse for WebSocket close frames**
- **Found during:** Task 2
- **Issue:** futures_util::SinkExt::close() takes no arguments; cannot pass close frames through it
- **Fix:** Changed to socket.send(Message::Close(Some(close_frame))) pattern
- **Files modified:** server/src/ws/handler.rs
- **Committed in:** 51016b3 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed nonexistent same_channel() method on UnboundedSender**
- **Found during:** Task 2
- **Issue:** mpsc::UnboundedSender has no same_channel() method for connection identity comparison
- **Fix:** Changed unregister_connection() to use sender.is_closed() to identify dead connections
- **Files modified:** server/src/ws/actor.rs
- **Committed in:** 51016b3 (Task 2 commit)

**4. [Rule 3 - Blocking] Fixed rand_core version conflict in integration tests**
- **Found during:** Task 2
- **Issue:** ed25519-dalek 2.2 depends on rand_core 0.6, rand 0.9 depends on rand_core 0.9; SigningKey::generate(&mut rand::rng()) failed
- **Fix:** Created random_signing_key() that generates [u8; 32] with rand::rng().random() then calls SigningKey::from_bytes()
- **Files modified:** server/tests/auth_test.rs, server/tests/ws_test.rs
- **Committed in:** 51016b3 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 blocking)
**Impact on plan:** All fixes necessary for correct compilation and runtime behavior. No scope creep.

## Issues Encountered
- Intermediate WIP commit (1eae1b0) created during Task 2 development for the WebSocket scaffold before all fixes were applied. Final commit (51016b3) contains the complete, working implementation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server side of Phase 1 is complete: auth, TOTP, identity management, WebSocket, Docker
- Ready for Plan 01-04/05/06: Client can target all REST and WebSocket endpoints
- WebSocket protobuf dispatch pattern is extensible (add new Payload variants + handlers)
- Docker image ready for deployment (needs Docker runtime to build)
- Connection registry ready for Phase 2 channel management (broadcast to channel members)
- Rotation chain persistence ready for cross-server identity verification

## Self-Check: PASSED

All 12 created files verified present. All 7 modified files verified present. All 3 task commits (170644c, 1eae1b0, 51016b3) verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-02-24*
