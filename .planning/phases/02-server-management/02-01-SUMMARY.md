---
phase: 02-server-management
plan: 01
subsystem: database, api, infra
tags: [sqlite, bitflags, protobuf, prost, websocket, permissions, migration]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "SQLite DB with Migration 1, WS actor pattern, ConnectionRegistry, proto module structure"
provides:
  - "Migration 2 with 6 new tables (categories, channels, roles, user_roles, bans, invites)"
  - "Permissions bitflags type with 5 named flags and require_permission() guard"
  - "4 new .proto files (channels, roles, moderation, invite) compiled via prost"
  - "WS envelope extended with Phase 2 payload variants (fields 50-105)"
  - "broadcast_to_all, send_to_user, force_close_user WebSocket helpers"
  - "Placeholder route groups for channels, roles, moderation, invites"
  - "Model structs for Category, Channel, Role, Ban, Invite"
affects: [02-02-PLAN, 02-03-PLAN, 02-04-PLAN, 02-05-PLAN]

# Tech tracking
tech-stack:
  added: [bitflags 2]
  patterns: [permission bitflags with ADMIN-implies-all, WS broadcast helpers, reserved field number blocks in protobuf envelope]

key-files:
  created:
    - server/src/roles/mod.rs
    - server/src/roles/permissions.rs
    - server/src/ws/broadcast.rs
    - shared/proto/channels.proto
    - shared/proto/roles.proto
    - shared/proto/moderation.proto
    - shared/proto/invite.proto
  modified:
    - server/Cargo.toml
    - server/src/db/migrations.rs
    - server/src/db/models.rs
    - server/src/main.rs
    - server/src/lib.rs
    - server/build.rs
    - server/src/proto/mod.rs
    - server/src/ws/mod.rs
    - server/src/routes.rs
    - shared/proto/ws.proto

key-decisions:
  - "WS envelope field allocation: channels 50-59, roles 60-69, moderation 70-79, invites 80-89, overflow 100-105"
  - "Channel/category events that overflow 50-59 range use fields 100-104"
  - "Role removed event uses field 105 (overflow from 60-69 range)"

patterns-established:
  - "Permission bitflags: u32 with SEND_MESSAGES, MANAGE_CHANNELS, KICK_MEMBERS, BAN_MEMBERS, ADMIN flags"
  - "require_permission() guard: reads roles from DB in real-time, not from JWT claims"
  - "WS broadcast pattern: encode once, clone Message for each sender"
  - "Placeholder route groups: empty Router::new() merged early so subsequent plans add routes without modifying merge structure"

requirements-completed: [SRVR-01, SRVR-02, SRVR-03, SRVR-04, SRVR-05, SRVR-06, SRVR-08, SRVR-09]

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 2 Plan 1: Server Management Foundation Summary

**Migration 2 with 6 tables, Permissions bitflags with require_permission() guard, 4 new protobuf packages, WS envelope extensions (fields 50-105), and broadcast_to_all/send_to_user/force_close_user helpers**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T03:00:05Z
- **Completed:** 2026-02-25T03:04:47Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Migration 2 creates 6 new tables (categories, channels, roles, user_roles, bans, invites) with correct foreign keys and indexes
- Permissions bitflags type with 5 named flags, ADMIN-implies-all effective() method, compute_user_permissions(), and require_permission() async guard
- 4 new protobuf files compiled via prost, WS envelope extended with all Phase 2 request/response/event payload variants
- broadcast_to_all, send_to_user, and force_close_user WebSocket helpers for real-time event distribution
- Placeholder route groups scaffolded so plans 02-02 through 02-04 can add routes without merge conflicts

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration, permission bitflags, and model types** - `ca5e8fe` (feat)
2. **Task 2: Protobuf definitions, WS envelope extension, and broadcast helpers** - `3b6cd1a` (feat)

## Files Created/Modified
- `server/Cargo.toml` - Added bitflags = "2" dependency
- `server/src/db/migrations.rs` - Migration 2 with 6 new tables
- `server/src/db/models.rs` - Category, Channel, Role, Ban, Invite model structs
- `server/src/roles/mod.rs` - Roles module root
- `server/src/roles/permissions.rs` - Permissions bitflags, compute_user_permissions(), require_permission()
- `server/src/main.rs` - Added `mod roles`
- `server/src/lib.rs` - Added `pub mod roles`
- `shared/proto/channels.proto` - Channel/category messages with CRUD requests and events
- `shared/proto/roles.proto` - Role/permission messages with CRUD requests and events
- `shared/proto/moderation.proto` - Kick/ban messages with requests and events
- `shared/proto/invite.proto` - Invite messages with CRUD and join flow
- `shared/proto/ws.proto` - Extended envelope with Phase 2 payload variants (fields 50-105)
- `server/build.rs` - Compiles all 8 proto files
- `server/src/proto/mod.rs` - 4 new modules (channels, roles, moderation, invite) with re-exports
- `server/src/ws/broadcast.rs` - broadcast_to_all, send_to_user, force_close_user
- `server/src/ws/mod.rs` - Added pub mod broadcast
- `server/src/routes.rs` - Placeholder route groups for channels, roles, moderation, invites

## Decisions Made
- WS envelope field number allocation uses blocks of 10 per domain (50-59 channels, 60-69 roles, 70-79 moderation, 80-89 invites) with overflow at 100+ for channel/role events that exceeded their block
- Protobuf packages follow existing convention: `united.channels`, `united.roles`, `united.moderation`, `united.invite`
- invite.proto imports channels.proto and roles.proto for JoinServerResponse (returns channel list + role list on join)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 6 tables are ready for CRUD operations in plans 02-02, 02-03, 02-04
- Permissions system is ready for use in endpoint guards
- All proto types are compiled and available for request/response handling
- Broadcast helpers are ready for real-time event distribution
- Placeholder route groups are scaffolded for parallel plan execution

## Self-Check: PASSED

All 14 created/key files verified present on disk. Both task commits (ca5e8fe, 3b6cd1a) verified in git log.

---
*Phase: 02-server-management*
*Completed: 2026-02-25*
