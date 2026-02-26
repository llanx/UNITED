---
phase: 05-direct-messages
verified: 2026-02-25T00:00:00Z
status: gaps_found
score: 3/4 success criteria verified
gaps:
  - truth: "User can send and receive direct messages that are end-to-end encrypted — real-time WS delivery works"
    status: failed
    reason: "Server sends DM push events as protobuf binary, but client dm-events.ts tries JSON.parse of binary data and silently discards all WS DM events. The generated ws_pb.ts also lacks DM payload variants (ws.proto was not regenerated after adding DM fields 150-157). Real-time DM delivery from server to recipient is broken; offline fetch (REST) still works."
    artifacts:
      - path: "client/src/main/ws/dm-events.ts"
        issue: "Tries TextDecoder().decode(data) + JSON.parse() on protobuf binary data — always throws, always silently returns. Listener fires but never forwards DM events to renderer."
      - path: "shared/types/generated/ws_pb.ts"
        issue: "Generated TypeScript does not include DM payload variants (dm_message_event field 150, dm_conversation_created_event field 151, etc.). The ws.proto was updated but protoc-gen-es was not re-run."
    missing:
      - "Regenerate ws_pb.ts (and dm_pb.ts) from updated ws.proto + dm.proto using protoc-gen-es"
      - "Add DM event handling to chat-events.ts (extend the switch on envelope.payload.case to handle dmMessageEvent, dmConversationCreatedEvent, dmKeyRotatedEvent) OR update dm-events.ts to use fromBinary(EnvelopeSchema, data) instead of JSON.parse"
---

# Phase 5: Direct Messages Verification Report

**Phase Goal:** Users can have private one-on-one conversations where only the participants can read the messages, even if the coordination server is compromised
**Verified:** 2026-02-25
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can send and receive DMs that are E2E encrypted — server stores only encrypted blobs it cannot decrypt | PARTIAL | Encryption crypto fully implemented; send (REST POST) works; real-time WS delivery to recipient is broken (JSON/protobuf mismatch in dm-events.ts) |
| 2 | User can receive DMs sent while offline, delivered via encrypted blobs stored on the coordination server | VERIFIED | GET /api/dm/offline implemented, dm_offline_queue table with 30-day TTL, offline fetch on reconnect in IPC handler |
| 3 | User can see DM conversations listed separately from channel messages in a dedicated DM section | VERIFIED | DmConversationList replaces ChannelSidebar when dmView=true; wired in Main.tsx |
| 4 | User can see encryption indicators confirming DMs are E2E encrypted and channel messages are signed | VERIFIED | EncryptionIndicator mode="e2e" in DmMessageRow and DmChatView header; mode="signed" in MessageRow; both substantive SVG components |

**Score:** 3/4 success criteria verified (one partial — send works, real-time receive broken)

---

## Required Artifacts

### Plan 01 — Server DM Infrastructure

| Artifact | Status | Details |
|----------|--------|---------|
| `shared/proto/dm.proto` | VERIFIED | Full DmConversation, EncryptedDmMessage, DmPublicKey, events, request/response types — 72 lines, substantive |
| `server/src/dm/conversations.rs` | VERIFIED | create_conversation and list_conversations with normalized participant ordering, send_to_user broadcast |
| `server/src/dm/messages.rs` | VERIFIED | send_dm_message (encrypted blob storage, targeted WS push, offline queue), get_dm_messages (paginated) |
| `server/src/dm/keys.rs` | VERIFIED | publish_dm_key (UPSERT + DmKeyRotatedEvent broadcast), get_dm_key |
| `server/src/dm/offline.rs` | VERIFIED | get_offline_messages (marks delivered), ack_offline_messages, spawn_offline_cleanup (30-day TTL) |

### Plan 02 — Client DM Data Layer

| Artifact | Status | Details |
|----------|--------|---------|
| `client/src/main/ipc/dm-crypto.ts` | VERIFIED | deriveX25519FromEd25519, computeSharedSecret (X25519+BLAKE2b), encryptDmMessage, decryptDmMessage, shared secret cache with sodium_memzero |
| `client/src/main/ipc/dm.ts` | VERIFIED | registerDmHandlers with all IPC handlers: publish key, list/create conversations, send (encrypt before POST), fetch history (decrypt), offline fetch, peer key status |
| `client/src/renderer/src/stores/dm.ts` | VERIFIED | createDmSlice with full state/actions: conversations sorted by lastMessageAt, per-conversation messages, unread counts, banner dismissed, key status |
| `client/src/renderer/src/hooks/useDm.ts` | VERIFIED | useDm hook (real-time events via onDmEvent, load, send), useDmKeyStatus hook |
| `client/src/main/ws/dm-events.ts` | STUB/BROKEN | File exists and is substantive (163 lines), but uses JSON.parse on protobuf binary data — never successfully processes any server WS push event |

### Plan 03 — DM UI

| Artifact | Status | Details |
|----------|--------|---------|
| `client/src/renderer/src/components/DmConversationList.tsx` | VERIFIED | Avatar, name, timestamp, unread badge; empty state; wired to useDm hook |
| `client/src/renderer/src/components/DmChatView.tsx` | VERIFIED | Full-width, virtualized (@tanstack/react-virtual), message grouping, date separators, EncryptionBanner, EncryptionIndicator in header, DmComposer |
| `client/src/renderer/src/components/DmComposer.tsx` | VERIFIED | useDmKeyStatus polling, disabled state with "Waiting for encryption keys" placeholder, lock icon |
| `client/src/renderer/src/components/DmMessageRow.tsx` | VERIFIED | Lock icon (EncryptionIndicator e2e), decryptionFailed handling, OfflineSeparator, context menu |
| `client/src/renderer/src/components/EncryptionBanner.tsx` | VERIFIED | Dismissible banner with recipientName, green styling, plain-language explanation |
| `client/src/renderer/src/components/EncryptionIndicator.tsx` | VERIFIED | mode="e2e" (lock SVG, green) and mode="signed" (checkmark SVG, blue) |
| `client/src/renderer/src/components/KeyRotationNotice.tsx` | VERIFIED | Yellow pill with lock-refresh icon, "{displayName}'s encryption keys have changed" |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/src/dm/messages.rs` | `server/src/ws/broadcast.rs` | send_to_user after storing encrypted DM | WIRED | Lines 214, 231 — targeted push to recipient and sender; broadcast.rs confirmed uses Message::Binary (protobuf) |
| `server/src/dm/keys.rs` | `server/src/db/migrations.rs` | Stores X25519 keys in dm_public_keys table | WIRED | Migration 5 creates dm_public_keys; keys.rs uses INSERT OR REPLACE INTO dm_public_keys |
| `server/src/dm/offline.rs` | `server/src/dm/messages.rs` | Offline queue populated when recipient has no active WS connection | WIRED | messages.rs checks `state.connections.contains_key(&recipient_pubkey)`, inserts into dm_offline_queue if offline |
| `shared/proto/ws.proto` | `shared/proto/dm.proto` | import and oneof payload variants for DM events (fields 150-157) | WIRED | ws.proto line 33: `// 150-169: Direct Messages` allocation; fields 150-157 defined |

### Plan 02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `client/src/main/ipc/dm-crypto.ts` | `client/src/main/ipc/crypto.ts` | Uses getSessionKeys() for X25519 derivation | WIRED | Line 10: `import { getSessionKeys, bufToHex, hexToBuf }` |
| `client/src/main/ipc/dm.ts` | `client/src/main/ipc/dm-crypto.ts` | Encrypts before sending, decrypts after receiving | WIRED | Lines 14-18: imports encryptDmMessage, decryptDmMessage, getOrComputeSharedSecret |
| `client/src/main/ws/client.ts` | `client/src/renderer/src/stores/dm.ts` | WS DM push events forwarded via IPC | NOT WIRED | dm-events.ts listener fires but JSON.parse always fails on protobuf binary; no DM events ever reach the renderer store |
| `client/src/renderer/src/hooks/useDm.ts` | `client/src/renderer/src/stores/dm.ts` | Hook reads conversations/messages, triggers IPC for mutations | WIRED | useDm reads from useStore, calls sendDmMessage, appendDmMessage, etc. |

### Plan 03 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `client/src/renderer/src/components/ServerRail.tsx` | `client/src/renderer/src/stores/dm.ts` | DM icon click sets dmView=true, reads dmUnreadCounts for badge | WIRED | Lines 14-15: `const dmView = useStore((s) => s.dmView)`, `setDmView` called on click |
| `client/src/renderer/src/components/DmChatView.tsx` | `client/src/renderer/src/hooks/useDm.ts` | useDm hook provides messages, loading, loadOlder | WIRED | Line 172: `const { messages, hasMore, loading, loadOlder } = useDm(activeDmConversationId ?? undefined)` |
| `client/src/renderer/src/components/MainContent.tsx` | `client/src/renderer/src/components/DmChatView.tsx` | Renders DmChatView when dmView=true and activeDmConversationId is set | WIRED | Line 11: `import DmChatView`, line 74-75: renders `<DmChatView />` when dmView && activeDmConversationId |
| `client/src/renderer/src/components/DmComposer.tsx` | `client/src/renderer/src/hooks/useDm.ts` | useDmKeyStatus checks if peer key is available | WIRED | Line 13: `import { useDmKeyStatus }`, line 38: `const { keyAvailable, loading: keyLoading } = useDmKeyStatus(recipientPubkey)` |
| `client/src/renderer/src/components/UserProfilePopup.tsx` | `client/src/renderer/src/stores/dm.ts` | "Message" button creates conversation and navigates to DM view | WIRED | Lines 89-108: createConversation, setDmView(true), setActiveDmConversation |
| `client/src/renderer/src/components/MessageRow.tsx` | `client/src/renderer/src/components/EncryptionIndicator.tsx` | Shows signed checkmark on channel messages | WIRED | Line 19: `import EncryptionIndicator`, line 293: `<EncryptionIndicator mode="signed" />` |
| `Main.tsx` | `DmConversationList.tsx` / `ChannelSidebar.tsx` | Conditional sidebar based on dmView | WIRED | Line 21: `{dmView ? <DmConversationList /> : <ChannelSidebar />}` |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DM-01 | 05-01, 05-02, 05-03 | E2E encrypted DMs with X25519 key exchange, only participants hold decryption keys | PARTIAL | X25519 derivation and XChaCha20-Poly1305 encryption working; send via REST works; real-time WS receive broken |
| DM-02 | 05-01, 05-02 | Receive DMs while offline via encrypted blobs on coordination server | SATISFIED | dm_offline_queue table, GET /api/dm/offline endpoint, IPC DM_FETCH_OFFLINE handler, offline cleanup background task |
| DM-03 | 05-01, 05-03 | DM conversations listed separately from channel messages | SATISFIED | DmConversationList in sidebar, dmView toggle, separate DmChatView in MainContent |
| SEC-05 | 05-01, 05-02 | DMs use per-conversation X25519 keys; coordination server stores only encrypted blobs | SATISFIED | server/src/dm/messages.rs CRITICAL comment confirmed; encrypted_payload stored as opaque BLOB; server never decrypts |
| SEC-07 | 05-03 | User can see encryption indicators — DMs E2E encrypted, channel messages signed | SATISFIED | EncryptionIndicator mode="e2e" on DM messages; mode="signed" on channel MessageRow |

**Orphaned requirements:** None. All 5 requirement IDs from the plans are accounted for.

---

## Anti-Patterns Found

| File | Issue | Severity | Impact |
|------|-------|----------|--------|
| `client/src/main/ws/dm-events.ts` | JSON.parse attempted on protobuf binary Uint8Array data — catch block silently discards all events | BLOCKER | WS DM push delivery completely non-functional |
| `shared/types/generated/ws_pb.ts` | Missing DM payload cases (dm_message_event, dm_conversation_created_event, dm_key_rotated_event fields 150-157) — ws.proto was updated but TypeScript was not regenerated | BLOCKER | Even if dm-events.ts were fixed to use fromBinary, the Envelope type has no DM cases to switch on |
| `client/src/main/ipc/dm.ts` (DM_DELETE_LOCAL handler) | No-op main process implementation — comment says "Future: persist DM messages in local SQLite" | WARNING | Delete-for-self works only in renderer memory (state); cleared on restart |

---

## Human Verification Required

The following items need human testing and cannot be verified programmatically:

### 1. DM Conversation Flow (Requires Two Instances)

**Test:** In two separate app instances, user A sends a DM to user B
**Expected:** User B sees the message appear in their DM conversation view
**Why human:** Requires running two app instances; automated checks cannot exercise the full WS + decrypt + render pipeline

### 2. Offline DM Delivery

**Test:** User B goes offline; User A sends a DM; User B reconnects
**Expected:** DM appears in conversation with "received while offline" separator
**Why human:** Requires coordinated connection management and timing

### 3. Encryption Banner Persistence

**Test:** Open first DM conversation, dismiss banner; close and reopen app
**Expected:** Banner does not reappear
**Why human:** Requires verifying localStorage/cached-state persistence across restarts

### 4. Key Unavailable State

**Test:** Attempt to DM a user who has not published X25519 keys
**Expected:** Composer is disabled with "Waiting for encryption keys from [user]" message; no message sent
**Why human:** Requires a test account that has never called publishKey

---

## Gaps Summary

### Critical Gap: WS DM Push Events Never Delivered

The server and client have a protocol mismatch on the WS transport for DM events:

- **Server side (`server/src/dm/messages.rs`):** Sends DM events as protobuf binary encoded `Envelope` via `send_to_user` (which calls `envelope.encode(&mut buf)` and sends `Message::Binary`). This is the same transport used by all other server push events (chat, presence, typing).

- **Client side (`client/src/main/ws/dm-events.ts`):** Listens on `wsClient.on('message')` but tries to decode the data as UTF-8 text and JSON-parse it. This always throws a parse error on protobuf binary data. The catch block silently returns without forwarding anything. Every incoming DM push event from the server is silently discarded.

- **Generated types (`shared/types/generated/ws_pb.ts`):** The ws.proto was updated to add DM payload fields 150-157, but `protoc-gen-es` was not re-run. The generated TypeScript file does not contain DM payload type cases. The `Envelope.payload` oneof has no DM cases — so even if dm-events.ts were fixed, the TypeScript types would be incomplete.

**Impact:** Users can send DMs (REST POST works) and see their own sent messages immediately (sender gets message returned from DM_SEND_MESSAGE IPC handler and appends to store). Users can also retrieve history via REST (DM_FETCH_HISTORY) and offline messages (DM_FETCH_OFFLINE). But real-time push to the recipient does not work — the recipient only sees new DMs after explicitly polling (e.g., scrolling up to trigger history fetch, or reconnecting to trigger offline fetch).

**Fix:** Two-part fix required:
1. Run `protoc-gen-es` to regenerate `ws_pb.ts` (and generate `dm_pb.ts`) from the updated protos
2. Update `dm-events.ts` to use `fromBinary(EnvelopeSchema, data)` and switch on `envelope.payload.case` for `'dmMessageEvent'`, `'dmConversationCreatedEvent'`, `'dmKeyRotatedEvent'` — matching the pattern used by `chat-events.ts`

---

*Verified: 2026-02-25*
*Verifier: Claude (gsd-verifier)*
