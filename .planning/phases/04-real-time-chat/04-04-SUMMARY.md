---
phase: 04-real-time-chat
plan: 04
subsystem: chat, presence, ui
tags: [presence, dashmap, websocket, zustand, react, protobuf, typing-indicators]

# Dependency graph
requires:
  - phase: 04-01
    provides: "Chat proto schemas, WS envelope fields 120-149, message persistence"
  - phase: 04-02
    provides: "Presence Zustand slice, usePresence hook, WS chat-event forwarder, typing timeout"
provides:
  - "Server-side in-memory presence tracking (DashMap) with WS broadcast on connect/disconnect"
  - "REST endpoints: GET/POST /api/presence, POST /api/typing"
  - "PresenceIndicator component with colored dots (green/yellow/red/gray)"
  - "MemberListSidebar with status-grouped member list and presence dots"
  - "UserProfilePopup with avatar, roles, presence, pubkey fingerprint"
  - "Member list toggle in ChatView channel header"
affects: [04-05, 05-dm-system]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Presence snapshot sent via WS on connect (no separate REST fetch needed)"
    - "Multi-device presence: only broadcast OFFLINE on last connection disconnect"
    - "Pubkey hash-derived HSL hue for avatar colors (deterministic, no server lookup)"

key-files:
  created:
    - "server/src/chat/presence.rs"
    - "client/src/renderer/src/components/PresenceIndicator.tsx"
    - "client/src/renderer/src/components/MemberListSidebar.tsx"
    - "client/src/renderer/src/components/UserProfilePopup.tsx"
  modified:
    - "server/src/state.rs"
    - "server/src/ws/actor.rs"
    - "server/src/chat/broadcast.rs"
    - "server/src/routes.rs"
    - "shared/proto/presence.proto"
    - "client/src/renderer/src/components/MainContent.tsx"
    - "client/src/renderer/src/components/ChatView.tsx"
    - "client/src/renderer/src/components/MemberList.tsx"
    - "client/src/main/ws/chat-events.ts"

key-decisions:
  - "Presence snapshot sent on WS connect instead of separate REST fetch — reduces round trips and integrates with existing push event flow"
  - "display_name added to PresenceUpdate protobuf message (field 4) — client needs name for rendering without extra DB lookups"
  - "Multi-device presence: OFFLINE only broadcast when last connection for a user is closed (ConnectionRegistry count check)"
  - "MemberList component refactored to read from Zustand store directly (no props) — fixes pre-existing type mismatch in MainContent"

patterns-established:
  - "Presence tracking via DashMap<String, PresenceInfo> on AppState — ephemeral, no DB persistence needed"
  - "WS actor lifecycle hooks: register -> presence snapshot -> message loop -> unregister -> conditional OFFLINE"
  - "Status grouping pattern: Online > Away > DND > Offline with alphabetical sort within groups"

requirements-completed: [MSG-05, MSG-06, APP-05]

# Metrics
duration: 20min
completed: 2026-02-26
---

# Phase 4 Plan 04: Presence System and Member List Summary

**Server-side presence tracking with DashMap, WS broadcast on connect/disconnect, MemberListSidebar with status-grouped members, PresenceIndicator colored dots, and UserProfilePopup with role badges and pubkey fingerprint**

## Performance

- **Duration:** 20 min
- **Started:** 2026-02-26T03:34:42Z
- **Completed:** 2026-02-26T03:55:02Z
- **Tasks:** 2
- **Files modified:** 21

## Accomplishments
- Server tracks user presence in-memory (DashMap), broadcasts ONLINE on WS connect and OFFLINE on last-connection disconnect
- REST endpoints for get/set presence and typing indicators with JWT auth
- MemberListSidebar shows users grouped by presence status (Online, Away, DND, Offline) with colored dots, role badges, and alphabetical sorting
- UserProfilePopup displays avatar, name, roles, presence indicator, and copyable pubkey fingerprint
- PresenceIndicator component renders green/yellow/red/gray dots in sm/md sizes with optional text labels
- Member list sidebar integrated alongside ChatView with header toggle button

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side presence tracking and WS broadcast** - `2367214` (feat)
2. **Task 2: Member list sidebar, presence indicator, and user profile popup** - `ebeb4cf` (feat)

## Files Created/Modified
- `server/src/chat/presence.rs` - In-memory presence store, set/get/broadcast, REST endpoints (GET/POST /api/presence, POST /api/typing)
- `server/src/chat/broadcast.rs` - Added broadcast_presence_update and broadcast_typing_indicator helpers
- `server/src/chat/mod.rs` - Added pub mod presence
- `server/src/state.rs` - Added presence: Arc<DashMap<String, PresenceInfo>> to AppState
- `server/src/ws/actor.rs` - Presence broadcast on connect/disconnect, snapshot to new clients
- `server/src/routes.rs` - Added presence routes (GET/POST /api/presence, POST /api/typing)
- `server/src/main.rs` - Initialize presence DashMap in AppState
- `shared/proto/presence.proto` - Added display_name field to PresenceUpdate message
- `client/src/main/ws/chat-events.ts` - Forward displayName from protobuf in presence events
- `client/src/renderer/src/components/PresenceIndicator.tsx` - Colored dot component with status colors and labels
- `client/src/renderer/src/components/MemberListSidebar.tsx` - Right sidebar with status grouping and UserProfilePopup integration
- `client/src/renderer/src/components/UserProfilePopup.tsx` - Profile popup with avatar, roles, presence, pubkey
- `client/src/renderer/src/components/MainContent.tsx` - Integrated MemberListSidebar alongside ChatView, added toggle state
- `client/src/renderer/src/components/ChatView.tsx` - Accept toggle props, member list toggle button in channel header
- `client/src/renderer/src/components/MemberList.tsx` - Refactored to read from Zustand store directly
- `server/tests/*.rs` - Updated 6 test files with new presence field on AppState

## Decisions Made
- Presence snapshot sent on WS connect instead of separate REST fetch — reduces round trips and integrates with existing push event flow
- display_name added to PresenceUpdate protobuf message (field 4) — client needs name for rendering without extra DB lookups
- Multi-device presence: OFFLINE only broadcast when last connection for a user is closed (ConnectionRegistry count check)
- MemberList component refactored to read from Zustand store directly — fixes pre-existing type mismatch in MainContent

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed WS tests expecting no messages on connect**
- **Found during:** Task 1 (Server-side presence tracking)
- **Issue:** WS tests expected no messages after connection, but presence snapshot now sends binary messages on connect
- **Fix:** Added drain_presence_messages helper to WS tests; all 5 tests updated to drain presence before assertions
- **Files modified:** server/tests/ws_test.rs
- **Verification:** All 42 tests pass including 5 WS tests
- **Committed in:** 2367214 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed displayName empty string in presence event forwarder**
- **Found during:** Task 1 (Protobuf update)
- **Issue:** chat-events.ts was hardcoding displayName: '' for presence events; PresenceUpdate proto lacked display_name field
- **Fix:** Added display_name field to PresenceUpdate proto, updated chat-events.ts to forward update.displayName
- **Files modified:** shared/proto/presence.proto, client/src/main/ws/chat-events.ts
- **Verification:** TypeScript compiles, displayName now forwarded from protobuf
- **Committed in:** 2367214 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed MemberList component type mismatch**
- **Found during:** Task 2 (MainContent integration)
- **Issue:** MemberList was called without props in MainContent but component expected { members, roles } props — pre-existing type error
- **Fix:** Refactored MemberList to read from Zustand store directly (same pattern as other store-connected components)
- **Files modified:** client/src/renderer/src/components/MemberList.tsx
- **Verification:** TypeScript compiles with no errors
- **Committed in:** ebeb4cf (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Presence system fully operational: server tracks, broadcasts, client renders
- MemberListSidebar ready for Phase 5 DM integration (currently "Message" button hidden)
- Plan 04-05 (mentions, unread tracking, notifications) can proceed — all presence and typing infrastructure is in place

## Self-Check: PASSED

- All 4 created files verified present on disk
- Commit 2367214 (Task 1) found in git log
- Commit ebeb4cf (Task 2) found in git log
- Server builds and all 42 tests pass
- Client TypeScript compiles with no errors

---
*Phase: 04-real-time-chat*
*Completed: 2026-02-26*
