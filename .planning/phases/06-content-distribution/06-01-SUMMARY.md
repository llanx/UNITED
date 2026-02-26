---
phase: 06-content-distribution
plan: 01
subsystem: blocks, crypto, api
tags: [hkdf, aes-256-gcm, sha256, content-addressed, block-store, retention]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "SQLite DB, JWT auth middleware, axum routes, AppState pattern"
  - phase: 02-server-management
    provides: "channels table (FK for block metadata)"
provides:
  - "Content-addressed block storage with HKDF-encrypted files on disk"
  - "REST API: PUT /api/blocks (upload), GET /api/blocks/:hash (download)"
  - "Background retention cleanup task for expired blocks"
  - "BlockRef, BlockRequest, BlockResponse, BlockStored, BlockAvailable protobuf messages"
  - "WS Envelope Phase 6 fields (160-162) for block events"
  - "[blocks] config section with retention_days and cleanup_interval_secs"
affects: [06-content-distribution, 07-media-and-prefetching]

# Tech tracking
tech-stack:
  added: [hkdf 0.12]
  patterns: [content-derived HKDF key derivation, file-based encrypted block storage, background retention cleanup]

key-files:
  created:
    - shared/proto/blocks.proto
    - server/src/blocks/mod.rs
    - server/src/blocks/crypto.rs
    - server/src/blocks/store.rs
    - server/src/blocks/routes.rs
    - server/src/blocks/retention.rs
  modified:
    - shared/proto/ws.proto
    - server/build.rs
    - server/src/proto/mod.rs
    - server/src/db/migrations.rs
    - server/src/db/models.rs
    - server/Cargo.toml
    - server/src/config.rs
    - server/src/state.rs
    - server/src/lib.rs
    - server/src/main.rs
    - server/src/routes.rs
    - server/tests/auth_test.rs
    - server/tests/channels_test.rs
    - server/tests/roles_test.rs
    - server/tests/invite_test.rs
    - server/tests/moderation_test.rs
    - server/tests/ws_test.rs

key-decisions:
  - "HKDF salt b'united-content-derived-key-v1' and info b'united-server-block-encryption' for domain separation"
  - "Block files stored at {data_dir}/blocks/{hex_hash} -- flat directory, no sharding"
  - "X-Block-Hash and X-Channel-Id custom headers for block upload metadata"
  - "INSERT OR IGNORE for block metadata to handle idempotent re-uploads"
  - "WS Envelope Phase 6 fields at 160-162, DM range corrected to 150-159"
  - "data_dir, block_retention_days, block_cleanup_interval_secs added to AppState"

patterns-established:
  - "Content-derived encryption: HKDF(content_hash) -> AES-256-GCM key for at-rest block encryption"
  - "File-based block storage: metadata in SQLite, encrypted data on filesystem"
  - "Retention cleanup pattern: background tokio task with configurable interval"
  - "Raw binary REST endpoints: PUT body with custom headers, GET returns application/octet-stream"

requirements-completed: [P2P-01, P2P-06]

# Metrics
duration: 12min
completed: 2026-02-26
---

# Phase 6 Plan 01: Server Block Store Summary

**Content-addressed block store with HKDF-SHA256 encrypted storage, REST upload/download API, and background retention purge**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-26T07:55:51Z
- **Completed:** 2026-02-26T08:07:21Z
- **Tasks:** 2
- **Files modified:** 23

## Accomplishments
- Protobuf schemas for block exchange (BlockRef, BlockRequest, BlockResponse, BlockStored, BlockAvailable) with WS Envelope integration
- HKDF-SHA256 content-derived encryption module with AES-256-GCM (5 unit tests covering roundtrip, wrong hash, short data, determinism, uniqueness)
- File-based encrypted block storage with SQLite metadata tracking (hash verification, idempotent uploads, expiry management)
- REST API: PUT /api/blocks (upload with hash verification) and GET /api/blocks/:hash (download with decryption)
- Background retention cleanup task that purges expired blocks at configurable intervals
- Configurable [blocks] section in united.toml (retention_days default 30, cleanup_interval_secs default 3600)

## Task Commits

Each task was committed atomically:

1. **Task 1: Protobuf schemas and server database migration** - `47b876e` (feat)
2. **Task 2: Block store module with HKDF crypto, REST endpoints, and retention purge** - `2d655be` (feat)

## Files Created/Modified
- `shared/proto/blocks.proto` - BlockRef, BlockRequest, BlockResponse, BlockStored, BlockAvailable protobuf messages
- `shared/proto/ws.proto` - Phase 6 block event payload variants (fields 160-162) in Envelope
- `server/build.rs` - Added blocks.proto to prost compile list
- `server/src/proto/mod.rs` - Added blocks module and re-export
- `server/src/db/migrations.rs` - Migration 6: blocks table with hash PK, size, encrypted_size, channel FK, expiry index
- `server/src/db/models.rs` - BlockRow struct for block metadata
- `server/Cargo.toml` - Added hkdf 0.12 dependency
- `server/src/blocks/mod.rs` - Module declarations for crypto, store, routes, retention
- `server/src/blocks/crypto.rs` - HKDF-SHA256 key derivation and AES-256-GCM encrypt/decrypt with 5 unit tests
- `server/src/blocks/store.rs` - put_block, get_block, has_block, delete_block, delete_expired_blocks
- `server/src/blocks/routes.rs` - PUT /api/blocks and GET /api/blocks/:hash REST endpoints
- `server/src/blocks/retention.rs` - spawn_retention_cleanup background task
- `server/src/config.rs` - BlocksConfig struct with retention_days and cleanup_interval_secs, config template
- `server/src/state.rs` - Added data_dir, block_retention_days, block_cleanup_interval_secs fields
- `server/src/lib.rs` - Added pub mod blocks
- `server/src/main.rs` - Wire retention cleanup task and new AppState fields
- `server/src/routes.rs` - Wire block storage routes into router
- `server/tests/*.rs` - Updated all 6 test files with new AppState fields

## Decisions Made
- HKDF salt and info strings chosen for clear domain separation (content-derived-key-v1 / server-block-encryption)
- Flat file layout ({data_dir}/blocks/{hex_hash}) -- simple and sufficient for v1; sharding can be added later if needed
- Custom headers (X-Block-Hash, X-Channel-Id) for block upload metadata rather than multipart form
- WS Envelope DM range narrowed to 150-159 (was 150-169) to make room for Phase 6 at 160-179
- INSERT OR IGNORE for block metadata enables idempotent re-uploads without error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added new AppState fields to all existing test files**
- **Found during:** Task 2 (wiring into application)
- **Issue:** Adding data_dir, block_retention_days, block_cleanup_interval_secs to AppState broke 7 AppState constructors across 6 test files
- **Fix:** Added the three new fields with test-appropriate defaults (tmp_dir path for data_dir, None for optional fields) to all test AppState constructors
- **Files modified:** server/tests/auth_test.rs, channels_test.rs, roles_test.rs, invite_test.rs, moderation_test.rs, ws_test.rs
- **Verification:** All 52 tests pass (5 new crypto + 47 existing)
- **Committed in:** 2d655be (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for test compilation. No scope creep.

## Issues Encountered
None - plan executed as written with only the expected test compilation fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server block storage infrastructure complete and ready for P2P block exchange (06-02)
- REST API available for client block upload/download
- Retention system running as background task
- WS Envelope fields allocated for block notification events

## Self-Check: PASSED

- All 6 created files verified on disk
- Both commit hashes (47b876e, 2d655be) found in git log
- 52 tests passing (5 new + 47 existing)

---
*Phase: 06-content-distribution*
*Completed: 2026-02-26*
