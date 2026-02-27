# Phase 10: Fix Media Attachment Wiring - Research

**Researched:** 2026-02-26
**Domain:** Client-side IPC data transformation, protobuf-to-TypeScript field mapping
**Confidence:** HIGH

## Summary

Phase 10 fixes a critical integration break where media attachments never render in channel messages despite all UI components (InlineImage, InlineVideo, ImageGrid, AttachmentCard, Lightbox, BlurhashPlaceholder) being fully implemented and correct. The root cause is a two-path type mismatch between the server's data format and the client's expected `ChatMessage.block_refs` field.

The REST history path returns `block_refs_json` as a serialized JSON string (`Option<String>`), but the client IPC handler passes it through without parsing, leaving `block_refs` undefined on the `ChatMessage` interface. The WS live delivery path has a compounding problem: the server builds the protobuf `ChatMessage` with `block_refs: vec![]` (empty) even when `block_refs_json` data exists, AND the client `chat-events.ts` handler omits the `block_refs` field entirely when constructing the `ChatEvent.message` object. The result is that `MessageRow.tsx` falls back to `message.block_refs ?? []`, no error is thrown, and media silently never renders.

**Primary recommendation:** Fix both data paths: (1) parse `block_refs_json` via `JSON.parse()` in the `CHAT_FETCH_HISTORY` IPC handler, (2) parse `block_refs_json` into the protobuf `block_refs` repeated field on the server before WS broadcast, and (3) map `msg.blockRefs` to `block_refs` in `chat-events.ts`. All three changes are small, isolated, and low-risk.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MEDIA-01 (fix) | User can upload and share files in channels and DMs | REST history and WS live paths must populate `block_refs` so uploaded files are visible after send and on reload |
| MEDIA-02 (fix) | User can see images and videos rendered inline within messages | `InlineImage`, `InlineVideo`, `ImageGrid` components are implemented but receive empty `block_refs` -- fix data wiring enables rendering |
| MEDIA-03 (fix) | User sees blurhash placeholders at exact aspect ratio while media loads | `BlurhashPlaceholder` and `ContentPlaceholder` are implemented but never receive `BlockRefData` with `blurhash`/`width`/`height` due to empty `block_refs` |
| MEDIA-04 (fix) | Media is chunked into content-addressed blocks and distributed across the peer swarm | Block storage and distribution are fully implemented; the gap is that `block_refs` metadata never reaches the UI to trigger block resolution via `useBlockContent` |
</phase_requirements>

## Standard Stack

### Core

No new libraries are needed. All required infrastructure exists.

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| @bufbuild/protobuf | (existing) | Protobuf decode/encode for WS events | Already installed, used by chat-events.ts |
| serde_json | (existing) | JSON deserialization on server side | Already in server Cargo.toml |

### Supporting

No new supporting libraries needed.

### Alternatives Considered

None -- this is a bug fix, not a feature implementation.

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Pattern 1: REST History block_refs Parsing (Client IPC Handler)

**What:** The `CHAT_FETCH_HISTORY` IPC handler in `client/src/main/ipc/chat.ts` receives `MessageResponse` objects from the server REST API where `block_refs_json` is `Option<String>` (a JSON-serialized string). The client `ChatMessage` interface expects `block_refs?: BlockRefData[]` (a parsed array). The handler must transform each message after the API call.

**Where:** `client/src/main/ipc/chat.ts` lines 100-117

**Current code (broken):**
```typescript
// Returns raw API response without parsing block_refs_json
return apiGet<ChatHistoryResponse>(url, path, token)
```

**Fix pattern:**
```typescript
const raw = await apiGet<RawChatHistoryResponse>(url, path, token)
return {
  ...raw,
  messages: raw.messages.map(msg => ({
    ...msg,
    block_refs: msg.block_refs_json
      ? JSON.parse(msg.block_refs_json)
      : undefined,
  }))
}
```

**Key detail:** The JSON stored in `block_refs_json` uses camelCase field names (`hash`, `size`, `mimeType`, `width`, `height`, `microThumbnail`, `blurhash`, `filename`) because it was serialized by the client's `media.ts` handler via `JSON.stringify(blockRefs)` where `blockRefs` is a `BlockRefData[]`. This matches the `BlockRefData` interface exactly -- no field renaming is needed.

**Confidence:** HIGH -- verified by reading the serialization code in `client/src/main/ipc/media.ts` lines 154-163 and the interface in `shared/types/ipc-bridge.ts` lines 177-186.

### Pattern 2: WS Live Delivery block_refs Population (Server)

**What:** The server's `create_message` handler in `server/src/chat/messages.rs` builds a protobuf `ChatMessage` for WS broadcast but sets `block_refs: vec![]` (line 187) even when `block_refs_json` contains valid data. The server must parse the JSON and populate the protobuf `repeated BlockRef` field.

**Where:** `server/src/chat/messages.rs` lines 173-188

**Current code (broken):**
```rust
let chat_message = proto_chat::ChatMessage {
    // ...
    block_refs: vec![], // Block refs are carried as JSON in REST responses, not as proto in WS
};
```

**Fix pattern:**
```rust
use crate::proto::blocks as proto_blocks;

// Parse block_refs_json into protobuf BlockRef structs
let block_refs = block_refs_json
    .as_ref()
    .and_then(|json| serde_json::from_str::<Vec<serde_json::Value>>(json).ok())
    .map(|refs| {
        refs.iter()
            .filter_map(|r| {
                Some(proto_blocks::BlockRef {
                    hash: r.get("hash")?.as_str()?.to_string(),
                    size: r.get("size")?.as_u64().unwrap_or(0),
                    mime_type: r.get("mimeType")?.as_str()?.to_string(),
                    width: r.get("width")?.as_u64().unwrap_or(0) as u32,
                    height: r.get("height")?.as_u64().unwrap_or(0) as u32,
                    micro_thumbnail: r.get("microThumbnail")
                        .and_then(|v| v.as_str())
                        .and_then(|s| base64_decode(s).ok())
                        .unwrap_or_default(),
                    filename: r.get("filename")?.as_str()?.to_string(),
                    blurhash: r.get("blurhash")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                })
            })
            .collect()
    })
    .unwrap_or_default();

let chat_message = proto_chat::ChatMessage {
    // ...
    block_refs,
};
```

**Key detail:** The JSON uses camelCase (`mimeType`, `microThumbnail`) while the protobuf uses snake_case (`mime_type`, `micro_thumbnail`). The `micro_thumbnail` field is `bytes` in proto but stored as base64 string in JSON -- requires base64 decode. The `size` is `uint64` in proto, serialized as a JSON number.

**Confidence:** HIGH -- verified by reading the proto definition in `shared/proto/blocks.proto` and the JSON structure in `client/src/main/ipc/media.ts`.

### Pattern 3: WS Event Handler block_refs Mapping (Client)

**What:** The `chat-events.ts` handler constructs `ChatEvent.message` from the protobuf `ChatMessage` but omits the `block_refs` field. It must map `msg.blockRefs` (the protobuf repeated field, camelCase in generated TypeScript) to `block_refs` (the ChatMessage interface field, snake_case).

**Where:** `client/src/main/ws/chat-events.ts` lines 32-46

**Current code (broken):**
```typescript
const chatEvent: ChatEvent = {
  type: 'new',
  message: {
    id: msg.id,
    channel_id: msg.channelId,
    // ... other fields ...
    reactions: []
    // block_refs is missing!
  }
}
```

**Fix pattern:**
```typescript
const chatEvent: ChatEvent = {
  type: 'new',
  message: {
    // ... existing fields ...
    reactions: [],
    block_refs: msg.blockRefs.length > 0
      ? msg.blockRefs.map(br => ({
          hash: br.hash,
          size: Number(br.size),
          mimeType: br.mimeType,
          width: br.width,
          height: br.height,
          microThumbnail: br.microThumbnail.length > 0
            ? Buffer.from(br.microThumbnail).toString('base64')
            : undefined,
          blurhash: br.blurhash || undefined,
          filename: br.filename,
        }))
      : undefined,
  }
}
```

**Key detail:** Protobuf `BlockRef.micro_thumbnail` is `bytes` (Uint8Array in TypeScript), but `BlockRefData.microThumbnail` is `string` (base64-encoded). The mapping must convert Uint8Array to base64 string. Protobuf `BlockRef.size` is `uint64` which generates as `bigint` in protobuf-es -- needs `Number()` cast. Field name mapping: proto camelCase `mimeType` matches interface `mimeType`, proto `microThumbnail` matches interface `microThumbnail`.

**Confidence:** HIGH -- verified by reading the proto definition, generated types convention of @bufbuild/protobuf, and the BlockRefData interface.

### Pattern 4: CHAT_SEND REST Response Parsing (Client IPC Handler)

**What:** The `CHAT_SEND` IPC handler in `client/src/main/ipc/chat.ts` also returns a `ChatMessage` from the REST API. When a message has block_refs (sent via the MEDIA_UPLOAD_FILES handler), the REST response includes `block_refs_json`. While the MessageComposer doesn't currently use the return value, the CHAT_SEND handler should also parse `block_refs_json` for consistency and future correctness.

**Where:** `client/src/main/ipc/chat.ts` lines 78-97

**Confidence:** HIGH -- same pattern as Pattern 1.

### Anti-Patterns to Avoid

- **Parsing JSON in the renderer process:** The `block_refs_json` parsing must happen in the main process IPC handler, not in the renderer. The renderer receives typed `ChatMessage` objects via IPC -- it should never see raw JSON strings.
- **Modifying the server REST API contract:** Do not change `MessageResponse` to return parsed objects instead of `block_refs_json`. The JSON string format is the established server convention. Parse on the client side.
- **Ignoring the server WS broadcast gap:** The plan title says "client" but the server sends `block_refs: vec![]` on the WS broadcast. Without the server fix, other clients receiving live messages will never see media attachments. This is a critical finding.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parsing | Custom parser | `JSON.parse()` / `serde_json` | Standard, handles all edge cases |
| Protobuf field mapping | Manual binary parsing | Generated TypeScript types from `@bufbuild/protobuf` | Already generated, type-safe |
| Base64 encoding | Manual conversion | `Buffer.from(bytes).toString('base64')` (Node.js) | Standard, handles padding |
| BigInt to number | Bitwise tricks | `Number(bigintValue)` | Safe for file sizes under 2^53 |

**Key insight:** Every component of the fix uses existing infrastructure. No new libraries, no new patterns. The issue is purely about connecting existing, working pieces.

## Common Pitfalls

### Pitfall 1: Forgetting the Server WS Broadcast Fix

**What goes wrong:** If only the client is fixed, the REST history path works but live-delivered messages from other users still have empty `block_refs`. The sender might see their own attachment (if the REST response is used) but no one else will.
**Why it happens:** The plan is labeled "client" but the server explicitly sets `block_refs: vec![]` on line 187 of `messages.rs`.
**How to avoid:** Fix the server's `create_message` handler to parse `block_refs_json` into the protobuf `block_refs` field before broadcasting.
**Warning signs:** Media appears on page refresh (REST history path works) but not when a new message arrives in real-time (WS path still empty).

### Pitfall 2: Protobuf uint64 to JavaScript Number

**What goes wrong:** Protobuf `uint64` fields (like `BlockRef.size`) are generated as `bigint` by `@bufbuild/protobuf`. If passed directly to the `BlockRefData` interface (which expects `number`), TypeScript will type-error or the value will serialize incorrectly across IPC.
**Why it happens:** `@bufbuild/protobuf` (protobuf-es) uses native BigInt for 64-bit integers by default.
**How to avoid:** Explicitly cast with `Number(br.size)`. File sizes will never exceed `Number.MAX_SAFE_INTEGER` (9 PB).
**Warning signs:** TypeScript compilation errors about `bigint` not assignable to `number`.

### Pitfall 3: Protobuf bytes to Base64 String

**What goes wrong:** Protobuf `bytes` field (`micro_thumbnail`) arrives as `Uint8Array` in TypeScript but `BlockRefData.microThumbnail` expects a base64-encoded `string`. Passing Uint8Array directly will cause the image to not render.
**Why it happens:** Protobuf binary types don't auto-convert to base64.
**How to avoid:** Use `Buffer.from(br.microThumbnail).toString('base64')` in the main process (Node.js has Buffer). Check for empty Uint8Array and use `undefined` instead of empty string.
**Warning signs:** Micro-thumbnail shows as broken image or garbled data URL.

### Pitfall 4: JSON Field Name Mismatch (camelCase)

**What goes wrong:** The `block_refs_json` string uses camelCase field names (`mimeType`, `microThumbnail`) because it was serialized from a TypeScript `BlockRefData` object. If the parsing code assumes snake_case, fields will be undefined.
**Why it happens:** Assumption that server-stored JSON follows Rust naming conventions.
**How to avoid:** The JSON matches `BlockRefData` interface field names exactly. On the Rust server side, when parsing JSON to build proto BlockRef, use the camelCase keys: `mimeType` not `mime_type`, `microThumbnail` not `micro_thumbnail`.
**Warning signs:** Parsed block_refs have correct `hash` but undefined `mimeType`.

### Pitfall 5: Empty block_refs_json Edge Cases

**What goes wrong:** `block_refs_json` can be `null` (SQL NULL when no attachments), `"null"` (unlikely but defensive), `"[]"` (empty array), or a valid JSON array string. The parsing code must handle all cases.
**Why it happens:** `Option<String>` in Rust serializes to `null` in JSON when `None`.
**How to avoid:** Check for nullish values and empty arrays before parsing. Use optional chaining: `msg.block_refs_json ? JSON.parse(msg.block_refs_json) : undefined`.
**Warning signs:** `JSON.parse(null)` throws at runtime.

### Pitfall 6: Server serde_json Dependency

**What goes wrong:** `serde_json` may not be explicitly listed in `Cargo.toml` as a direct dependency (it could be transitional via `axum` or `serde`).
**Why it happens:** The server uses `Json<T>` extractors from axum but may not call `serde_json::from_str` directly elsewhere.
**How to avoid:** Verify `serde_json` is in `Cargo.toml`. If not, add it. It's almost certainly already there given the server uses JSON extensively.
**Warning signs:** Compilation error: `use of undeclared crate serde_json`.

## Code Examples

### Example 1: Parsing block_refs_json in IPC Handler

```typescript
// Source: client/src/main/ipc/chat.ts — CHAT_FETCH_HISTORY handler
// Transform server response to parse block_refs_json into typed block_refs

interface RawMessageResponse {
  id: string
  channel_id: string
  sender_pubkey: string
  sender_display_name: string
  content: string
  timestamp: number
  server_sequence: number
  reply_to_id: string | null
  edited: boolean
  reactions: ReactionSummary[]
  block_refs_json: string | null  // Server returns JSON string
}

interface RawHistoryResponse {
  messages: RawMessageResponse[]
  has_more: boolean
}

function parseBlockRefs(raw: RawMessageResponse): ChatMessage {
  return {
    id: raw.id,
    channel_id: raw.channel_id,
    sender_pubkey: raw.sender_pubkey,
    sender_display_name: raw.sender_display_name,
    content: raw.content,
    timestamp: String(raw.timestamp),
    server_sequence: raw.server_sequence,
    reply_to_id: raw.reply_to_id,
    reply_to_preview: null,
    edited_at: raw.edited ? 'edited' : null,
    reactions: raw.reactions ?? [],
    block_refs: raw.block_refs_json
      ? JSON.parse(raw.block_refs_json)
      : undefined,
  }
}
```

### Example 2: Mapping Protobuf BlockRef to BlockRefData

```typescript
// Source: client/src/main/ws/chat-events.ts — newMessageEvent case
// Map protobuf repeated BlockRef to typed BlockRefData[]

import type { BlockRefData } from '@shared/ipc-bridge'

function mapBlockRefs(protoRefs: Array<{
  hash: string
  size: bigint
  mimeType: string
  width: number
  height: number
  microThumbnail: Uint8Array
  filename: string
  blurhash: string
}>): BlockRefData[] | undefined {
  if (protoRefs.length === 0) return undefined
  return protoRefs.map(br => ({
    hash: br.hash,
    size: Number(br.size),
    mimeType: br.mimeType,
    width: br.width,
    height: br.height,
    microThumbnail: br.microThumbnail.length > 0
      ? Buffer.from(br.microThumbnail).toString('base64')
      : undefined,
    blurhash: br.blurhash || undefined,
    filename: br.filename,
  }))
}
```

### Example 3: Server-Side JSON to Protobuf Conversion

```rust
// Source: server/src/chat/messages.rs — create_message handler
// Parse block_refs_json into protobuf BlockRef repeated field

use crate::proto::blocks as proto_blocks;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;

fn parse_block_refs_json(json: &Option<String>) -> Vec<proto_blocks::BlockRef> {
    let Some(json_str) = json else { return vec![] };
    let Ok(values) = serde_json::from_str::<Vec<serde_json::Value>>(json_str) else {
        return vec![];
    };
    values.iter().filter_map(|r| {
        Some(proto_blocks::BlockRef {
            hash: r.get("hash")?.as_str()?.to_string(),
            size: r.get("size")?.as_u64().unwrap_or(0),
            mime_type: r.get("mimeType")?.as_str()?.to_string(),
            width: r.get("width")?.as_u64().unwrap_or(0) as u32,
            height: r.get("height")?.as_u64().unwrap_or(0) as u32,
            micro_thumbnail: r.get("microThumbnail")
                .and_then(|v| v.as_str())
                .and_then(|s| BASE64.decode(s).ok())
                .unwrap_or_default(),
            filename: r.get("filename")?.as_str()?.to_string(),
            blurhash: r.get("blurhash")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
    }).collect()
}
```

## Data Flow Analysis

### Current Flow (Broken)

```
UPLOAD PATH:
  media.ts → builds BlockRefData[] → JSON.stringify → REST POST body.block_refs_json
  Server → stores block_refs_json in SQLite → builds proto ChatMessage{block_refs: vec![]}
  Server → WS broadcast → chat-events.ts → constructs ChatEvent WITHOUT block_refs
  Renderer → MessageRow reads message.block_refs → undefined → no media

HISTORY PATH:
  Renderer → window.united.chat.fetchHistory → IPC → chat.ts CHAT_FETCH_HISTORY
  chat.ts → apiGet<ChatHistoryResponse> → server returns {block_refs_json: "..."}
  chat.ts → returns raw response → block_refs_json is NOT parsed → block_refs undefined
  Renderer → MessageRow reads message.block_refs → undefined → no media
```

### Fixed Flow (Target)

```
UPLOAD PATH:
  media.ts → builds BlockRefData[] → JSON.stringify → REST POST body.block_refs_json
  Server → stores block_refs_json in SQLite → PARSES JSON → builds proto ChatMessage{block_refs: [BlockRef...]}
  Server → WS broadcast → chat-events.ts → MAPS msg.blockRefs to block_refs: BlockRefData[]
  Renderer → MessageRow reads message.block_refs → [BlockRefData...] → media renders!

HISTORY PATH:
  Renderer → window.united.chat.fetchHistory → IPC → chat.ts CHAT_FETCH_HISTORY
  chat.ts → apiGet → server returns {block_refs_json: "[...]"}
  chat.ts → JSON.parse(block_refs_json) → block_refs: BlockRefData[]
  Renderer → MessageRow reads message.block_refs → [BlockRefData...] → media renders!
```

### Files Changed

| File | Change | Side |
|------|--------|------|
| `client/src/main/ipc/chat.ts` | Parse `block_refs_json` in CHAT_FETCH_HISTORY and CHAT_SEND handlers | Client |
| `client/src/main/ws/chat-events.ts` | Map `msg.blockRefs` to `block_refs` in newMessageEvent case | Client |
| `server/src/chat/messages.rs` | Parse `block_refs_json` into proto `block_refs` field before WS broadcast | Server |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `block_refs: vec![]` in proto (skip WS) | Parse JSON into proto repeated field | This phase | Enables live media delivery via WS |
| Raw `block_refs_json` passthrough | Parse in IPC handler, return typed array | This phase | Enables history media rendering |

**Deprecated/outdated:**
- The comment "Block refs are carried as JSON in REST responses, not as proto in WS" at `messages.rs` line 187 reflects an intentional design gap that must now be closed.

## Open Questions

1. **Server `base64` crate availability**
   - What we know: The server uses base64 for DM encrypted blobs (`base64::Engine`). The `base64` crate is likely already in `Cargo.toml`.
   - What's unclear: The exact version and import path.
   - Recommendation: Check `Cargo.toml` before implementing. If not present, add `base64 = "0.22"`. If present, use existing version.

2. **Protobuf-es `size` field type**
   - What we know: `@bufbuild/protobuf` generates `uint64` as `bigint` by default. The `BlockRefData` interface uses `number`.
   - What's unclear: Whether the project has configured protobuf-es to use `number` instead of `bigint` for 64-bit types.
   - Recommendation: Check the `buf.gen.yaml` for `jstype` or `bigIntAsLong` options. If `bigint`, use `Number()` cast. If `number`, no cast needed. The `chat-events.ts` already uses `Number(msg.serverSequence)` on line 41, confirming that `bigint` is the default.

3. **Whether the plan should be split into server + client**
   - What we know: The roadmap labels 10-01-PLAN as "Wave 1, client" but the server needs a fix too.
   - What's unclear: Whether the plan should be a single plan with server + client tasks or two separate plans.
   - Recommendation: Single plan is sufficient given the small scope. Add a server task before the client tasks in the same plan. The total change is ~20 lines of code across 3 files.

## Sources

### Primary (HIGH confidence)
- `server/src/chat/messages.rs` — Direct source code analysis confirming `block_refs: vec![]` on line 187 and `block_refs_json` passthrough on lines 44, 201, 260, 273
- `client/src/main/ipc/chat.ts` — Direct source code analysis confirming no `block_refs_json` parsing in CHAT_FETCH_HISTORY handler
- `client/src/main/ws/chat-events.ts` — Direct source code analysis confirming `block_refs` omitted from ChatEvent.message construction (lines 32-46)
- `shared/types/ipc-bridge.ts` — BlockRefData interface definition (lines 177-186) and ChatMessage interface (lines 188-201)
- `shared/proto/blocks.proto` — BlockRef protobuf message definition (lines 6-15)
- `shared/proto/chat.proto` — ChatMessage proto with `repeated BlockRef block_refs = 13` (line 21)
- `client/src/main/ipc/media.ts` — Upload handler showing JSON serialization format (lines 154-163, 185)
- `client/src/renderer/src/components/MessageRow.tsx` — Consumer showing `message.block_refs ?? []` fallback (line 127)
- `.planning/v1.0-MILESTONE-AUDIT.md` — Audit report documenting the integration break (sections 3a, 3b)

### Secondary (MEDIUM confidence)
- @bufbuild/protobuf convention: `uint64` generates as `bigint`, `bytes` generates as `Uint8Array` — verified by existing `Number(msg.serverSequence)` pattern in `chat-events.ts` line 41

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all infrastructure exists
- Architecture: HIGH — all code paths traced through source, exact lines identified
- Pitfalls: HIGH — all type mismatches verified by reading both sides of each boundary

**Research date:** 2026-02-26
**Valid until:** Indefinite — this is a bug fix based on current source code analysis, not library versions
