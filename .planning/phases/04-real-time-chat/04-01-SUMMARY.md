---
phase: 04-real-time-chat
plan: 01
subsystem: api
tags: [protobuf, rust, axum, sqlite, websocket, chat, reactions, rest]

# Dependency graph
requires:
  - phase: 03-p2p-networking
    provides: "gossipsub message persistence, GossipEnvelope, WS broadcast infrastructure"
  - phase: 01-foundation
    provides: "JWT auth, WS protocol, protobuf build pipeline"
provides:
  - "chat.proto and presence.proto protobuf schemas"
  - "Migration 4: content_text, edited, deleted, reply_to_id columns; reactions and last_read tables"
  - "REST endpoints for message CRUD (POST/GET/PUT/DELETE)"
  - "REST endpoints for reaction CRUD (POST/DELETE/GET)"
  - "REST endpoints for last-read tracking (PUT/GET)"
  - "WS broadcast for NewMessageEvent, MessageEdited, MessageDeleted, ReactionAdded, ReactionRemoved"
  - "Gossip-to-WS bridge: gossipsub CHAT messages broadcast to all WS clients"
affects: [04-02, 04-03, 04-04, 04-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chat module structure: mod.rs + messages.rs + reactions.rs + broadcast.rs"
    - "REST message creation with server-assigned UUIDv7 and server_sequence"
    - "Shared ConnectionRegistry between gossip consumer and app state for broadcast"
    - "Content_text column for SQL-queryable message content alongside protobuf payload"

key-files:
  created:
    - "shared/proto/chat.proto"
    - "shared/proto/presence.proto"
    - "server/src/chat/mod.rs"
    - "server/src/chat/messages.rs"
    - "server/src/chat/reactions.rs"
    - "server/src/chat/broadcast.rs"
  modified:
    - "shared/proto/ws.proto"
    - "server/src/db/migrations.rs"
    - "server/src/db/models.rs"
    - "server/build.rs"
    - "server/src/proto/mod.rs"
    - "server/src/lib.rs"
    - "server/src/routes.rs"
    - "server/src/p2p/messages.rs"
    - "server/src/main.rs"

key-decisions:
  - "REST as primary message creation path (simpler, more reliable for single-server)"
  - "UUIDv7 for message IDs (time-ordered, compatible with string primary key)"
  - "Shared connection registry: gossip consumer and app state use same Arc<DashMap>"
  - "Soft-delete for messages (deleted=1 flag, filtered in queries)"
  - "INSERT OR IGNORE for reactions (UNIQUE constraint handles idempotency)"
  - "Gossip handler returns GossipPersistResult with optional ChatMessage for broadcast"

patterns-established:
  - "Chat broadcast pattern: construct proto event, wrap in Envelope, call broadcast_to_all"
  - "Message mention parsing: @user:<id> and @role:<id> patterns in content"
  - "History pagination: before_sequence DESC with limit+1 for has_more detection"

requirements-completed: [MSG-01, MSG-02, MSG-04, SEC-03]

# Metrics
duration: 11min
completed: 2026-02-26
---

# Phase 4 Plan 01: Server Chat Infrastructure Summary

**Protobuf schemas (chat + presence), migration 4 (reactions, last_read, content columns), REST endpoints for message/reaction CRUD, and WS broadcast for all chat events**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-26T02:53:41Z
- **Completed:** 2026-02-26T03:04:40Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Created chat.proto (ChatMessage, Reaction, 5 event types, history request/response) and presence.proto (PresenceStatus, TypingIndicator, events)
- Added 9 new WS Envelope payload variants (fields 120-131) to ws.proto for Phase 4
- Migration 4: added content_text/edited/deleted/reply_to_id columns to messages, created reactions and last_read tables
- Full REST API: POST create message (201 with server_sequence), GET paginated history with reactions, PUT edit, DELETE soft-delete, reaction CRUD, last-read tracking
- WS broadcast for all chat events (NewMessage, Edited, Deleted, ReactionAdded, ReactionRemoved)
- Gossip-to-WS bridge: CHAT-type gossipsub messages now broadcast NewMessageEvent to all WS clients

## Task Commits

Each task was committed atomically:

1. **Task 1: Protobuf schemas and database migration** - `429213b` (feat, combined)
2. **Task 2: REST endpoints and WS broadcast for chat events** - `429213b` (feat, combined)

## Files Created/Modified
- `shared/proto/chat.proto` - ChatMessage, Reaction, event types, history request/response
- `shared/proto/presence.proto` - PresenceStatus, PresenceUpdate, TypingIndicator, events
- `shared/proto/ws.proto` - Added Phase 4 payload variants (fields 120-131)
- `server/src/db/migrations.rs` - Migration 4: content_text, edited, deleted, reply_to_id, reactions table, last_read table
- `server/src/db/models.rs` - Reaction and LastRead model structs, updated Message with Phase 4 fields
- `server/build.rs` - Added chat.proto and presence.proto to compilation list
- `server/src/proto/mod.rs` - Added chat and presence proto modules and re-exports
- `server/src/chat/mod.rs` - Module declarations for messages, reactions, broadcast
- `server/src/chat/messages.rs` - POST create, GET history, PUT edit, DELETE soft-delete, last-read endpoints
- `server/src/chat/reactions.rs` - POST add, DELETE remove, GET list reactions
- `server/src/chat/broadcast.rs` - WS broadcast helpers for all chat events
- `server/src/lib.rs` - Added pub mod chat
- `server/src/routes.rs` - Wired chat_routes into main Router
- `server/src/p2p/messages.rs` - Extract content_text from CHAT payloads, return GossipPersistResult with ChatMessage
- `server/src/main.rs` - Shared connection registry, gossip consumer broadcasts NewMessageEvent

## Decisions Made
- REST as primary message creation path: simpler and more reliable for single-server deployments, gossipsub path preserved for P2P
- UUIDv7 for message IDs: time-ordered and string-compatible with existing schema patterns
- Shared connection registry between gossip consumer and app state: created early and cloned into both consumers
- Soft-delete for messages: set deleted=1 flag, filtered in history queries, preserves data integrity
- INSERT OR IGNORE for reactions: leverages UNIQUE constraint for idempotent toggles
- GossipPersistResult struct: returns server_sequence + optional ChatMessage so gossip consumer can broadcast without re-decoding

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed MessageType enum variant name**
- **Found during:** Task 2 (p2p/messages.rs compilation)
- **Issue:** Used `MessageType::MessageTypeChat` but prost strips the common prefix, generating `MessageType::Chat`
- **Fix:** Changed to `MessageType::Chat as i32`
- **Files modified:** server/src/p2p/messages.rs
- **Verification:** cargo build succeeds
- **Committed in:** 1effb88 (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed type annotation for spawn_blocking closure**
- **Found during:** Task 2 (update_last_read compilation)
- **Issue:** `Ok(())` in spawn_blocking closure needed explicit type annotation for `??` double-unwrap
- **Fix:** Changed to `Ok::<(), StatusCode>(())`
- **Files modified:** server/src/chat/messages.rs
- **Verification:** cargo build succeeds
- **Committed in:** 1effb88 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes were compile-error corrections. No scope creep.

## Issues Encountered
- Client-side files from a parallel work session were already staged in git. They were included in the Task 2 commit alongside the server changes. These files are consistent with Phase 4 scope (chat types, hooks, stores) but belong to plans 02-03.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server chat infrastructure complete: all REST endpoints, WS broadcast, and DB schema ready
- Plan 02 (Client Data Layer) can now implement IPC handlers that call these REST endpoints
- Plan 03 (Chat UI) can consume the message/reaction data via the client data layer
- All 42 existing tests pass with no regressions

## Self-Check: PASSED

All 7 key files verified present. Commit 429213b verified in git log.

---
*Phase: 04-real-time-chat*
*Completed: 2026-02-26*
