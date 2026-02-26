---
phase: 05-direct-messages
plan: 01
subsystem: api
tags: [protobuf, sqlite, rest, websocket, encryption, dm, x25519, offline-queue, base64]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Auth (JWT Claims extractor), WS broadcast, SQLite migrations, protobuf pipeline"
  - phase: 04-real-time-chat
    provides: "Chat REST endpoint pattern, WS Envelope field allocation convention, broadcast helpers"
provides:
  - "dm.proto with DmConversation, EncryptedDmMessage, DmPublicKey, events, and request/response types"
  - "ws.proto Envelope DM payload variants (fields 150-157)"
  - "Migration 5: dm_public_keys, dm_conversations, dm_messages, dm_offline_queue tables"
  - "REST endpoints: POST/GET /api/dm/keys, POST/GET /api/dm/conversations, POST/GET /api/dm/messages, GET /api/dm/offline, POST /api/dm/offline/ack"
  - "Targeted WS push via send_to_user for DM events (not broadcast_to_all)"
  - "Offline delivery queue with 30-day TTL background cleanup"
affects: [05-direct-messages, 06-content-distribution]

# Tech tracking
tech-stack:
  added: [base64 0.22.1]
  patterns: [targeted-ws-push, offline-queue-with-ttl, normalized-participant-order, encrypted-blob-relay]

key-files:
  created:
    - shared/proto/dm.proto
    - server/src/dm/mod.rs
    - server/src/dm/keys.rs
    - server/src/dm/conversations.rs
    - server/src/dm/messages.rs
    - server/src/dm/offline.rs
  modified:
    - shared/proto/ws.proto
    - server/src/db/migrations.rs
    - server/src/db/models.rs
    - server/src/proto/mod.rs
    - server/build.rs
    - server/src/lib.rs
    - server/src/main.rs
    - server/src/routes.rs
    - server/Cargo.toml

key-decisions:
  - "base64 crate added for encrypted payload encoding in REST responses (binary blobs need text-safe transport)"
  - "Offline queue marks delivered on GET (not separate ack) for simplicity; ack endpoint also provided for explicit control"
  - "DM messages persist indefinitely in dm_messages; only offline queue entries expire after 30 days"
  - "Normalized participant order (lexicographic sort of Ed25519 hex pubkeys) prevents duplicate conversations"
  - "DM events sent via send_to_user (targeted), not broadcast_to_all -- private by design"

patterns-established:
  - "Encrypted blob relay: server stores opaque encrypted payloads, never inspects content (SEC-05)"
  - "Targeted WS push: DM events routed to specific recipient via send_to_user, not broadcast"
  - "Offline queue pattern: queue when recipient disconnected, deliver on reconnection, purge after 30 days"
  - "Conversation normalization: lexicographic participant ordering prevents duplicate pair entries"
  - "UPSERT for key publication: INSERT OR REPLACE handles X25519 key rotation seamlessly"

requirements-completed: [DM-01, DM-02, SEC-05]

# Metrics
duration: 10min
completed: 2026-02-26
---

# Phase 5 Plan 01: DM Server Infrastructure Summary

**Protobuf DM schemas, Migration 5 (4 tables), 8 REST endpoints for encrypted DM relay with X25519 key exchange, conversation management, offline delivery queue, and targeted WS push**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-26T05:13:05Z
- **Completed:** 2026-02-26T05:23:34Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- Complete dm.proto with DmConversation, EncryptedDmMessage, DmPublicKey, 3 event types, and request/response messages
- WS Envelope extended with 8 DM payload variants (fields 150-157) following established allocation pattern
- Migration 5 creates dm_public_keys, dm_conversations, dm_messages, dm_offline_queue with appropriate indexes and foreign keys
- Full DM REST API: key exchange (publish/retrieve X25519), conversation create/list with normalized ordering, encrypted message send with targeted WS delivery, paginated history, offline queue with 30-day TTL cleanup

## Task Commits

Each task was committed atomically:

1. **Task 1: Protobuf schemas and database migration** - `9c123f2` (feat)
2. **Task 2: REST endpoints for key exchange, conversations, messages, and offline delivery** - `e95709c` (feat)

## Files Created/Modified
- `shared/proto/dm.proto` - DM protobuf schema (conversations, encrypted messages, key exchange, events)
- `shared/proto/ws.proto` - Extended Envelope with DM payload variants (fields 150-157)
- `server/src/db/migrations.rs` - Migration 5: dm_public_keys, dm_conversations, dm_messages, dm_offline_queue
- `server/src/db/models.rs` - DmPublicKey, DmConversation, DmMessage, DmOfflineQueueEntry structs
- `server/build.rs` - Added dm.proto to prost_build input list
- `server/src/proto/mod.rs` - Added united::dm module and re-export
- `server/src/dm/mod.rs` - DM module with conversations, keys, messages, offline submodules
- `server/src/dm/keys.rs` - POST/GET /api/dm/keys: X25519 key publication with UPSERT and DmKeyRotatedEvent broadcast
- `server/src/dm/conversations.rs` - POST/GET /api/dm/conversations: create/list with normalized participant order
- `server/src/dm/messages.rs` - POST/GET /api/dm/messages: encrypted blob storage, targeted WS push, offline queue
- `server/src/dm/offline.rs` - GET /api/dm/offline, POST /api/dm/offline/ack, background cleanup task
- `server/src/lib.rs` - Added `pub mod dm`
- `server/src/main.rs` - Added `mod dm`, spawn offline cleanup task
- `server/src/routes.rs` - Wired all DM routes into router
- `server/Cargo.toml` - Added base64 dependency

## Decisions Made
- Added `base64` crate as direct dependency for encoding encrypted binary payloads in JSON REST responses (hex would work but base64 is more space-efficient for large blobs)
- GET /api/dm/offline automatically marks queue entries as delivered (in addition to explicit POST /api/dm/offline/ack) for simpler client reconnection flow
- DM messages persist indefinitely in dm_messages table (conversation history); only dm_offline_queue entries are purged after 30 days per CONTEXT.md decision
- Conversations use normalized participant ordering (lexicographic sort of hex Ed25519 pubkeys) with UNIQUE constraint to prevent duplicates
- DmConversationCreatedEvent sent to both participants via send_to_user (not broadcast_to_all) to maintain privacy
- DmMessageEvent also sent back to sender for multi-device support (sender's other devices see the message)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added base64 crate as direct dependency**
- **Found during:** Task 2 (messages.rs implementation)
- **Issue:** Plan specified base64-encoded encrypted payloads in REST responses, but base64 was only a transitive dependency (not directly importable)
- **Fix:** Added `base64 = "0.22.1"` to server/Cargo.toml via `cargo add base64`
- **Files modified:** server/Cargo.toml, server/Cargo.lock
- **Verification:** Build succeeds, base64 encode/decode works in messages.rs and offline.rs
- **Committed in:** e95709c (Task 2 commit)

**2. [Rule 1 - Bug] Fixed borrow-after-move in keys.rs**
- **Found during:** Task 2 (keys.rs compilation)
- **Issue:** x25519_bytes moved into spawn_blocking closure then referenced after for WS broadcast
- **Fix:** Clone x25519_bytes before the closure (`x25519_bytes_for_broadcast`)
- **Files modified:** server/src/dm/keys.rs
- **Verification:** Build succeeds without borrow checker errors
- **Committed in:** e95709c (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes were necessary for compilation. No scope creep.

## Issues Encountered
- Task 1 commit included pre-existing client-side DM files (dm-crypto.ts, dm.ts, dm-events.ts) that were already staged in the working tree from a prior session. These are Phase 5 Plan 02 client work, not part of this plan's scope. No impact on correctness.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server DM infrastructure complete: all REST endpoints compiled and wired, all 42 existing tests pass
- Ready for Plan 02 (client-side DM data layer) and Plan 03 (DM UI) to build on these endpoints
- Client needs to implement: X25519 key derivation from Ed25519, XChaCha20-Poly1305 encryption, and DM store hydration from these REST endpoints

## Self-Check: PASSED

All 6 created files verified present. Both task commits (9c123f2, e95709c) verified in git log.

---
*Phase: 05-direct-messages*
*Completed: 2026-02-26*
