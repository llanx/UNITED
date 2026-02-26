---
phase: 05-direct-messages
plan: 02
subsystem: crypto, ipc, state
tags: [x25519, xchacha20-poly1305, blake2b, sodium-native, zustand, e2e-encryption, dm]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Ed25519 identity, sodium-native crypto, IPC bridge patterns"
  - phase: 04-real-time-chat
    provides: "WS event forwarding, Zustand slice composition, message store patterns"
  - phase: 05-01
    provides: "DM protobuf schemas, server DB migration, server DM endpoints"
provides:
  - "X25519 key derivation from Ed25519 session keys"
  - "Shared secret computation (X25519 + BLAKE2b hash)"
  - "XChaCha20-Poly1305 DM message encrypt/decrypt"
  - "IPC handlers for all DM operations"
  - "Zustand DmSlice with conversation and message state"
  - "useDm and useDmKeyStatus hooks"
  - "Preload bridge dm.* namespace"
  - "WS DM event forwarding with decryption"
  - "Shared secret cache with secure zeroing"
affects: [05-direct-messages, 06-content-distribution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "X25519 key derivation from Ed25519 via sodium crypto_sign_ed25519_pk_to_curve25519"
    - "Shared secret: X25519 scalarmult + BLAKE2b generichash (never raw X25519 as key)"
    - "Per-message random nonce for XChaCha20-Poly1305 DM encryption"
    - "In-memory shared secret cache with sodium_memzero on clear"
    - "Base64 wire format for encrypted payloads and nonces"
    - "JSON-based WS push for DM events (separate from protobuf chat events)"

key-files:
  created:
    - client/src/main/ipc/dm-crypto.ts
    - client/src/main/ipc/dm.ts
    - client/src/main/ws/dm-events.ts
    - client/src/renderer/src/stores/dm.ts
    - client/src/renderer/src/hooks/useDm.ts
  modified:
    - client/src/main/ipc/channels.ts
    - client/src/main/index.ts
    - client/src/preload/index.ts
    - client/src/renderer/src/stores/index.ts
    - shared/types/ipc-bridge.ts

key-decisions:
  - "DM WS events use JSON format (not protobuf) for simplicity alongside existing protobuf chat events"
  - "Desktop notifications for DMs show sender name only, never message content (E2E privacy)"
  - "DM message window cap of 200 (lower than channel 500) reflecting lower DM volume"
  - "Graceful per-message decryption failure: returns '[Unable to decrypt]' with decryptionFailed flag"
  - "Shared secret cache keyed by conversation_id with secure zeroing via sodium_memzero"

patterns-established:
  - "DM crypto: deriveX25519FromEd25519 -> computeSharedSecret -> encryptDmMessage pattern"
  - "DM IPC: dm.* namespace on preload bridge with typed DmEvent push events"
  - "DM store: DmSlice with conversations sorted by lastMessageAt, per-conversation messages"
  - "DM hooks: useDm for subscription/loading, useDmKeyStatus for key availability check"

requirements-completed: [DM-01, DM-02, SEC-05]

# Metrics
duration: 8min
completed: 2026-02-25
---

# Phase 5 Plan 2: Client DM Data Layer Summary

**X25519 key exchange crypto, E2E encrypted DM IPC handlers, Zustand DM store with real-time WS event forwarding and preload bridge**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26T05:13:24Z
- **Completed:** 2026-02-26T05:22:07Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Complete DM crypto module: X25519 derivation from Ed25519, shared secret (X25519 + BLAKE2b), XChaCha20-Poly1305 encrypt/decrypt with per-message nonce
- IPC handlers for all DM operations: publish key, list/create conversations, send/fetch/offline messages, peer key status, block/unblock
- Zustand DmSlice with conversation ordering, per-conversation message windows, unread counts, and encryption banner persistence
- WS DM event forwarding with real-time decryption and desktop notifications
- Preload bridge dm.* namespace with typed event subscriptions

## Task Commits

Each task was committed atomically:

1. **Task 1: DM crypto module and IPC handlers** - `9c123f2` (feat) -- pre-created by plan 05-01 in combined commit
2. **Task 2: Zustand DM store, hook, and preload bridge** - `047097b` (feat)

## Files Created/Modified
- `client/src/main/ipc/dm-crypto.ts` - X25519 key derivation, shared secret computation, XChaCha20-Poly1305 encrypt/decrypt, key publishing, shared secret cache
- `client/src/main/ipc/dm.ts` - IPC handlers for all DM operations (publish key, conversations, send, history, offline, peer key status, block/unblock)
- `client/src/main/ws/dm-events.ts` - WS push event listener for DM messages, conversation creation, key rotation
- `client/src/main/ipc/channels.ts` - Added 12 DM IPC channel constants (DM_* and PUSH_DM_*)
- `client/src/main/index.ts` - Registered DM handlers and DM event listener
- `client/src/renderer/src/stores/dm.ts` - Zustand DmSlice: conversations, messages, unread counts, key status
- `client/src/renderer/src/stores/index.ts` - Composed DmSlice into RootStore, hydrate dm_banner_dismissed
- `client/src/renderer/src/hooks/useDm.ts` - useDm hook (subscription, loading, send) and useDmKeyStatus hook
- `client/src/preload/index.ts` - Exposed dm.* namespace with all DM IPC methods and event listeners
- `shared/types/ipc-bridge.ts` - DmConversation, DecryptedDmMessage, DmEvent, DmKeyStatus types; UnitedAPI dm section

## Decisions Made
- DM WS events use JSON format alongside existing protobuf chat events -- DM events are simpler and don't need protobuf overhead
- Desktop notifications for DMs show sender name only, never message content, preserving E2E privacy
- Per-message decryption failure is graceful: returns "[Unable to decrypt]" with a decryptionFailed flag rather than failing the entire fetch
- Shared secret cache keyed by conversation_id with sodium_memzero on clear for secure memory handling
- DM message window cap set to 200 (vs channel 500) since DM conversations have lower message volume

## Deviations from Plan

### Task 1 Files Pre-created

Task 1 files (dm-crypto.ts, dm.ts, channels.ts updates, dm-events.ts, index.ts updates) were already committed in plan 05-01's combined commit (9c123f2). The Write tool overwrote them with identical content, so no new commit was needed for Task 1. Task 2 files were genuinely new and committed as 047097b.

No auto-fix deviations. Plan executed as specified.

## Issues Encountered
- Task 1 files were already present from plan 05-01's broader commit scope -- the previous plan executor included client files that were technically scoped to plan 02. No impact on correctness since the content matched the plan specification exactly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DM data layer complete -- plan 03 (DM UI) can build conversation list, chat view, and encryption indicators on top of this foundation
- All IPC methods available via window.united.dm.*
- Zustand store ready for UI consumption with useDm and useDmKeyStatus hooks
- WS push events forwarding decrypted DM messages to renderer

## Self-Check: PASSED

All 10 created/modified files verified present. Both commit hashes (9c123f2, 047097b) found in git log. TypeScript compiles cleanly.

---
*Phase: 05-direct-messages*
*Completed: 2026-02-25*
