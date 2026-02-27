---
phase: 10-media-attachment-wiring
verified: 2026-02-26T20:00:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Upload an image in a channel, confirm it renders inline for both sender and a second client"
    expected: "Image appears inline in both the sender's view (via CHAT_SEND REST response) and a second client's view (via WS live delivery)"
    why_human: "End-to-end round-trip requires two running clients, a server, and actual media upload — cannot verify programmatically"
  - test: "Reload the app after sending a message with an attachment, confirm image renders from history"
    expected: "Image renders inline after page reload (REST history path), not as a missing placeholder"
    why_human: "REST history path with real SQLite data requires a running server and actual upload"
  - test: "Confirm blurhash placeholder appears at correct aspect ratio while image loads"
    expected: "Correct-sized blurred placeholder appears before the real image loads, with zero layout reflow on load"
    why_human: "Visual/timing behavior — cannot verify statically"
---

# Phase 10: Fix Media Attachment Wiring — Verification Report

**Phase Goal:** Media attachments render correctly in channel messages — both from history (REST) and live delivery (WebSocket)
**Verified:** 2026-02-26
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Messages loaded from REST history have `block_refs` populated as a typed `BlockRefData[]` array (not a raw JSON string) | VERIFIED | `CHAT_FETCH_HISTORY` handler at `client/src/main/ipc/chat.ts` lines 122-131: fetches raw response typed as `{ messages: Array<ChatMessage & { block_refs_json?: string | null }>; has_more: boolean }`, then maps each message with `block_refs: msg.block_refs_json ? JSON.parse(msg.block_refs_json) : undefined`. Also verified for `CHAT_SEND` handler at lines 91-102. |
| 2 | Messages received via WebSocket live delivery have `block_refs` populated from the protobuf `repeated BlockRef` field | VERIFIED | Two-part fix confirmed: (a) Server `parse_block_refs_json` at `server/src/chat/messages.rs` lines 555-585 converts stored JSON to proto `BlockRef` structs before WS broadcast; (b) Client `chat-events.ts` lines 46-59 maps `msg.blockRefs` to `block_refs: BlockRefData[]` with correct bigint→Number and Uint8Array→base64 conversions. |
| 3 | InlineImage, InlineVideo, ImageGrid, and AttachmentCard components render media when `block_refs` data is present | VERIFIED | All four components exist and are imported in `MessageRow.tsx` (lines 21-23). `MessageRow.tsx` line 127 reads `message.block_refs ?? []`, filters by MIME type (lines 129-131), and conditionally renders `ImageGrid`, `InlineVideo`, and `AttachmentCard` at lines 223-240 and 360-377. The data now reaches these components via all three delivery paths. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/chat/messages.rs` | `parse_block_refs_json` function populating proto block_refs field | VERIFIED | Function exists at lines 555-585. Contains correct camelCase JSON key mapping (`mimeType`→`mime_type`, `microThumbnail`→`micro_thumbnail`), base64 decode for `microThumbnail`, `filter_map` graceful degradation. Called at line 189 via `block_refs: parse_block_refs_json(&block_refs_json)`. |
| `client/src/main/ipc/chat.ts` | `JSON.parse` of `block_refs_json` in CHAT_FETCH_HISTORY and CHAT_SEND handlers | VERIFIED | `CHAT_SEND` handler (lines 91-102): `JSON.parse(raw.block_refs_json)`. `CHAT_FETCH_HISTORY` handler (lines 122-131): `JSON.parse(msg.block_refs_json)` for each message in map. Both present and substantive. |
| `client/src/main/ws/chat-events.ts` | `msg.blockRefs` mapped to `block_refs` in `newMessageEvent` handler | VERIFIED | Lines 46-59 contain the full mapping including `Number(br.size)` cast for bigint, `Buffer.from(br.microThumbnail).toString('base64')` for Uint8Array, and `br.blurhash || undefined` for empty-string sentinel. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/src/chat/messages.rs` | protobuf `ChatMessage.block_refs` | `parse_block_refs_json` called at line 189 | WIRED | Function defined lines 555-585, called in `create_message` handler. Imports `crate::proto::blocks as proto_blocks` (line 14) and `base64::Engine as _` (line 11). |
| `client/src/main/ipc/chat.ts` | renderer `ChatMessage.block_refs` | `JSON.parse(raw.block_refs_json)` at lines 100, 128 | WIRED | Both CHAT_SEND and CHAT_FETCH_HISTORY handlers transform the raw server response before returning to renderer. Pattern confirmed as substantive (not a passthrough). |
| `client/src/main/ws/chat-events.ts` | renderer `ChatMessage.block_refs` | `msg.blockRefs.map(...)` at lines 47-58 | WIRED | `blockRefs` (protobuf camelCase) is read from the decoded protobuf message and mapped to `BlockRefData[]` in the `ChatEvent.message` object forwarded to renderer via `broadcastToRenderers`. |

### Requirements Coverage

Phase 10 is a gap-closure phase. The PLAN frontmatter declares requirements MEDIA-01 through MEDIA-04. These IDs are defined in REQUIREMENTS.md under the Media section and were originally assigned to Phase 7 (component implementation). Phase 10 re-closes them by fixing the data wiring that made the Phase 7 components non-functional at runtime.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MEDIA-01 | 10-01-PLAN.md | User can upload and share files in channels and DMs | SATISFIED | The upload path now results in populated `block_refs` in sent messages via both REST response parsing and WS broadcast. |
| MEDIA-02 | 10-01-PLAN.md | User can see images and videos rendered inline within messages | SATISFIED | `InlineImage`, `InlineVideo`, `ImageGrid` components are wired in `MessageRow.tsx` and now receive non-empty `block_refs` from all three delivery paths. |
| MEDIA-03 | 10-01-PLAN.md | User sees blurhash placeholders at exact aspect ratio while media loads | SATISFIED | `block_refs` now includes `width`, `height`, and `blurhash` fields from parsed JSON, enabling `BlurhashPlaceholder` to render correctly. Visual confirmation requires human test. |
| MEDIA-04 | 10-01-PLAN.md | Media is chunked into content-addressed blocks and distributed across the peer swarm | SATISFIED | Block metadata (`hash`, `size`, `mimeType`) is now correctly propagated through all paths. The block resolution hooks (`useBlockContent`) receive the data needed to trigger peer-swarm resolution. |

Note: REQUIREMENTS.md cross-reference table shows MEDIA-01 through MEDIA-04 as "Phase 7: Media and Prefetching | Complete". This is expected — Phase 10 is a gap-closure phase that fixes the integration break documented in `v1.0-MILESTONE-AUDIT.md`. The requirements are satisfied by the combination of Phase 7 component implementation and Phase 10 data wiring.

No orphaned requirements detected — all four IDs from the PLAN frontmatter are accounted for.

### Anti-Patterns Found

No anti-patterns detected across all three modified files. Searched for: TODO/FIXME/HACK/PLACEHOLDER comments, `return null`, `return {}`, `return []`, empty arrow functions, and placeholder text.

### Human Verification Required

#### 1. Upload-to-Render Round Trip (Live Delivery)

**Test:** With two client instances connected to the same server, upload an image in a channel from client A. Observe client B.
**Expected:** Image renders inline in client B's chat view immediately (via WS live delivery), not as a broken or missing attachment.
**Why human:** Requires two running Electron instances, a running server, and an actual media upload. Cannot be verified by static analysis.

#### 2. History Reload (REST Path)

**Test:** Send a message with an image attachment, then fully reload the app (or switch channels and return). Observe whether the image renders.
**Expected:** Image renders inline after reload, confirming the REST history path populates `block_refs` correctly from the parsed `block_refs_json` in the server response.
**Why human:** Requires a running server with actual SQLite data containing a stored `block_refs_json` value.

#### 3. Blurhash Placeholder Rendering (MEDIA-03)

**Test:** On a slow or simulated-slow connection, send a message with an image. Observe the placeholder state before the image loads.
**Expected:** A blurred placeholder at the correct aspect ratio appears while the image loads, with no layout reflow when the real image replaces it.
**Why human:** Visual/timing behavior dependent on network conditions and the `BlurhashPlaceholder` component receiving valid `width`, `height`, and `blurhash` fields.

### Gaps Summary

No gaps found. All three delivery paths are correctly wired:

1. **Server WS broadcast path:** `parse_block_refs_json` helper added to `messages.rs`, replacing the previous `block_refs: vec![]` stub. The function correctly handles camelCase JSON keys, base64 decoding for `microThumbnail`, and graceful degradation on malformed JSON.

2. **Client REST history path:** `CHAT_FETCH_HISTORY` handler in `chat.ts` now fetches the raw server response and maps each message through `JSON.parse(msg.block_refs_json)` before returning to the renderer. `CHAT_SEND` handler applies the same transformation for consistency.

3. **Client WS event path:** `chat-events.ts` `newMessageEvent` handler now maps `msg.blockRefs` (protobuf `repeated BlockRef`, camelCase TypeScript) to `block_refs: BlockRefData[]` with all required type conversions (bigint→Number for `size`, Uint8Array→base64 string for `microThumbnail`).

Both commits (`fa28ebe` and `c3c45d4`) verified to exist in git history with correct authorship and file changes matching the SUMMARY claims.

---

_Verified: 2026-02-26_
_Verifier: Claude (gsd-verifier)_
