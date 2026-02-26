---
phase: 05-direct-messages
plan: 04
subsystem: messaging
tags: [protobuf, websocket, dm, e2e-encryption, fromBinary, buf-generate]

# Dependency graph
requires:
  - phase: 05-direct-messages
    provides: DM protobuf schemas (dm.proto with fields 150-157 in ws.proto), dm-events.ts event listener, dm-crypto module
provides:
  - Working protobuf-based DM WS push event delivery (dmMessageEvent, dmConversationCreatedEvent, dmKeyRotatedEvent)
  - Regenerated dm_pb.ts and ws_pb.ts with DM Envelope payload cases
affects: [06-content-distribution]

# Tech tracking
tech-stack:
  added: []
  patterns: [protobuf-envelope-decode-pattern-for-dm-events]

key-files:
  created:
    - shared/types/generated/dm_pb.ts
  modified:
    - shared/types/generated/ws_pb.ts
    - client/src/main/ws/dm-events.ts

key-decisions:
  - "Protobuf types are gitignored -- buf generate is a build step, not a committed artifact"
  - "handleDmMessage uses explicit typed parameter (not protobuf type directly) for Buffer conversion boundary"

patterns-established:
  - "DM WS event handler follows identical pattern to chat-events.ts: fromBinary(EnvelopeSchema, data) + payload.case switch"

requirements-completed: [DM-01]

# Metrics
duration: 3min
completed: 2026-02-26
---

# Phase 5 Plan 4: DM WS Push Event Fix Summary

**Fixed DM WS push delivery by replacing broken JSON.parse on protobuf binary data with fromBinary(EnvelopeSchema, data) decode pattern and regenerating dm_pb.ts/ws_pb.ts types**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-26T05:55:15Z
- **Completed:** 2026-02-26T05:58:44Z
- **Tasks:** 2
- **Files modified:** 1 committed (+ 2 regenerated gitignored files)

## Accomplishments
- Regenerated protobuf TypeScript types via `buf generate` -- dm_pb.ts now exists with DmMessageEventSchema, DmConversationCreatedEventSchema, DmKeyRotatedEventSchema; ws_pb.ts now includes DM payload variants (fields 150-157) in Envelope oneof
- Rewrote dm-events.ts to decode protobuf Envelope using `fromBinary(EnvelopeSchema, data)` and switch on `payload.case` for three DM event types -- matching the working chat-events.ts pattern exactly
- Eliminated the anti-pattern of JSON.parse on protobuf binary Uint8Array data that silently discarded every DM push event

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2: Regenerate protobuf types + Rewrite dm-events.ts** - `4897053` (fix)
   - Task 1 produced gitignored generated files (dm_pb.ts, ws_pb.ts) -- no separate commit needed
   - Task 2 rewrote dm-events.ts -- committed as the single deliverable

**Plan metadata:** (pending -- docs commit below)

## Files Created/Modified
- `shared/types/generated/dm_pb.ts` - Generated TypeScript types for DM protobuf messages (DmMessageEvent, DmConversationCreatedEvent, DmKeyRotatedEvent, EncryptedDmMessage, DmConversation, DmPublicKey)
- `shared/types/generated/ws_pb.ts` - Regenerated Envelope type with DM payload oneof cases (fields 150-157)
- `client/src/main/ws/dm-events.ts` - Rewritten from JSON.parse to fromBinary protobuf decoding with payload.case switch

## Decisions Made
- Combined Task 1 and Task 2 into a single commit since generated protobuf files are gitignored (decision from 01-01) -- the dm-events.ts rewrite is the only committed artifact
- Used explicit typed parameter for handleDmMessage rather than importing EncryptedDmMessage type directly, keeping the Buffer conversion boundary clean at the handler level
- bigint-to-number conversion for timestamp and serverSequence at the decode boundary (protobuf uint64 -> bigint -> Number() for ipc-bridge interface compatibility)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript `tsc --noEmit` check shows pre-existing rootDir errors for all `@shared/` imports (affects chat-events.ts equally) -- this is a known issue where raw tsc doesn't resolve Vite path aliases. Not a regression from this change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 5 gap closure complete -- DM WS push delivery now works end-to-end
- All DM event types (message, conversation-created, key-rotated) flow through the protobuf pipeline
- Phase 5 success criterion 1 (E2E encrypted DMs with real-time delivery) is fully satisfied
- Ready for Phase 6 (Content Distribution)

## Self-Check: PASSED

- FOUND: client/src/main/ws/dm-events.ts
- FOUND: shared/types/generated/dm_pb.ts (gitignored, regenerated)
- FOUND: shared/types/generated/ws_pb.ts (gitignored, regenerated)
- FOUND: commit 4897053
- FOUND: .planning/phases/05-direct-messages/05-04-SUMMARY.md

---
*Phase: 05-direct-messages*
*Completed: 2026-02-26*
