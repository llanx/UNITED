---
phase: 12-wire-client-connection-lifecycle
plan: 01
subsystem: auth
tags: [ipc, challenge-response, jwt, websocket, reconnect, electron]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: challenge-response auth, JWT tokens, WsClient, preload bridge
provides:
  - AUTH_AUTHENTICATE IPC handler for challenge-response auth from renderer
  - AUTH_CONNECT_WS IPC handler for WebSocket connection from renderer
  - Welcome.tsx calls authenticateToServer before navigating to /app
  - Immediate-first-retry WsClient backoff schedule
affects: [12-02 (Main.tsx WS connection hook, usePresence mount)]

# Tech tracking
tech-stack:
  added: []
  patterns: [IPC handler for cross-process auth orchestration, immediate-first-retry reconnect]

key-files:
  created: []
  modified:
    - client/src/main/ipc/channels.ts
    - client/src/main/ipc/connection.ts
    - client/src/main/ipc/auth.ts
    - shared/types/ipc-bridge.ts
    - client/src/preload/index.ts
    - client/src/main/ws/client.ts
    - client/src/renderer/src/pages/Welcome.tsx

key-decisions:
  - "storeTokens exported from auth.ts (was private) for cross-module import by connection.ts"
  - "Immediate first retry (0ms) via attempt===0 check in scheduleReconnect, then exponential backoff from attempt-1"
  - "Auth failure on returning-user unlock keeps user on Welcome screen with error (no navigation to /app)"
  - "Zustand store populated with server context before /app navigation (serverId, serverUrl, name, etc.)"

patterns-established:
  - "IPC auth bridge: renderer calls authenticateToServer(url) -> main performs challenge-response -> stores JWT"
  - "Reconnect schedule: immediate -> 1s -> 2s -> 4s -> 8s -> 16s -> 30s cap (never give up)"

requirements-completed: [SEC-02]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 12 Plan 01: Wire Client Connection Lifecycle Summary

**IPC handlers for challenge-response auth and WS connection, wired into Welcome.tsx returning-user flow with immediate-first-retry reconnect**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T04:56:25Z
- **Completed:** 2026-02-27T04:59:09Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Two new IPC handlers (AUTH_AUTHENTICATE, AUTH_CONNECT_WS) bridge renderer to main-process auth
- Returning user flow now calls challenge-response auth before navigating to /app
- WsClient immediate-first-retry matches CONTEXT.md reconnection schedule
- storeTokens exported for cross-module use between auth.ts and connection.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Add IPC handlers for auth and WS connection** - `2e76281` (feat)
2. **Task 2: Wire auth into Welcome.tsx and verify JoinServer.tsx flow** - `6e25b7b` (feat)

## Files Created/Modified
- `client/src/main/ipc/channels.ts` - Added AUTH_AUTHENTICATE and AUTH_CONNECT_WS constants
- `client/src/main/ipc/connection.ts` - Two new ipcMain.handle registrations for auth and WS connect
- `client/src/main/ipc/auth.ts` - Exported storeTokens function
- `shared/types/ipc-bridge.ts` - Added authenticateToServer and connectWs to UnitedAPI interface
- `client/src/preload/index.ts` - Exposed authenticateToServer and connectWs via contextBridge
- `client/src/main/ws/client.ts` - Immediate-first-retry in scheduleReconnect (attempt===0 -> 0ms delay)
- `client/src/renderer/src/pages/Welcome.tsx` - handleUnlock calls authenticateToServer, sets Zustand state

## Decisions Made
- Exported storeTokens from auth.ts rather than duplicating token storage logic in connection.ts
- Immediate first retry implemented via attempt===0 guard with subsequent attempts offset by -1 for calculateReconnectDelay
- maxAttempts already Infinity in DEFAULT_RECONNECT_CONFIG -- no change needed for "never give up"
- JoinServer.tsx required no changes -- JWT already stored by register(), server URL already set by connectToServer()

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AUTH_AUTHENTICATE and AUTH_CONNECT_WS handlers ready for Plan 02's useConnection hook in Main.tsx
- Plan 02 will wire connectWs() call when /app mounts, mount usePresence(), and add connection status banner

## Self-Check: PASSED

All 8 files verified present. Both commit hashes (2e76281, 6e25b7b) confirmed in git log.

---
*Phase: 12-wire-client-connection-lifecycle*
*Completed: 2026-02-27*
