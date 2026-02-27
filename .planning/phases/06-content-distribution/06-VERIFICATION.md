---
phase: 06-content-distribution
verified: 2026-02-26T10:00:00Z
status: human_needed
score: 14/14 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 12/14
  gaps_closed:
    - "Content resolves through the 5-layer cascade: L0 memory -> L1 local store -> L2 hot peers -> L3 peer directory -> L4 server fallback"
    - "Progressive timeout feedback (shimmer -> 'Fetching from network...' -> 'Content unavailable') accurately reflects network fetching"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "StorageSettings panel renders in app settings"
    expected: "Budget slider (1-50 GB), warm TTL slider (3-30 days), usage bar with tier segments visible"
    why_human: "Component is standalone -- cannot verify it is wired into a settings route from code alone"
  - test: "AttachmentCard renders correctly for different file types"
    expected: "Correct icon for image/video/audio/document/archive/code/generic, formatted size, truncated filename"
    why_human: "SVG icon rendering and visual correctness require human review"
  - test: "ContentPlaceholder renders at exact dimensions without reflow"
    expected: "Placeholder at declared width/height -- no layout shift during loading states (shimmer, fetching, unavailable)"
    why_human: "Zero-reflow behavior is a layout property requiring visual inspection"
---

# Phase 6: Content Distribution Verification Report

**Phase Goal:** Content is stored, replicated, and retrieved through a peer-to-peer block pipeline that makes the server optional for availability while keeping all local data encrypted at rest
**Verified:** 2026-02-26T10:00:00Z
**Status:** human_needed
**Re-verification:** Yes -- after gap closure (plan 06-05)

## Re-Verification Summary

Previous status: gaps_found (12/14)
This re-verification status: human_needed (14/14 automated checks pass)

**Gaps closed by plan 06-05 (commit ecc04fc):**
- `client/src/preload/index.ts` -- `resolveBlock` entry added to blocks namespace at line 226, invoking `IPC.BLOCK_RESOLVE`
- `shared/types/ipc-bridge.ts` -- `resolveBlock(hash: string): Promise<string | null>` added to `UnitedAPI.blocks` interface at line 625-626 with JSDoc
- `client/src/renderer/src/hooks/useBlockContent.ts` -- line 94 changed from `window.united.blocks.getBlock(hash)` to `window.united.blocks.resolveBlock(hash)`; comment updated from "Block not found locally" to "Block not found via cascade"

The full renderer -> preload -> IPC -> cascade chain is now intact. All 14 automated truths pass.

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Server can receive a block upload via REST and store it encrypted with content-derived HKDF key | VERIFIED | `server/src/blocks/routes.rs` put_block_route calls store::put_block which calls crypto::server_encrypt_block; `PUT /api/blocks` wired in routes.rs |
| 2  | Server can serve a stored block back via REST given its SHA-256 hash | VERIFIED | `server/src/blocks/routes.rs` get_block_route calls store::get_block which decrypts then returns; `GET /api/blocks/{hash}` wired |
| 3  | Server automatically purges blocks older than the configured retention TTL | VERIFIED | `server/src/blocks/retention.rs` spawn_retention_cleanup calls store::delete_expired_blocks on configurable interval; wired in main.rs |
| 4  | Block data is encrypted at rest on the server using HKDF-SHA256 content-derived keys | VERIFIED | `server/src/blocks/crypto.rs` derive_content_key uses HKDF-SHA256; store.rs calls encrypt before write, decrypt after read; 5 unit tests |
| 5  | Client can store content as SHA-256 hashed blocks with the hash as the content address | VERIFIED | `client/src/main/blocks/store.ts` putBlock computes computeBlockHash(data), deduplicates, stores encrypted file at {userData}/blocks/{prefix}/{hash} |
| 6  | All blocks written to disk are encrypted with AES-256-GCM (XChaCha20-Poly1305 fallback) using an Argon2id-derived key | VERIFIED | `client/src/main/blocks/crypto.ts` encryptBlock checks sodium.crypto_aead_aes256gcm_is_available(); version-tagged ciphertext (0x01/0x02) |
| 7  | Content is organized into priority tiers (P1 never evict, P2 hot, P3 warm, P4 altruistic) | VERIFIED | `client/src/main/blocks/types.ts` ContentTier enum with P1_NEVER_EVICT=1 through P4_ALTRUISTIC=4 |
| 8  | Silent LRU eviction respects tier ordering and storage budget | VERIFIED | `client/src/main/blocks/tiers.ts` startEvictionSweep runs every 60s, evicts P4 first then P3 then P2, LRU within each tier, P1 never evicted |
| 9  | Block store key is derived at identity unlock and zeroed on lock/quit | VERIFIED | `client/src/main/ipc/crypto.ts` calls initBlockStoreKey on unlock; clearBlockStoreKey called on lock/quit |
| 10 | Received DMs are persisted to block store with P1_NEVER_EVICT tier | VERIFIED | `client/src/main/ws/dm-events.ts` calls putBlock(content, ContentTier.P1_NEVER_EVICT) after decryption; `client/src/main/ipc/dm.ts` same for history/offline paths |
| 11 | Content resolves through the 5-layer cascade: L0 memory -> L1 local -> L2 hot peers -> L3 peer directory -> L4 server fallback | VERIFIED | `useBlockContent.ts` line 94 calls `window.united.blocks.resolveBlock(hash)`; preload maps to `IPC.BLOCK_RESOLVE`; main process handler at `ipc/blocks.ts:83` calls `getBlock()` (cascade); commit ecc04fc |
| 12 | L2 sends block requests to all connected peers in parallel and uses the first response (Promise.any) | VERIFIED | `client/src/main/blocks/protocol.ts` fetchFromHotPeers maps each peer to fetchBlockFromPeer, uses Promise.any with AbortController |
| 13 | All blocks received from peers are verified by SHA-256 hash before acceptance | VERIFIED | `client/src/main/blocks/protocol.ts` fetchBlockFromPeer: computedHash vs requested hash, throws on mismatch |
| 14 | Small content (<50KB) is inlined with gossip messages and large images include block reference with micro-thumbnail | VERIFIED | `client/src/main/p2p/gossipsub.ts` prepareContentForGossip: data.length <= 50*1024 inlines, images >50KB get micro-thumbnail via sharp |

**Score:** 14/14 truths verified

---

## Required Artifacts

### Plan 06-01 (Server Block Store)

| Artifact | Status | Details |
|----------|--------|---------|
| `shared/proto/blocks.proto` | VERIFIED | BlockRef, BlockRequest, BlockResponse, BlockStored, BlockAvailable defined |
| `server/src/blocks/crypto.rs` | VERIFIED | derive_content_key with HKDF-SHA256; server_encrypt_block/server_decrypt_block; 5 unit tests |
| `server/src/blocks/store.rs` | VERIFIED | put_block, get_block, has_block, delete_block, delete_expired_blocks |
| `server/src/blocks/routes.rs` | VERIFIED | PUT /api/blocks and GET /api/blocks/:hash; JWT auth required |
| `server/src/blocks/retention.rs` | VERIFIED | spawn_retention_cleanup loops calling delete_expired_blocks |

### Plan 06-02 (Client Block Store)

| Artifact | Status | Details |
|----------|--------|---------|
| `client/src/main/blocks/types.ts` | VERIFIED | ContentTier enum, BlockMeta, BlockStoreConfig, DEFAULT_BUDGET_BYTES (5GB), DEFAULT_WARM_TTL_DAYS |
| `client/src/main/blocks/crypto.ts` | VERIFIED | deriveBlockStoreKey (Argon2id), encryptBlock (AES-256-GCM/XChaCha20), computeBlockHash |
| `client/src/main/blocks/store.ts` | VERIFIED | putBlock, getLocalBlock, hasBlock, deleteBlock, touchAccess, getStorageUsage |
| `client/src/main/blocks/cache.ts` | VERIFIED | createBlockCache (LRU, 256MB) |
| `client/src/main/blocks/tiers.ts` | VERIFIED | startEvictionSweep, stopEvictionSweep, checkTtlExpiry |
| `client/src/main/ipc/blocks.ts` | VERIFIED | registerBlockHandlers with 8 IPC handlers including BLOCK_RESOLVE cascade |

### Plan 06-03 (Block Protocol and Cascade)

| Artifact | Status | Details |
|----------|--------|---------|
| `client/src/main/blocks/protocol.ts` | VERIFIED | BLOCK_PROTOCOL constant, registerBlockProtocol, fetchBlockFromPeer with hash verification, fetchFromHotPeers with Promise.any |
| `client/src/main/blocks/cascade.ts` | VERIFIED | resolveBlock with all 5 layers; resolveBlockWithProgress variant |

### Plan 06-04 (UI Components)

| Artifact | Status | Details |
|----------|--------|---------|
| `client/src/main/blocks/thumbnails.ts` | VERIFIED | generateMicroThumbnail (100px JPEG q40), isImageMime, getFileMimeType |
| `client/src/renderer/src/components/ContentPlaceholder.tsx` | VERIFIED | Three progress states (cache/fetching/unavailable) at exact dimensions, retry button |
| `client/src/renderer/src/components/AttachmentCard.tsx` | VERIFIED | File type icons for 7 categories, formatted size, download trigger |
| `client/src/renderer/src/hooks/useBlockContent.ts` | VERIFIED | Calls resolveBlock (cascade) at line 94; correct timeout state machine (3s/15s) |
| `client/src/renderer/src/components/StorageSettings.tsx` | VERIFIED | Budget slider (1-50 GB), TTL slider, usage bar by tier |

### Plan 06-05 (Gap Closure -- resolveBlock Wiring)

| Artifact | Status | Details |
|----------|--------|---------|
| `client/src/preload/index.ts` | VERIFIED | `resolveBlock: (hash: string) => ipcRenderer.invoke(IPC.BLOCK_RESOLVE, hash)` at line 226-227 |
| `shared/types/ipc-bridge.ts` | VERIFIED | `resolveBlock(hash: string): Promise<string | null>` at line 625-626 in UnitedAPI.blocks with JSDoc |
| `client/src/renderer/src/hooks/useBlockContent.ts` | VERIFIED | `window.united.blocks.resolveBlock(hash)` at line 94; comment updated to "Block not found via cascade" |

---

## Key Link Verification

### Plan 06-01

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/src/blocks/routes.rs` | `server/src/blocks/store.rs` | route handlers call store functions | WIRED | put_block_route calls store::put_block; get_block_route calls store::get_block |
| `server/src/blocks/store.rs` | `server/src/blocks/crypto.rs` | encrypt before write, decrypt after read | WIRED | crypto::server_encrypt_block at store.rs; crypto::server_decrypt_block on read |
| `server/src/blocks/retention.rs` | `server/src/blocks/store.rs` | purge calls store delete functions | WIRED | store::delete_expired_blocks called in retention.rs |

### Plan 06-02

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `client/src/main/blocks/store.ts` | `client/src/main/blocks/crypto.ts` | encrypt on write, decrypt on read | WIRED | encryptBlock/decryptBlock called in store.ts |
| `client/src/main/blocks/store.ts` | `client/src/main/blocks/cache.ts` | L0 cache updated on put and get | WIRED | getBlockCache().set() and .get() in store.ts |
| `client/src/main/ipc/blocks.ts` | `client/src/main/blocks/index.ts` | IPC handlers call block store API | WIRED | imports putBlock, getLocalBlock etc from ../blocks/index |
| `client/src/main/blocks/crypto.ts` | `client/src/main/ipc/crypto.ts` | block store key derived alongside session key | WIRED | ipc/crypto.ts imports initBlockStoreKey; calls it on unlock |
| `client/src/main/ws/dm-events.ts` | `client/src/main/blocks/index.ts` | received DMs stored as P1 blocks | WIRED | putBlock called with ContentTier.P1_NEVER_EVICT |
| `client/src/main/ipc/dm.ts` | `client/src/main/blocks/index.ts` | history/offline DMs stored as P1 blocks | WIRED | putBlock with P1_NEVER_EVICT in dm.ts |

### Plan 06-03

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `client/src/main/blocks/cascade.ts` | `client/src/main/blocks/store.ts` | L0 and L1 read from local block store | WIRED | getLocalBlock imported and called in cascade.ts |
| `client/src/main/blocks/cascade.ts` | `client/src/main/blocks/protocol.ts` | L2 fetches from connected peers | WIRED | fetchFromHotPeers imported and called in cascade.ts |
| `client/src/main/blocks/cascade.ts` | `server REST /api/blocks/:hash` | L4 server fallback via HTTP fetch | WIRED | fetch(`${serverUrl}/api/blocks/${hash}`) in cascade.ts |
| `client/src/main/blocks/protocol.ts` | `client/src/main/p2p/node.ts` | registers handler on libp2p node | WIRED | node.ts imports and calls registerBlockProtocol |

### Plan 06-04 and 06-05 (Gap Closure Verified)

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `client/src/renderer/src/hooks/useBlockContent.ts` | `client/src/preload/index.ts` | `window.united.blocks.resolveBlock(hash)` | WIRED | useBlockContent.ts line 94 calls resolveBlock; preload blocks namespace line 226-227 maps to IPC.BLOCK_RESOLVE |
| `client/src/preload/index.ts` | `client/src/main/ipc/blocks.ts` | `ipcRenderer.invoke(IPC.BLOCK_RESOLVE, hash)` | WIRED | IPC.BLOCK_RESOLVE = 'block:resolve' (channels.ts line 107); ipcMain.handle(IPC.BLOCK_RESOLVE, ...) at blocks.ts line 83 |
| `client/src/main/ipc/blocks.ts` | `client/src/main/blocks/cascade.ts` | BLOCK_RESOLVE handler calls getBlock() (full cascade) | WIRED | handler at blocks.ts:83 calls getBlock(hash) from ../blocks/index which is the 5-layer cascade |
| `client/src/renderer/src/components/ContentPlaceholder.tsx` | `useBlockContent.ts` | placeholder uses hook's loading/error state | WIRED | imports BlockLoadingProgress type; progress prop typed against hook's return |
| `client/src/main/blocks/thumbnails.ts` | `client/src/main/p2p/gossipsub.ts` | thumbnail generated before gossip publish for images | WIRED | gossipsub.ts imports generateMicroThumbnail; calls it for images >50KB |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|-------------|-------------|--------|---------|
| P2P-01 | 06-01, 06-02 | All content is stored as content-addressed blocks (SHA-256 hashed) | SATISFIED | server/src/blocks/store.rs computes SHA-256 on upload; client/src/main/blocks/store.ts uses computeBlockHash; both use hash as content address |
| P2P-03 | 06-03, 06-05 | 5-layer cache cascade: L0 memory -> L1 local -> L2 hot peers -> L3 DHT -> L4 server | SATISFIED | cascade.ts implements all 5 layers; BLOCK_RESOLVE handler calls getBlock(); preload bridge now exposes resolveBlock(); useBlockContent.ts calls resolveBlock(). Full chain verified via commit ecc04fc. |
| P2P-05 | 06-02 | Content managed in priority tiers: P1 never evict -> P2 hot -> P3 warm -> P4 altruistic | SATISFIED | ContentTier enum defined; tiers.ts enforces P1 never-evict; eviction sweeps P4->P3->P2 in LRU order |
| P2P-06 | 06-01 | Coordination server acts as fallback super-seeder, encrypted copy for thin swarms | SATISFIED | Server block store with HKDF-encrypted files; GET /api/blocks/:hash decrypts before serving; retention cleanup runs on configurable interval |
| P2P-09 | 06-03 | Requests sent to multiple peers in parallel, first-responder-wins | SATISFIED | protocol.ts fetchFromHotPeers uses Promise.any across all connected peers; AbortController cancels remaining on first success |
| P2P-10 | 06-04 | Message text + thumbnails (<50KB) inlined with gossip; full-res media deferred | SATISFIED | gossipsub.ts prepareContentForGossip: <=50KB inline, >50KB images get block ref + micro-thumbnail, non-images get metadata-only ref |
| SEC-04 | 06-02 | All content in local block store encrypted with AES-256-GCM using Argon2id-derived key | SATISFIED | blocks/crypto.ts: Argon2id key derivation (256MB, 3 iterations, dedicated salt); encryptBlock uses AES-256-GCM (XChaCha20 fallback); version-tagged |
| APP-04 | 06-04 | All media attachments declare dimensions upfront; zero reflow during loading | SATISFIED | ContentPlaceholder uses inline style with width/maxWidth/aspectRatio from declared dimensions; container established before content loads |

**Requirements summary:** 8/8 fully satisfied. P2P-03 was partial in initial verification (cascade built but not wired to renderer); now fully satisfied after plan 06-05 wired resolveBlock through the preload bridge.

---

## Anti-Patterns Found

No blocker anti-patterns. The previously identified blockers have been resolved:

- `client/src/preload/index.ts` -- resolveBlock now present (gap closed)
- `client/src/renderer/src/hooks/useBlockContent.ts` -- calls resolveBlock not getBlock (gap closed)

Remaining informational item from initial verification:
| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `server/src/blocks/store.rs` | No disk-based verification on get_block (trusts metadata presence) | INFO | If metadata exists but file deleted externally, returns decrypt error. Not a security issue. |

---

## Human Verification Required

### 1. StorageSettings Integration

**Test:** Navigate to app settings and find the storage settings panel
**Expected:** Budget slider (1-50 GB), warm TTL slider (3-30 days), visual usage bar with P1/P2-P3/P4 tier segments
**Why human:** StorageSettings.tsx is a standalone component -- cannot verify from code alone that it is wired into a settings route

### 2. ContentPlaceholder Zero-Reflow

**Test:** Load a message with a large image reference; observe the placeholder area before and after content loads
**Expected:** Container dimensions stay fixed throughout all 3 states (shimmer, fetching, unavailable). No layout shift.
**Why human:** Zero-reflow is a visual/layout property that cannot be verified programmatically

### 3. AttachmentCard File Type Icons

**Test:** Share files of various types (image, PDF, zip, video, code) in a channel
**Expected:** Each card shows the correct category icon, formatted file size, and truncated filename
**Why human:** SVG icon rendering and visual correctness require human review

---

## Gap Closure Verification

**Root cause (initial):** The 5-layer cache cascade was correctly implemented in the main process but was never connected to the renderer through the preload bridge. `useBlockContent.ts` called `window.united.blocks.getBlock(hash)` (local-only) instead of the cascade.

**Fix applied (plan 06-05, commit ecc04fc, 2026-02-26T08:49:55Z):**

1. `client/src/preload/index.ts` lines 226-227: `resolveBlock: (hash: string) => ipcRenderer.invoke(IPC.BLOCK_RESOLVE, hash) as Promise<string | null>` added to blocks namespace
2. `shared/types/ipc-bridge.ts` lines 625-626: `resolveBlock(hash: string): Promise<string | null>` added to UnitedAPI.blocks interface with JSDoc
3. `client/src/renderer/src/hooks/useBlockContent.ts` line 94: `window.united.blocks.getBlock(hash)` changed to `window.united.blocks.resolveBlock(hash)`; comment updated to "Block not found via cascade"

**Verified chain:**
```
useBlockContent.ts line 94
  -> window.united.blocks.resolveBlock(hash)   [preload/index.ts line 226]
  -> ipcRenderer.invoke('block:resolve', hash)  [channels.ts line 107]
  -> ipcMain.handle(IPC.BLOCK_RESOLVE, ...)     [ipc/blocks.ts line 83]
  -> getBlock(hash)                             [blocks/index.ts]
  -> cascade.ts resolveBlock(hash)              [L0->L1->L2->L3->L4]
```

All 5 cascade layers (L0 memory, L1 local store, L2 hot peers via Promise.any, L3 peer directory, L4 server HTTP fallback) are now reachable from the renderer. The progressive timeout states (3s shimmer, 15s unavailable) accurately correspond to real network fetching activity when content is not locally available.

---

*Verified: 2026-02-26T10:00:00Z*
*Verifier: Claude (gsd-verifier)*
*Re-verification: Yes -- gap closure after plan 06-05*
