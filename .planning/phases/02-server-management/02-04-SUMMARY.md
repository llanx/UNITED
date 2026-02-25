---
phase: 02-server-management
plan: 04
subsystem: api
tags: [axum, sqlite, moderation, kick, ban, invite, landing-page]

requires:
  - phase: 02-server-management
    provides: "Channel CRUD (02-02), role CRUD (02-03), permissions, broadcast helpers, force_close_user"
provides:
  - "Kick endpoint with WS force-close (4004)"
  - "Ban/unban endpoints with fingerprint-based blocking and WS force-close (4003)"
  - "Temporary bans with lazy expiry cleanup"
  - "Ban check on WS connect preventing reconnection"
  - "Invite generation (8-char alphanumeric codes with max_uses and expiration)"
  - "Invite consumption during registration (atomic SQL)"
  - "HTML landing page with deep link (united://invite/{code})"
  - "Invite-only registration mode support"
affects: [02-06-PLAN, 02-07-PLAN]

tech-stack:
  added: []
  patterns: [atomic invite consumption SQL, lazy ban expiry cleanup, ban check on WS connect]

key-files:
  created:
    - server/src/moderation/mod.rs
    - server/src/moderation/kick.rs
    - server/src/moderation/ban.rs
    - server/src/invite/mod.rs
    - server/src/invite/generate.rs
    - server/src/invite/validate.rs
    - server/src/invite/landing.rs
    - server/tests/moderation_test.rs
    - server/tests/invite_test.rs
  modified:
    - server/src/lib.rs
    - server/src/main.rs
    - server/src/routes.rs
    - server/src/identity/registration.rs
    - server/src/ws/handler.rs

key-decisions:
  - "Ban check added to WS handler after JWT validation, before accepting connection"
  - "Invite consumption via atomic SQL: UPDATE WHERE use_count < max_uses"
  - "Landing page is inline HTML (no template engine) with html_escape helper"
  - "invite_code optional field added to RegisterApiRequest"

patterns-established:
  - "Moderation: kick = soft (4004, can rejoin), ban = hard (4003, fingerprint-based)"
  - "Lazy expiry: DELETE expired bans on each check_ban() call"
  - "Public routes: invite landing page at /invite/{code} with no auth"

requirements-completed: [SRVR-05, SRVR-06, SRVR-08, SRVR-09]

duration: 10min
completed: 2026-02-25
---

# Phase 2 Plan 4: Moderation & Invites Summary

**Kick/ban moderation with WS force-close, invite system with atomic consumption, HTML landing page, and invite-only mode**

## Performance

- **Duration:** 10 min
- **Tasks:** 2 (TDD: tests first, then implementation)
- **Files modified:** 14

## Accomplishments
- Kick: force-close WS with 4004, user can rejoin
- Ban/unban: fingerprint-based with optional reason and expiration, WS close 4003
- Temporary bans with lazy expiry cleanup
- Ban check on WS connect prevents reconnection
- Invite generation: 8-char alphanumeric with max_uses and expiration
- Atomic invite consumption during registration
- HTML landing page with server info and united:// deep link
- Invite-only registration mode
- 14 integration tests all passing (7 moderation + 7 invite)

## Task Commits

1. **Task 1: Add failing tests** - `e36d7a8` (test)
2. **Task 2: Implement moderation and invites** - `561140c` (feat)

## Files Created/Modified
- `server/src/moderation/kick.rs` - Kick endpoint
- `server/src/moderation/ban.rs` - Ban/unban/list_bans/check_ban
- `server/src/invite/generate.rs` - Invite CRUD (create, list, delete)
- `server/src/invite/validate.rs` - Atomic invite consumption
- `server/src/invite/landing.rs` - HTML landing page
- `server/src/ws/handler.rs` - Ban check on WS connect
- `server/src/identity/registration.rs` - invite_code field, consume_invite call
- `server/src/routes.rs` - Moderation, invite, and landing page routes
- `server/tests/moderation_test.rs` - 7 moderation tests
- `server/tests/invite_test.rs` - 7 invite tests

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check: PASSED

---
*Phase: 02-server-management*
*Completed: 2026-02-25*
