---
phase: 12-wire-client-connection-lifecycle
plan: 02
subsystem: client
tags: [websocket, presence, typing, connection-banner, dead-code-removal, electron, zustand]

# Dependency graph
requires:
  - phase: 12-wire-client-connection-lifecycle
    plan: 01
    provides: AUTH_AUTHENTICATE and AUTH_CONNECT_WS IPC handlers, Welcome.tsx returning-user auth, immediate-first-retry WsClient
provides:
  - usePresence() mounted in Main.tsx for real-time presence and typing events
  - WS auto-connect on /app mount via connectWs() IPC call
  - ConnectionBanner component showing above message input when disconnected >500ms
  - MessageComposer and DmComposer disabled when WS disconnected
  - Dead code removed (useAuth.ts, protocol.ts)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [connection-aware composer pattern (useStore status check), delayed visibility banner (500ms threshold)]

key-files:
  created:
    - client/src/renderer/src/components/ConnectionBanner.tsx
  modified:
    - client/src/renderer/src/pages/Main.tsx
    - client/src/renderer/src/components/ChatView.tsx
    - client/src/renderer/src/components/DmChatView.tsx
    - client/src/renderer/src/components/MessageComposer.tsx
    - client/src/renderer/src/components/DmComposer.tsx
  deleted:
    - client/src/renderer/src/hooks/useAuth.ts
    - client/src/main/ws/protocol.ts

key-decisions:
  - "ConnectionBanner uses 500ms setTimeout threshold to avoid flicker on fast reconnections"
  - "Disconnected placeholder shows 'Reconnecting...' in both channel and DM composers"
  - "isDisconnected check added to handleSend early return (not just disabled prop) for defense-in-depth"

patterns-established:
  - "Connection-aware component: const status = useStore((s) => s.status); const isDisconnected = status !== 'connected'"
  - "Delayed visibility banner: setTimeout for show, immediate clearTimeout for hide"

requirements-completed: [MSG-01, MSG-04, MSG-05, MSG-06, MSG-09, DM-01, VOICE-01, VOICE-02, VOICE-03, P2P-02, APP-03]

# Metrics
duration: 4min
completed: 2026-02-27
---

# Phase 12 Plan 02: Wire Client Connection Lifecycle Summary

**WS auto-connect on /app mount with usePresence, ConnectionBanner for disconnect UX, and connection-aware composers with dead code cleanup**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-27T05:02:42Z
- **Completed:** 2026-02-27T05:06:19Z
- **Tasks:** 2
- **Files modified:** 7 (1 created, 4 modified, 2 deleted)

## Accomplishments
- Main.tsx mounts usePresence() for real-time presence and typing event subscriptions
- Main.tsx triggers connectWs() on mount, activating all WS-dependent features (chat, DM, voice, P2P)
- ConnectionBanner shows above message input in both ChatView and DmChatView when disconnected >500ms
- MessageComposer and DmComposer disabled with "Reconnecting..." placeholder when WS disconnected
- Deleted useAuth.ts (dead orchestration hook, never imported) and protocol.ts (unreachable stubs)
- Confirmed setupVoiceEventListener registered at app startup and P2P auto-start wired to WS connected status

## Task Commits

Each task was committed atomically:

1. **Task 1: Mount usePresence, trigger WS connect, and add ConnectionBanner** - `eb54760` (feat)
2. **Task 2: Disable composers when disconnected and remove dead code** - `7a9d92b` (feat)

## Files Created/Modified
- `client/src/renderer/src/components/ConnectionBanner.tsx` - Thin status banner with 500ms delay threshold
- `client/src/renderer/src/pages/Main.tsx` - Added usePresence() mount and connectWs() useEffect
- `client/src/renderer/src/components/ChatView.tsx` - Renders ConnectionBanner above MessageComposer
- `client/src/renderer/src/components/DmChatView.tsx` - Renders ConnectionBanner above DmComposer
- `client/src/renderer/src/components/MessageComposer.tsx` - Connection-aware: disabled + "Reconnecting..." when disconnected
- `client/src/renderer/src/components/DmComposer.tsx` - Connection-aware: disabled + "Reconnecting..." when disconnected
- `client/src/renderer/src/hooks/useAuth.ts` - DELETED (dead code)
- `client/src/main/ws/protocol.ts` - DELETED (unreachable stubs)

## Decisions Made
- ConnectionBanner uses 500ms setTimeout threshold to avoid flicker on fast reconnections (per CONTEXT.md)
- isDisconnected check added to both handleSend early returns as defense-in-depth alongside disabled textarea prop
- DmComposer placeholder priority: disconnected > key unavailable > normal (disconnected takes precedence)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 11 remaining requirements now functional because WS connection enables their event pipelines
- Phase 12 (final phase) is now complete -- all real-time features reachable from client auth through WS connection

## Self-Check: PASSED

All 8 files verified (6 present, 2 confirmed deleted). Both commit hashes (eb54760, 7a9d92b) confirmed in git log.

---
*Phase: 12-wire-client-connection-lifecycle*
*Completed: 2026-02-27*
