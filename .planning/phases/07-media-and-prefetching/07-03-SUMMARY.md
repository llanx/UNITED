---
phase: 07-media-and-prefetching
plan: 03
subsystem: ui, p2p
tags: [zustand, ipc, prefetch, network-stats, status-bar, libp2p]

# Dependency graph
requires:
  - phase: 06-content-distribution
    provides: "Block protocol, cascade resolution, block store"
  - phase: 07-01
    provides: "Media upload infrastructure, block_refs, blurhash"
provides:
  - "Network stats tracking (bytesUploaded, bytesDownloaded, blocksSeeded, rolling speed)"
  - "Stats IPC with 5s periodic push to renderer"
  - "NetworkStats dashboard in Settings (transfer totals, ratio, storage tier breakdown)"
  - "StatusBarIndicator (compact optional speed display, off by default)"
  - "Channel hover prefetch (200ms debounce, 20 messages)"
  - "App launch prefetch (last-viewed + most active channel)"
  - "Scroll prefetch (70% threshold triggers older message loading)"
affects: [08-voice-video]

# Tech tracking
tech-stack:
  added: []
  patterns: [stats-push-interval, hover-debounce-prefetch, app-launch-prefetch, scroll-threshold-prefetch]

key-files:
  created:
    - client/src/main/ipc/stats.ts
    - client/src/renderer/src/stores/network.ts
    - client/src/renderer/src/hooks/useNetworkStats.ts
    - client/src/renderer/src/hooks/usePrefetch.ts
    - client/src/renderer/src/components/NetworkStats.tsx
    - client/src/renderer/src/components/StatusBarIndicator.tsx
  modified:
    - client/src/main/blocks/protocol.ts
    - client/src/main/ipc/channels.ts
    - client/src/main/index.ts
    - client/src/preload/index.ts
    - shared/types/ipc-bridge.ts
    - client/src/renderer/src/stores/index.ts
    - client/src/renderer/src/stores/ui.ts
    - client/src/renderer/src/stores/messages.ts
    - client/src/renderer/src/components/MainContent.tsx
    - client/src/renderer/src/components/ChannelList.tsx
    - client/src/renderer/src/components/ChatView.tsx

key-decisions:
  - "Rolling 10s window for upload/download speed calculation (prune old entries on read)"
  - "5s push interval for stats from main to renderer (gated on window.isDestroyed check)"
  - "Status bar off by default, persisted to localStorage (per CONTEXT.md)"
  - "prefetchedChannels Set prevents redundant fetches within session"
  - "App launch prefetch reads last-viewed channel from localStorage"
  - "70% scroll prefetch uses 2s debounce to prevent burst loading"
  - "Module-level flag prevents double execution of app launch prefetch in React Strict Mode"

patterns-established:
  - "Stats push interval: main process setInterval with isDestroyed guard and before-quit cleanup"
  - "Hover prefetch: 200ms debounced setTimeout with cancel on mouseLeave"
  - "App launch prefetch: module-level flag for one-time execution across React Strict Mode"

requirements-completed: [P2P-07, P2P-08]

# Metrics
duration: 8min
completed: 2026-02-26
---

# Phase 7 Plan 3: Stats Dashboard and Prefetching Summary

**Network stats dashboard with private transfer/seeding metrics and predictive prefetching via channel hover, app launch, and scroll-ahead**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26T21:30:57Z
- **Completed:** 2026-02-26T21:38:41Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Network stats tracked in block protocol: bytes uploaded/downloaded, blocks seeded, rolling 10s speed window
- Full seeding dashboard in Settings: transfer totals, ratio, blocks seeded, storage tier breakdown (P1/P2/P3/P4), status bar toggle
- Predictive prefetching: 200ms debounced channel hover, last-viewed + most active on app launch, 70% scroll threshold for older messages
- All stats private only, all prefetching text + metadata only

## Task Commits

Each task was committed atomically:

1. **Task 1: Network stats tracking, IPC bridge, and seeding dashboard** - `da5d6b5` (feat)
2. **Task 2: Predictive prefetching -- channel hover, scroll position, app launch** - `328dfd5` (feat)

## Files Created/Modified

- `client/src/main/blocks/protocol.ts` - Added byte tracking counters and getNetworkStats()
- `client/src/main/ipc/stats.ts` - Stats IPC handlers with 5s push interval
- `client/src/main/ipc/channels.ts` - Added STATS_GET_NETWORK, STATS_GET_STORAGE, PUSH_NETWORK_STATS constants
- `client/src/main/index.ts` - Registered stats handlers after mainWindow creation
- `client/src/preload/index.ts` - Added stats namespace to contextBridge
- `shared/types/ipc-bridge.ts` - Added NetworkStats interface and stats namespace to UnitedAPI
- `client/src/renderer/src/stores/network.ts` - NetworkSlice with showStatusBar localStorage persistence
- `client/src/renderer/src/stores/index.ts` - Added NetworkSlice to RootStore
- `client/src/renderer/src/stores/ui.ts` - Added 'network-stats' to activePanel union
- `client/src/renderer/src/stores/messages.ts` - Added prefetchMessages action and prefetchedChannels Set
- `client/src/renderer/src/hooks/useNetworkStats.ts` - Hook subscribing to stats push events
- `client/src/renderer/src/hooks/usePrefetch.ts` - Hover prefetch with debounce and app launch prefetch
- `client/src/renderer/src/components/NetworkStats.tsx` - Full stats dashboard with tier bar
- `client/src/renderer/src/components/StatusBarIndicator.tsx` - Compact speed indicator
- `client/src/renderer/src/components/MainContent.tsx` - Integrated stats hook, panel, status bar
- `client/src/renderer/src/components/ChannelList.tsx` - Added onMouseEnter/onMouseLeave prefetch handlers
- `client/src/renderer/src/components/ChatView.tsx` - Added scroll prefetch, app launch prefetch, last-viewed persistence

## Decisions Made

- Rolling 10s window for speed calculation: prune entries older than 10s on read, sum remaining, divide by 10
- 5s push interval for stats: balance between freshness and overhead, matches P2P stats pattern
- Status bar off by default per CONTEXT.md, toggled via checkbox in NetworkStats panel
- prefetchedChannels Set (not Map) is sufficient to prevent redundant fetches
- App launch prefetch uses module-level boolean flag (not useRef) to survive React Strict Mode double-mount
- 70% scroll threshold with 2s time-based debounce (not scroll-event count) for reliable rate limiting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 7 complete: media upload (07-01), inline rendering (07-02), stats + prefetch (07-03)
- Ready for Phase 8: Voice and Video
- All content distribution, media, and prefetch infrastructure is in place

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.

---
*Phase: 07-media-and-prefetching*
*Completed: 2026-02-26*
