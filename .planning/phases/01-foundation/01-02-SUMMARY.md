---
phase: 01-foundation
plan: 02
subsystem: auth
tags: [rust, axum, ed25519, jwt, sqlite, figment, tower-governor, challenge-response]

# Dependency graph
requires:
  - phase: 01-foundation/01
    provides: "Protobuf contracts, Cargo.toml with all deps, prost-generated types"
provides:
  - "Axum server listening on port 1984 with config system"
  - "SQLite database with full schema (users, identity_blobs, rotation_records, refresh_tokens, server_settings, challenges)"
  - "Ed25519 challenge-response authentication flow"
  - "JWT access (15-min) and refresh (7-day) token issuance with HS256"
  - "User registration with genesis rotation record and encrypted blob storage"
  - "Setup token admin bootstrap (first user becomes owner)"
  - "Server settings CRUD (public GET, admin-only PUT)"
  - "Rate limiting on auth endpoints (5/min/IP via tower-governor)"
affects: [01-03, 01-04, 01-06, 02-01]

# Tech tracking
tech-stack:
  added: [figment, rusqlite_migration, jsonwebtoken, tower-governor, ed25519-dalek, sha2, hex, hostname, dashmap]
  patterns: [figment-layered-config, spawn-blocking-db, arc-mutex-sqlite, dashmap-challenge-store, jwt-claims-extractor, setup-token-bootstrap]

key-files:
  created:
    - server/src/config.rs
    - server/src/db/mod.rs
    - server/src/db/migrations.rs
    - server/src/db/models.rs
    - server/src/auth/challenge.rs
    - server/src/auth/jwt.rs
    - server/src/auth/middleware.rs
    - server/src/identity/registration.rs
    - server/src/admin/setup.rs
    - server/src/admin/settings.rs
    - server/src/routes.rs
    - server/src/state.rs
    - server/tests/e2e_test.py
  modified:
    - server/src/main.rs
    - server/Cargo.toml
    - server/Cargo.lock

key-decisions:
  - "PeerIpKeyExtractor for rate limiting (requires ConnectInfo<SocketAddr> on axum::serve)"
  - "DashMap for in-memory challenge store with 60-second expiry"
  - "JWT refresh tokens stored as SHA-256 hash in DB, single-use rotation"
  - "jsonwebtoken rust_crypto feature required for HS256 CryptoProvider in v10.3"
  - "Setup token regenerated on server restart if no users exist yet"

patterns-established:
  - "tokio::task::spawn_blocking for all rusqlite operations (sync DB in async runtime)"
  - "Claims extractor via FromRequestParts + JwtSecret in request extensions"
  - "AppState struct with Arc<Mutex<Connection>> + Arc<DashMap> + jwt_secret"
  - "Figment layered config: defaults < TOML < env (UNITED_*) < CLI args"
  - "Setup token: generate, SHA-256 hash to DB, verify on register, consume on first owner"

requirements-completed: [SEC-01, SEC-02, SRVR-07]

# Metrics
duration: 16min
completed: 2026-02-24
---

# Phase 1 Plan 2: Server Core Summary

**Ed25519 challenge-response auth with JWT session management, SQLite schema, figment config system, setup token admin bootstrap, and tower-governor rate limiting on axum 0.8**

## Performance

- **Duration:** 16 min
- **Started:** 2026-02-24T03:46:33Z
- **Completed:** 2026-02-24T04:02:11Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- Full Rust coordination server foundation: boots on port 1984, initializes SQLite, prints setup token
- Figment config layering: defaults < united.toml < UNITED_* env vars < CLI args, with --generate-config template output
- Complete Ed25519 challenge-response auth flow: generate challenge, verify signature, issue JWT
- JWT access tokens (15-min, HS256) and refresh tokens (7-day, SHA-256 hashed, single-use rotation)
- User registration with genesis rotation record, encrypted identity blob storage, and display name uniqueness
- Admin bootstrap via setup token: first identity to register with valid token becomes server owner
- Server settings CRUD: public GET /api/server/info, admin-only PUT /api/server/settings
- Rate limiting on all auth endpoints: 5 requests/min/IP via tower-governor with PeerIpKeyExtractor
- End-to-end Python test covering all auth flows with pynacl

## Task Commits

Each task was committed atomically:

1. **Task 1: Config system, SQLite, and server entry point** - `611b35a` (feat)
2. **Task 2: Challenge-response auth, JWT, registration, rate limiting** - `a982e26` (feat)

## Files Created/Modified
- `server/src/config.rs` - Figment config loading with CLI/env/TOML layering
- `server/src/db/mod.rs` - SQLite initialization with WAL mode and foreign keys
- `server/src/db/migrations.rs` - Full schema: users, identity_blobs, rotation_records, refresh_tokens, server_settings, challenges
- `server/src/db/models.rs` - Row structs for all tables with role bitfield constants
- `server/src/auth/challenge.rs` - Challenge generation, Ed25519 verify, JWT issuance endpoints
- `server/src/auth/jwt.rs` - JWT key generation/loading, access/refresh token issuance, refresh rotation
- `server/src/auth/middleware.rs` - Claims extractor from Authorization: Bearer header
- `server/src/identity/registration.rs` - User registration with setup token, genesis record, blob storage
- `server/src/admin/setup.rs` - Setup token generation, SHA-256 hashing, verification, consumption
- `server/src/admin/settings.rs` - GET /api/server/info (public), PUT /api/server/settings (admin)
- `server/src/routes.rs` - Router assembly with rate limiting on auth routes
- `server/src/state.rs` - AppState with DbPool, DashMap challenges, JWT secret
- `server/src/main.rs` - Full entry point: config, logging, DB, JWT key, setup token, serve
- `server/tests/e2e_test.py` - End-to-end test with pynacl covering all auth flows

## Decisions Made
- Used PeerIpKeyExtractor over SmartIpKeyExtractor for rate limiting (simpler, works with ConnectInfo<SocketAddr>)
- DashMap for challenge store (concurrent access without blocking, periodic cleanup via tokio task)
- Refresh tokens stored as SHA-256 hash (never plaintext), consumed on use for rotation security
- jsonwebtoken 10.3 requires explicit `rust_crypto` feature for CryptoProvider — added to Cargo.toml
- Setup token regenerated on each restart if no users exist (old plaintext lost, only hash stored)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated deprecated rand API calls**
- **Found during:** Task 1
- **Issue:** rand 0.9 renamed thread_rng() to rng() and gen() to random()
- **Fix:** Changed rand::thread_rng().gen() to rand::rng().random() throughout
- **Files modified:** server/src/admin/setup.rs, server/src/auth/jwt.rs
- **Committed in:** 611b35a (Task 1 commit)

**2. [Rule 3 - Blocking] Added jsonwebtoken rust_crypto feature**
- **Found during:** Task 2
- **Issue:** jsonwebtoken 10.3.0 requires explicit CryptoProvider — panicked at runtime without it
- **Fix:** Added `features = ["rust_crypto"]` to jsonwebtoken in Cargo.toml
- **Files modified:** server/Cargo.toml
- **Committed in:** a982e26 (Task 2 commit)

**3. [Rule 3 - Blocking] Fixed rate limiter IP extraction**
- **Found during:** Task 2
- **Issue:** GovernorConfigBuilder::default() uses SmartIpKeyExtractor which failed to extract peer IP, returning 500
- **Fix:** Switched to PeerIpKeyExtractor and added ConnectInfo<SocketAddr> via into_make_service_with_connect_info
- **Files modified:** server/src/routes.rs, server/src/main.rs
- **Committed in:** a982e26 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All fixes necessary for correct runtime behavior. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server foundation complete: boots, authenticates, issues JWTs, manages settings
- Ready for Plan 01-03: TOTP enrollment, identity blob endpoints, key rotation, WebSocket handler, Docker
- Ready for Plan 01-04/05/06: Client can now target real REST API endpoints
- Auth flow verified end-to-end with Ed25519 key generation, signing, and verification

## Self-Check: PASSED

All 15 created files verified present. Both task commits (611b35a, a982e26) verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-02-24*
