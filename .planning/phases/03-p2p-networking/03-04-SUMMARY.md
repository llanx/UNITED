---
phase: 03-p2p-networking
plan: 04
subsystem: p2p
tags: [libp2p, peer-discovery, reconnection, backoff, peerStore]

# Dependency graph
requires:
  - phase: 03-p2p-networking
    provides: "Client libp2p node with gossipsub, peer discovery, reconnection framework"
provides:
  - "Working exponential backoff reconnection that actually dials disconnected remote peers"
  - "Sub-second mesh recovery path via peerStore multiaddr lookup"
affects: [04-real-time-chat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "peerIdFromString for converting string PeerId back to PeerId object for peerStore lookups"

key-files:
  created: []
  modified:
    - "client/src/main/p2p/discovery.ts"

key-decisions:
  - "No new dependencies added -- peerIdFromString already available as transitive dep from @libp2p/peer-id"

patterns-established:
  - "Remote peer dial pattern: peerIdFromString -> peerStore.get -> iterate addresses -> node.dial"

requirements-completed: [P2P-02, SEC-06, APP-02]

# Metrics
duration: 1min
completed: 2026-02-26
---

# Phase 3 Plan 4: Fix P2P Reconnection Bug Summary

**Fixed scheduleReconnect to dial disconnected remote peer via peerStore multiaddr lookup instead of querying local node**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-26T02:37:59Z
- **Completed:** 2026-02-26T02:39:06Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Fixed critical bug where `scheduleReconnect()` was querying `node.peerId` (self) instead of the disconnected remote peer
- Added `peerIdFromString` import and usage to parse `state.peerId` string into a PeerId object
- Implemented actual multiaddr dial loop -- iterates `peerData.addresses` and calls `node.dial(addr.multiaddr)` for each
- Preserved all existing behavior: backoff timing, directory fallback at MAX_RECONNECT_BEFORE_DIRECTORY, cleanup on peer:connect

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix scheduleReconnect to dial disconnected remote peer** - `893c9fe` (fix)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `client/src/main/p2p/discovery.ts` - Fixed `scheduleReconnect()` to parse remote PeerId, look up multiaddrs in peerStore, and dial each address during backoff

## Decisions Made
- No new dependencies added -- `peerIdFromString` from `@libp2p/peer-id` is already a transitive dependency used in `identity.ts`
- Kept sequential multiaddr dialing (try each address in order) rather than parallel -- simpler, lower resource usage, consistent with `discoverAndConnectPeers` pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Fast-recovery reconnection path now functional (1s, 2s, 4s... backoff with actual dial attempts)
- Ready for Phase 4 real-time chat where dropped connections need sub-second recovery
- Directory fallback still serves as ultimate safety net after ~2 minutes of failed direct dials

## Self-Check: PASSED

- FOUND: client/src/main/p2p/discovery.ts
- FOUND: .planning/phases/03-p2p-networking/03-04-SUMMARY.md
- FOUND: commit 893c9fe

---
*Phase: 03-p2p-networking*
*Completed: 2026-02-26*
