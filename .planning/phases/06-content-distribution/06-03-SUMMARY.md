---
phase: 06-content-distribution
plan: 03
subsystem: p2p, blocks
tags: [libp2p, block-protocol, cache-cascade, content-resolution, promise-any, sha256]

# Dependency graph
requires:
  - phase: 06-01
    provides: "Server block REST API (GET /api/blocks/:hash), HKDF crypto, block metadata"
  - phase: 06-02
    provides: "Client block store (store.ts, crypto.ts, cache.ts, tiers.ts), L0 memory cache, encrypted file I/O"
  - phase: 03-p2p-networking
    provides: "Client libp2p node, peer discovery via WS directory, gossipsub mesh"
provides:
  - "Custom /united/block/1.0.0 libp2p protocol for peer-to-peer block exchange"
  - "5-layer cache cascade resolver: L0 memory -> L1 local -> L2 hot peers -> L3 peer directory -> L4 server"
  - "getBlock(hash) canonical content resolution API"
  - "BLOCK_RESOLVE IPC handler for renderer content requests"
  - "fetchFromHotPeers parallel peer fetch with first-responder-wins"
affects: [07-media-and-prefetching, 06-04]

# Tech tracking
tech-stack:
  added: [it-length-prefixed-stream]
  patterns: [cache-cascade, first-responder-wins, length-prefixed-protocol, content-addressed-fetch]

key-files:
  created:
    - client/src/main/blocks/protocol.ts
    - client/src/main/blocks/cascade.ts
  modified:
    - client/src/main/blocks/index.ts
    - client/src/main/p2p/node.ts
    - client/src/main/ipc/blocks.ts
    - client/src/main/ipc/channels.ts

key-decisions:
  - "Server GET /api/blocks/:hash returns plaintext (server decrypts before sending) -- no client-side HKDF decryption needed for L4"
  - "L3 reuses WS-based peer directory (discoverAndConnectPeers) rather than DHT -- v1 design per plan"
  - "it-length-prefixed-stream already transitive dep from libp2p -- added as explicit dependency for direct import stability"
  - "AbortController cancels remaining peer requests after first Promise.any success"

patterns-established:
  - "Cache cascade pattern: ordered fallback layers with local persistence at each level"
  - "Block protocol pattern: LP stream request/response with hash verification"
  - "First-responder-wins: Promise.any across parallel peer fetches"

requirements-completed: [P2P-03, P2P-09]

# Metrics
duration: 6min
completed: 2026-02-26
---

# Phase 6 Plan 03: Block Protocol and Cache Cascade Summary

**Custom /united/block/1.0.0 libp2p protocol with 5-layer cache cascade (memory, local, hot peers, peer directory, server fallback) using first-responder-wins parallel peer fetching**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-26T08:13:49Z
- **Completed:** 2026-02-26T08:20:26Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Custom libp2p block exchange protocol (/united/block/1.0.0) with length-prefixed wire format
- 5-layer cache cascade resolver that transparently resolves content from fastest available source
- Parallel peer fetching via Promise.any with SHA-256 hash verification on all received blocks
- BLOCK_RESOLVE IPC handler bridges cascade to renderer for content requests

## Task Commits

Each task was committed atomically:

1. **Task 1: Custom libp2p block exchange protocol** - `663a174` (feat)
2. **Task 2: 5-layer cache cascade and server fallback** - `82c2916` (feat)

## Files Created/Modified
- `client/src/main/blocks/protocol.ts` - Block exchange protocol handler, peer fetcher, parallel hot-peer fetch
- `client/src/main/blocks/cascade.ts` - 5-layer cache cascade resolver with progress callback variant
- `client/src/main/blocks/index.ts` - Added getBlock() canonical API, re-exports cascade functions
- `client/src/main/p2p/node.ts` - Register block protocol handler on P2P node startup
- `client/src/main/ipc/blocks.ts` - Added BLOCK_RESOLVE handler (cascade-backed, base64 IPC)
- `client/src/main/ipc/channels.ts` - Added BLOCK_RESOLVE channel constant

## Decisions Made
- Server GET /api/blocks/:hash returns plaintext data (server performs HKDF decryption before responding), so L4 cascade layer does not need client-side HKDF decryption. Plan described server returning encrypted blocks, but server code decrypts before sending.
- L3 peer directory discovery reuses existing `discoverAndConnectPeers()` from Phase 3 rather than implementing separate DHT. This is the correct v1 approach per the plan notes.
- `it-length-prefixed-stream` was already a transitive dependency via libp2p but added as explicit dependency for import stability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] L4 server returns plaintext, not encrypted blocks**
- **Found during:** Task 2 (cascade L4 implementation)
- **Issue:** Plan stated "Server returns encrypted block (content-derived HKDF encryption)" and "Client decrypts using deriveContentKey(hash) from crypto.ts." However, server's GET /api/blocks/:hash route calls `server_decrypt_block()` before responding -- the response is plaintext.
- **Fix:** L4 cascade layer accepts server response directly as plaintext block data without client-side HKDF decryption. The deriveContentKey function exists in crypto.ts but is not needed for L4 (it's used for upload encryption).
- **Files modified:** client/src/main/blocks/cascade.ts
- **Verification:** TypeScript compiles, cascade L4 correctly persists plaintext data
- **Committed in:** 82c2916 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug -- plan described incorrect server behavior)
**Impact on plan:** Correct behavior, no scope creep. The cascade correctly handles the server's actual response format.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Block protocol and cascade are complete, ready for Phase 6 Plan 04 (storage UI, seeding dashboard)
- getBlock(hash) is the canonical content resolution API for Phase 7 media rendering
- BLOCK_RESOLVE IPC handler available for renderer content requests

---
*Phase: 06-content-distribution*
*Completed: 2026-02-26*
