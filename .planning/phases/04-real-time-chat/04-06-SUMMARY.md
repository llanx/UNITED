---
phase: 04-real-time-chat
plan: 06
subsystem: chat, ui
tags: [presence, member-list, message-id, reactions, pubkey, sqlite-rowid]

# Dependency graph
requires:
  - phase: 04-real-time-chat
    provides: "MemberResponse API, presence store, chat message CRUD, reactions"
provides:
  - "MemberResponse with pubkey field (server through client)"
  - "Presence lookup using pubkey instead of UUID"
  - "Consistent integer message IDs across create, broadcast, and history"
affects: [05-dm-system, 06-content-distribution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DB row ID as canonical message identifier (not application-generated UUID)"
    - "MemberResponse carries pubkey for UNITED identity linkage"

key-files:
  created: []
  modified:
    - server/src/roles/assignment.rs
    - server/src/chat/messages.rs
    - shared/types/ipc-bridge.ts
    - client/src/renderer/src/components/MemberListSidebar.tsx
    - client/src/renderer/src/components/UserProfilePopup.tsx

key-decisions:
  - "Use lower(hex(public_key)) SQL expression for pubkey field in MemberResponse"
  - "Replace UUIDv7 with last_insert_rowid() for message ID consistency"
  - "UserProfilePopup displays pubkey instead of UUID (UNITED identity-first)"

patterns-established:
  - "MemberResponse.pubkey as bridge between REST member data and pubkey-keyed stores"

requirements-completed: [MSG-06]

# Metrics
duration: 4min
completed: 2026-02-26
---

# Phase 4 Plan 6: Gap Closure Summary

**Fix presence display by adding pubkey to MemberResponse and fix message ID mismatch between REST create and history paths**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-26T04:38:53Z
- **Completed:** 2026-02-26T04:43:14Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Presence dots now work in MemberListSidebar by using member.pubkey for presence store lookup
- Message IDs are consistent across create (POST), broadcast (WS), and history (GET) -- all use integer DB row ID
- UserProfilePopup displays and copies the user's public key instead of the server-assigned UUID
- Reactions load correctly for REST-created messages (ID format matches between create and history)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pubkey to MemberResponse and fix presence lookup** - `1af6e9c` (fix)
2. **Task 2: Fix message ID consistency between create and history paths** - `079ead4` (fix)

## Files Created/Modified
- `server/src/roles/assignment.rs` - Added pubkey field to MemberResponse struct, updated SQL to include lower(hex(public_key))
- `server/src/chat/messages.rs` - Replaced UUIDv7 with last_insert_rowid() for message ID, removed unused uuid import
- `shared/types/ipc-bridge.ts` - Added pubkey field to MemberResponse TypeScript interface
- `client/src/renderer/src/components/MemberListSidebar.tsx` - Fixed presence lookup to use member.pubkey, updated avatar hue to use pubkey
- `client/src/renderer/src/components/UserProfilePopup.tsx` - Updated hue, fingerprint display, and copy action to use member.pubkey

## Decisions Made
- Used `lower(hex(public_key))` SQL expression to match existing pubkey encoding convention (hex, lowercase)
- Replaced UUIDv7 with `last_insert_rowid()` rather than changing history to return UUIDs -- integer row IDs are simpler and already used by reactions and edit/delete endpoints
- Updated UserProfilePopup to show pubkey instead of UUID since UNITED identity is pubkey-centric

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 gap closure complete -- all verification items resolved
- Both presence display and message ID consistency verified through builds and tests
- Ready to proceed to Phase 5 (DM System)

## Self-Check: PASSED

All 6 modified/created files verified on disk. Both task commits (1af6e9c, 079ead4) verified in git log.

---
*Phase: 04-real-time-chat*
*Completed: 2026-02-26*
