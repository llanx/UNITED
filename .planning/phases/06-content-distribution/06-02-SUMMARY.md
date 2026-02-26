---
phase: 06-content-distribution
plan: 02
subsystem: storage
tags: [block-store, encryption, aes-256-gcm, xchacha20, argon2id, lru-cache, content-addressed, tiered-retention]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Identity crypto (Argon2id, sodium-native), client DB schema, preload bridge pattern"
  - phase: 05-direct-messages
    provides: "DM event handlers, dm-events.ts, dm.ts IPC handlers for block persistence wiring"
provides:
  - "Content-addressed block store with SHA-256 hashing"
  - "AES-256-GCM encrypted block storage (XChaCha20 fallback)"
  - "4-tier retention system (P1 never-evict, P2 hot, P3 warm, P4 altruistic)"
  - "LRU eviction sweep respecting tier ordering and budget"
  - "Block store IPC bridge for renderer access"
  - "HKDF content-derived keys for server block communication"
affects: [06-content-distribution, 07-media-and-prefetching]

# Tech tracking
tech-stack:
  added: [lru-cache@11.2.6]
  patterns: [content-addressed-storage, version-tagged-encryption, tiered-retention, fire-and-forget-persistence]

key-files:
  created:
    - client/src/main/blocks/types.ts
    - client/src/main/blocks/crypto.ts
    - client/src/main/blocks/cache.ts
    - client/src/main/blocks/store.ts
    - client/src/main/blocks/tiers.ts
    - client/src/main/blocks/index.ts
    - client/src/main/ipc/blocks.ts
  modified:
    - client/src/main/db/schema.ts
    - client/src/main/ipc/channels.ts
    - client/src/main/ipc/crypto.ts
    - client/src/main/ipc/dm.ts
    - client/src/main/ws/dm-events.ts
    - client/src/main/index.ts
    - client/src/preload/index.ts
    - shared/types/ipc-bridge.ts
    - client/package.json

key-decisions:
  - "Version-tagged ciphertext (0x01=AES-GCM, 0x02=XChaCha20) enables algorithm detection on decrypt"
  - "2-char hash prefix subdirectories for filesystem performance on block storage"
  - "Block store key derived with same Argon2id params as identity but separate dedicated salt"
  - "DM block persistence is fire-and-forget (wrapped in try/catch, non-blocking)"
  - "DB Migration 2 handles table creation; initBlockStore handles salt generation and directory setup"

patterns-established:
  - "Content-addressed storage: SHA-256 hash as block address and filename"
  - "Version-tagged encryption: 1-byte prefix distinguishes crypto algorithms"
  - "Tiered retention with budget-as-hard-limit, TTL-as-best-effort"
  - "Block IPC bridge: base64 encoding for Buffer transfer across process boundary"

requirements-completed: [P2P-01, P2P-05, SEC-04]

# Metrics
duration: 8min
completed: 2026-02-26
---

# Phase 6 Plan 02: Client Block Store Summary

**Content-addressed block store with AES-256-GCM encryption, 4-tier retention, LRU eviction, and IPC bridge for renderer access**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26T07:55:55Z
- **Completed:** 2026-02-26T08:04:52Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Content-addressed block store with SHA-256 hashing, encrypted file storage, and dedup on write
- AES-256-GCM encryption (XChaCha20-Poly1305 fallback) with version-tagged ciphertext for algorithm detection
- 4-tier retention system with 60-second eviction sweep respecting P1 never-evict guarantee
- Block store key derived alongside identity session key on unlock, securely zeroed on lock/quit
- Received DMs persisted as P1_NEVER_EVICT blocks via both WS live and REST history/offline paths
- Full IPC bridge with typed methods exposing blocks namespace to renderer

## Task Commits

Each task was committed atomically:

1. **Task 1: Block store types, crypto, cache, and file-based store** - `8a07317` (feat)
2. **Task 2: Tier eviction, IPC bridge, and key lifecycle integration** - `7730a7d` (feat)

## Files Created/Modified
- `client/src/main/blocks/types.ts` - ContentTier enum, BlockMeta, BlockStoreConfig interfaces, budget constants
- `client/src/main/blocks/crypto.ts` - Block encryption/decryption, Argon2id key derivation, HKDF content keys
- `client/src/main/blocks/cache.ts` - L0 in-memory LRU cache (256MB budget, byte-size tracking)
- `client/src/main/blocks/store.ts` - File-based encrypted block store with CRUD, dedup, tier management
- `client/src/main/blocks/tiers.ts` - Eviction sweep (P4->P3->P2 LRU), TTL expiry checking
- `client/src/main/blocks/index.ts` - Public API orchestrating init, operations, and shutdown
- `client/src/main/ipc/blocks.ts` - 7 IPC handlers bridging renderer to block store
- `client/src/main/db/schema.ts` - Migration 2: block_meta and block_store_config tables
- `client/src/main/ipc/channels.ts` - Added BLOCK_* IPC channel constants
- `client/src/main/ipc/crypto.ts` - Block store key lifecycle integrated with identity unlock/lock
- `client/src/main/ipc/dm.ts` - DM history/offline paths persist to P1 blocks
- `client/src/main/ws/dm-events.ts` - DM live WS path persists to P1 blocks
- `client/src/main/index.ts` - Block handler registration wired into app init
- `client/src/preload/index.ts` - blocks namespace exposed via contextBridge
- `shared/types/ipc-bridge.ts` - BlockStorageUsage, BlockStoreConfig types, blocks in UnitedAPI
- `client/package.json` - Added lru-cache@^11.2.6 dependency

## Decisions Made
- Version-tagged ciphertext (0x01=AES-GCM, 0x02=XChaCha20) prepended to encrypted blocks so decryption auto-detects the algorithm used during encryption
- 2-char hash prefix subdirectories (`blocks/ab/abc123...`) for filesystem performance when storing many block files
- Block store key uses the same Argon2id parameters as identity derivation but a separate dedicated salt stored in block_store_config table
- DM block persistence is fire-and-forget: wrapped in try/catch, does not block or fail the DM delivery flow
- Block data transferred as base64 strings across the IPC boundary (renderer cannot access Buffer natively)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Block store layer complete and ready for Plan 03 (cache cascade) and Plan 04 (UI components)
- All block operations go through the index.ts public API
- Eviction system running and budget-enforced
- HKDF content-derived keys ready for server block communication

## Self-Check: PASSED

All 8 created files verified present. Both task commits (8a07317, 7730a7d) verified in git log.

---
*Phase: 06-content-distribution*
*Completed: 2026-02-26*
