---
phase: 02-server-management
plan: 07
subsystem: ui, ipc, protocol
tags: [electron, react, invite, deep-link, welcome, moderation, websocket, zustand]

# Dependency graph
requires:
  - phase: 02-server-management/04
    provides: invite API endpoints, moderation endpoints
provides:
  - Invite code entry and validation UI (InviteJoin.tsx)
  - Custom protocol handler (united://) for deep link invites
  - Welcome overlay for new server joiners (WelcomeOverlay.tsx)
  - Kick/ban moderation notices (ModerationNotice.tsx)
  - IPC handlers for invite join/validate flows
  - WS close code 4003/4004 handling with moderation notices
affects: [03-p2p-network, chat-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [custom protocol handler, deep link routing, per-server welcome dismissal, severity-based moderation notices]

key-files:
  created:
    - client/src/main/ipc/invite.ts
    - client/src/renderer/src/components/InviteJoin.tsx
    - client/src/renderer/src/components/WelcomeOverlay.tsx
    - client/src/renderer/src/components/ModerationNotice.tsx
  modified:
    - client/src/main/index.ts
    - client/src/renderer/src/App.tsx
    - client/src/renderer/src/pages/JoinServer.tsx
    - client/src/renderer/src/pages/Main.tsx
    - client/src/renderer/src/stores/server.ts
    - client/src/renderer/src/stores/index.ts
    - client/src/renderer/src/hooks/useConnection.ts
    - shared/types/ipc-bridge.ts
    - client/src/preload/index.ts

key-decisions:
  - "Multi-format invite parser handles bare codes, full URLs, and united:// deep links"
  - "Welcome overlay is per-server dismissal stored in SQLite cache"
  - "Kick notice (4004) is amber warning card with rejoin option; ban notice (4003) is red full-screen blocker"
  - "Auto-reconnect prevented for 4003 (ban) but allowed manually for 4004 (kick)"
  - "Custom protocol registered as privileged scheme before app.whenReady()"

patterns-established:
  - "Deep link routing: main process extracts invite code from united:// URL, sends to renderer via IPC"
  - "Severity-based moderation: 4003=full-screen ban, 4004=warning card kick"
  - "Per-server overlay dismissal: serverId→boolean stored in SQLite and hydrated on startup"

requirements-completed: [SRVR-05, SRVR-06, SRVR-08, SRVR-09]

# Metrics
duration: 9min
completed: 2026-02-25
---

# Phase 2 Plan 7: Invite Join Flow & Moderation UX

**Complete invite onboarding path with deep links, welcome overlay, and moderation notices**

## Performance

- **Duration:** 9 min
- **Completed:** 2026-02-25
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 9

## Accomplishments
- Invite IPC module handles join and validate flows with multi-format input parsing
- Custom protocol handler registered for united:// deep links (Windows/Linux/macOS)
- InviteJoin component renders with code/URL input, validation step, and join flow
- JoinServer page supports choose-method screen and deep link pre-fill
- WelcomeOverlay renders when admin enables it, dismissable per server via SQLite cache
- ModerationNotice: kick (amber warning card with rejoin) and ban (red full-screen blocker with reason)
- WS close codes 4003/4004 trigger appropriate notices, auto-reconnect prevented for bans

## Task Commits

Each task was committed atomically:

1. **Task 1: Invite IPC, deep link handler, and join flow** - `b1544ea` (feat)
2. **Task 2: Welcome overlay, moderation notices, and connection UX** - `b70c7be` (feat)

## Files Created
- `client/src/main/ipc/invite.ts` — IPC handlers for invite validate/join, multi-format input parser
- `client/src/renderer/src/components/InviteJoin.tsx` — Invite code entry with validation and join flow
- `client/src/renderer/src/components/WelcomeOverlay.tsx` — Admin-configurable welcome overlay with per-server dismissal
- `client/src/renderer/src/components/ModerationNotice.tsx` — Kick (amber warning) and ban (red full-screen) notices

## Files Modified
- `client/src/main/index.ts` — Custom protocol registration, single instance lock, deep link handling
- `client/src/renderer/src/App.tsx` — Restructured with inner AppRoutes for deep link navigation
- `client/src/renderer/src/pages/JoinServer.tsx` — Choose-method screen, deep link pre-fill
- `client/src/renderer/src/pages/Main.tsx` — Renders WelcomeOverlay and ModerationNotice overlays
- `client/src/renderer/src/stores/server.ts` — Welcome config, dismissal state, moderation notice state
- `client/src/renderer/src/stores/index.ts` — Hydrates welcome dismissal from SQLite cache
- `client/src/renderer/src/hooks/useConnection.ts` — Handles 4003/4004 close codes with moderation notices
- `shared/types/ipc-bridge.ts` — Invite IPC types added
- `client/src/preload/index.ts` — Invite preload bridge added

## Decisions Made
- Multi-format invite parser handles bare codes, full URLs, and united:// deep links
- Welcome overlay per-server dismissal stored in SQLite cache
- Kick=amber warning card with rejoin, Ban=red full-screen blocker
- Auto-reconnect prevented for bans, manual rejoin for kicks

## Deviations from Plan
None — plan executed as written.

## Issues Encountered
- SUMMARY.md and STATE.md updates were blocked by tool permissions — handled by orchestrator

## User Setup Required
None

## Next Phase Readiness
- SRVR-05 (invite codes), SRVR-06 (welcome), SRVR-08 (kick notices), SRVR-09 (ban notices) all satisfied
- Invite flow, moderation UX, and deep linking ready for integration testing
- All Phase 2 server management plans now complete

## Self-Check: PASSED

All 4 created files and 9 modified files exist on disk. Both task commits (b1544ea, b70c7be) verified in git log.

---
*Phase: 02-server-management*
*Completed: 2026-02-25*
