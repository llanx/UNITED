---
phase: 09-milestone-gap-closure
plan: 01
subsystem: api
tags: [rust, axum, invite, rest, validation]

# Dependency graph
requires:
  - phase: 02-server-management
    provides: "Invite system (create, list, delete, join)"
provides:
  - "GET /api/invites/{code} public validation endpoint"
  - "Invite expiry and exhaustion checking"
  - "Server name returned in invite validation response"
affects: [invite-flow, onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Public handler without Claims extractor for unauthenticated access"]

key-files:
  created: []
  modified:
    - server/src/invite/generate.rs
    - server/src/routes.rs

key-decisions:
  - "get_invite uses no Claims extractor -- public endpoint for unauthenticated joiners"
  - "410 GONE for expired and exhausted invites (distinct from 404 NOT FOUND)"
  - "Server name fetched from settings table for invite preview metadata"

patterns-established:
  - "Public handler pattern: omit Claims extractor, place in non-auth route group"

requirements-completed: [SRVR-09]

# Metrics
duration: 1min
completed: 2026-02-27
---

# Phase 09 Plan 01: Invite Validation Endpoint Summary

**GET /api/invites/{code} server endpoint fixing broken invite validation -- returns valid/expired/exhausted status with server name**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-27T01:56:23Z
- **Completed:** 2026-02-27T01:58:19Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `get_invite` handler returning invite validity, expiry, exhaustion status, and server name
- Registered GET route on `/api/invites/{code}` chained with existing DELETE handler
- Verified client path alignment -- no client changes needed, existing `apiGet` call matches exactly

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GET /api/invites/{code} server route** - `a476778` (feat)
2. **Task 2: Register GET route and verify client path alignment** - `7430907` (fix)

## Files Created/Modified
- `server/src/invite/generate.rs` - Added `pub async fn get_invite` with expiry/exhaustion validation and server name lookup
- `server/src/routes.rs` - Registered GET handler on `/api/invites/{code}` in invite_routes (public, no JWT)

## Decisions Made
- Handler is public (no `Claims` extractor) since callers are unauthenticated potential joiners previewing an invite
- Uses 410 GONE for expired and exhausted invites to distinguish from 404 NOT FOUND (code doesn't exist)
- Server name fetched from settings table with empty string fallback if not configured

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Invite validation flow is now end-to-end functional
- Client INVITE_VALIDATE IPC handler works without modification
- Ready for remaining gap closure plans (09-02 through 09-04)

## Self-Check: PASSED

- [x] server/src/invite/generate.rs - FOUND
- [x] server/src/routes.rs - FOUND
- [x] 09-01-SUMMARY.md - FOUND
- [x] Commit a476778 - FOUND
- [x] Commit 7430907 - FOUND

---
*Phase: 09-milestone-gap-closure*
*Completed: 2026-02-27*
