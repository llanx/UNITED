# Phase 6: Content Distribution - Research

**Researched:** 2026-02-25
**Domain:** Content-addressed block storage, encrypted P2P content resolution, tiered caching
**Confidence:** HIGH (core patterns well-understood, existing codebase provides strong foundation)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Default storage budget: 5 GB on fresh install
- User-configurable via a settings slider in the app (range e.g. 1-50 GB), showing current usage vs. budget
- Silent LRU eviction -- no notifications, no popups. When budget is full, oldest/least-used blocks in lower tiers are quietly evicted. Content re-fetches from peers/server if needed later.
- P1 tier (never evict) includes: messages the user authored AND DMs received by the user. DMs are protected because in E2E encryption, the sender and recipient are the only ones who can decrypt -- evicting a received DM risks permanent loss.
- Warm tier TTL is user-configurable alongside the storage slider (e.g. 3-30 days)
- When budget and TTL conflict: budget wins. TTL is best-effort, labeled "Keep content for X days (space permitting)". Disk budget is the hard limit.
- While fetching from peers: shimmer placeholder at exact content dimensions (consistent with Phase 1 loading pattern)
- Progressive timeout for peer resolution: 0-3s shimmer, 3-15s "Fetching from network..." text, after 15s "Content unavailable" error with retry button
- Unavailable state preserves original dimensions -- zero reflow per APP-04
- Retry button triggers a full 5-layer cascade retry (same code path as initial fetch, same progressive timeout)
- Server retention TTL: 30 days by default, configurable by admin in `united.toml`
- Server acts as super-seeder for the configured retention window. After TTL expires, blocks are purged.
- Server stores channel content blocks encrypted at rest using content-derived keys (HKDF from SHA-256 content hash). Prevents casual disk browsing without requiring key distribution infrastructure. Anyone who knows the content hash can derive the decryption key.
- DM blocks are stored with full E2E encryption (X25519 per Phase 5 design) -- a stronger guarantee than content-derived keys.
- Message text + thumbnails under 50KB: Inlined with gossip messages for instant rendering
- Link previews: Sender's client fetches OG metadata at compose time and includes it in the gossip payload if total stays under 50KB
- Images over 50KB: Gossip message includes block reference (hash + dimensions) plus a micro-thumbnail (~100px JPEG, <5KB)
- Non-image files over 50KB: Metadata only inlined -- filename, size, MIME type. Renders a clean file attachment card immediately with name + size + type icon + download trigger

### Claude's Discretion
- Block chunking strategy for large files (fixed-size chunks, content-defined chunking, etc.)
- Exact HKDF parameters for content-derived encryption keys
- Memory cache (L0) sizing and eviction policy
- LRU eviction implementation details (tracking access times, cleanup scheduling)
- Exact micro-thumbnail generation parameters (quality, dimensions)
- File type icon set for attachment cards
- Argon2id parameters for local block store encryption key derivation

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| P2P-01 | All content is stored as content-addressed blocks (SHA-256 hashed, fixed-size chunks for media) | SHA-256 via Node.js `crypto.createHash('sha256')` (client) and `sha2` crate (server). Fixed 256KB chunk size recommended. Block metadata in SQLite, block data as encrypted files or SQLite blobs. |
| P2P-03 | Content is fetched through a 5-layer cache cascade: L0 in-memory, L1 local SQLite/block store, L2 hot peers (active connections), L3 DHT/swarm discovery, L4 coordination server fallback | L0: `lru-cache` npm (maxSize by bytes). L1: better-sqlite3 block index + encrypted file store. L2: Custom libp2p protocol `/united/block/1.0.0` with `Promise.race()` parallel fetch. L3: Peer directory query via existing WS. L4: REST `GET /api/blocks/:hash`. |
| P2P-05 | Content is managed in priority tiers: P1 own messages (never evict), P2 hot 24h, P3 warm 2-7 day, P4 altruistic seeding, with 7-day default TTL and LRU eviction | SQLite `blocks` table with tier column, `last_accessed_at` timestamp, `created_at`. Background eviction sweep on interval. Budget-first, TTL-second priority. |
| P2P-06 | Coordination server acts as a fallback super-seeder, maintaining an encrypted copy of content for availability when the peer swarm is thin | Server stores blocks encrypted with content-derived HKDF keys. REST endpoints for block upload/download. Admin-configurable 30-day retention TTL with background purge. |
| P2P-09 | Requests are sent to multiple peers in parallel (first-responder-wins) for low-latency content fetching | `Promise.any()` over parallel `dialProtocol()` streams to connected peers. Falls through to next cascade layer on all-reject. 3-second per-peer timeout. |
| P2P-10 | Message text + thumbnails (<50KB) are inlined with gossip messages for instant rendering; full-res media is deferred and pulled on demand | Extend GossipEnvelope payload with optional `inline_content` field. Block references carry hash + dimensions + optional micro-thumbnail bytes. |
| SEC-04 | All content written to the local block store is encrypted with AES-256-GCM using a key derived from the user's credentials via Argon2id | Derive block store key from passphrase using existing Argon2id parameters (256MB/3 iterations/4 parallelism) with a dedicated salt. Use `sodium.crypto_aead_aes256gcm_*` if AES-NI available, otherwise fall back to XChaCha20-Poly1305 (already used in codebase). |
| APP-04 | All media attachments declare dimensions upfront; fixed layout with zero reflow during content loading | Dimensions stored in block reference metadata (width + height). Shimmer placeholder component renders at exact dimensions. CSS `aspect-ratio` + `max-width` constraints. |
</phase_requirements>

## Summary

Phase 6 builds a content-addressed block pipeline that transforms UNITED from storing messages as raw text in SQLite to storing all content as SHA-256-hashed blocks that can be encrypted, replicated, and fetched from the peer swarm. The core architecture has four parts: (1) a local encrypted block store backed by better-sqlite3 metadata + file-based encrypted block data, (2) a 5-layer cache cascade for content resolution, (3) a custom libp2p protocol for peer-to-peer block exchange, and (4) a server-side encrypted block store acting as super-seeder fallback.

The project's existing stack (sodium-native, better-sqlite3, libp2p 3.1.3, protobuf) provides all the building blocks needed. No major new dependencies are required beyond `lru-cache` for the L0 memory cache and `sharp` for micro-thumbnail generation (both well-established, `sharp` needs electron-rebuild like the existing native modules). The biggest architectural shift is introducing a block abstraction layer between the message/content layer and storage -- all reads and writes go through the block store API, which handles encryption, caching, and P2P resolution transparently.

**Primary recommendation:** Build the block store as a layered module in the Electron main process (`client/src/main/blocks/`) with a clean async API (`putBlock(data) -> hash`, `getBlock(hash) -> data`), then wire the cache cascade behind `getBlock` and the encryption behind `putBlock`. The server gets a parallel `blocks` module in Rust with HKDF-encrypted storage and REST endpoints.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sodium-native` | 4.x (existing) | AES-256-GCM / XChaCha20-Poly1305 block encryption, Argon2id key derivation | Already in project. Hardware-accelerated crypto. |
| `better-sqlite3` | 12.x (existing) | Block metadata index (hash, tier, size, timestamps, dimensions) | Already in project. WAL mode for concurrent reads. |
| `lru-cache` | 11.x | L0 in-memory block cache with byte-size budgeting | 750M+ weekly npm downloads. TypeScript native. `maxSize` + `sizeCalculation` for byte-level control. |
| `libp2p` | 3.1.3 (existing) | Custom `/united/block/1.0.0` protocol for P2P block exchange | Already in project. `handle()` + `dialProtocol()` pattern for request-response streams. |
| `it-length-prefixed-stream` | 2.x | Length-prefixed framing for block exchange streams | Standard libp2p pattern for request-response protocols. Varint-prefixed messages. |
| `sharp` | 0.34.x | Micro-thumbnail generation (~100px JPEG) for image block references | Fastest Node.js image processing. libvips-based. Needs electron-rebuild. |
| Node.js `crypto` | built-in | SHA-256 hashing (`createHash`), HKDF (`hkdfSync`) | No dependency needed. `hkdfSync('sha256', ikm, salt, info, keylen)` for content-derived keys. |

### Server (Rust)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sha2` | 0.10 (existing) | SHA-256 content hashing | Already in project. |
| `hkdf` | 0.12.x | Content-derived encryption key derivation (HKDF-SHA256) | RustCrypto standard. Pure Rust, no_std compatible. |
| `aes-gcm` | 0.10 (existing) | AES-256-GCM block encryption on server | Already in project for TOTP secret encryption. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `lru-cache` | Custom Map with linked list | lru-cache is battle-tested, has maxSize/sizeCalculation, no reason to roll custom |
| `sharp` | Canvas API / jimp | sharp is 4-5x faster, uses native libvips, worth the electron-rebuild cost |
| File-based block storage | SQLite BLOB storage | Files are simpler to manage for large blocks, avoid SQLite bloat; metadata stays in SQLite |
| `it-length-prefixed-stream` | Raw stream read/write | Length-prefixed framing prevents message boundary ambiguity; standard libp2p pattern |
| `sodium.crypto_aead_aes256gcm` | `sodium.crypto_aead_xchacha20poly1305_ietf` | AES-256-GCM is per spec (SEC-04) but requires AES-NI; XChaCha20 is portable fallback |

**Installation (client):**
```bash
npm install lru-cache sharp it-length-prefixed-stream
```

**Installation (server Cargo.toml):**
```toml
hkdf = "0.12"
# sha2, aes-gcm already present
```

## Architecture Patterns

### Recommended Project Structure
```
client/src/main/blocks/
  store.ts          # BlockStore class: putBlock, getBlock, hasBlock, deleteBlock
  crypto.ts         # Block encryption/decryption (AES-256-GCM or XChaCha20)
  cache.ts          # L0 memory cache (lru-cache wrapper)
  cascade.ts        # 5-layer resolution: L0 -> L1 -> L2 -> L3 -> L4
  protocol.ts       # Custom libp2p /united/block/1.0.0 handler + requester
  tiers.ts          # Tier assignment, eviction logic, budget enforcement
  thumbnails.ts     # Micro-thumbnail generation via sharp
  types.ts          # BlockRef, BlockMeta, ContentTier, etc.
  index.ts          # Public API: init, putBlock, getBlock, getBlockRef

client/src/main/ipc/blocks.ts   # IPC handlers bridging renderer to block store

client/src/renderer/src/
  components/
    ContentPlaceholder.tsx   # Shimmer -> "Fetching..." -> "Unavailable" progressive states
    AttachmentCard.tsx       # File attachment rendering (name, size, icon)
  hooks/
    useBlockContent.ts       # React hook: hash -> content with loading/error states
  stores/
    blocks.ts                # Zustand slice for block resolution state

server/src/blocks/
  mod.rs            # Block store module
  store.rs          # SQLite block metadata + file-based encrypted storage
  crypto.rs         # HKDF-SHA256 content-derived key + AES-256-GCM encrypt/decrypt
  routes.rs         # REST: PUT /api/blocks, GET /api/blocks/:hash
  retention.rs      # Background TTL purge task
```

### Pattern 1: Content-Addressed Block Store
**What:** All content is stored as SHA-256-hashed blocks. The hash IS the address. Duplicate content is automatically deduplicated.
**When to use:** Every content write and read in the application.
**Example:**
```typescript
// Client block store (client/src/main/blocks/store.ts)
import { createHash } from 'crypto'
import { getDb } from '../db/schema'

export interface BlockMeta {
  hash: string           // SHA-256 hex
  size: number           // bytes
  tier: ContentTier      // P1_NEVER_EVICT | P2_HOT | P3_WARM | P4_ALTRUISTIC
  mimeType?: string
  width?: number         // for images
  height?: number        // for images
  createdAt: string
  lastAccessedAt: string
}

export enum ContentTier {
  P1_NEVER_EVICT = 1,   // Own messages + received DMs
  P2_HOT = 2,           // Active channel content < 24h
  P3_WARM = 3,          // Content 1-7 days old (TTL configurable)
  P4_ALTRUISTIC = 4     // Seeding for others
}

export function computeBlockHash(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export async function putBlock(
  data: Buffer,
  tier: ContentTier,
  meta?: Partial<BlockMeta>
): Promise<string> {
  const hash = computeBlockHash(data)

  // Check if block already exists (dedup)
  if (hasBlock(hash)) {
    // Update tier if higher priority
    maybeUpgradeTier(hash, tier)
    touchAccess(hash)
    return hash
  }

  // Encrypt and write to file store
  const encrypted = encryptBlock(data, blockStoreKey)
  writeBlockFile(hash, encrypted)

  // Insert metadata
  insertBlockMeta(hash, data.length, tier, meta)

  // Update L0 cache
  memoryCache.set(hash, data)

  return hash
}
```

### Pattern 2: 5-Layer Cache Cascade
**What:** Content resolution tries layers in order, each layer faster but smaller. First hit wins.
**When to use:** Every `getBlock(hash)` call.
**Example:**
```typescript
// client/src/main/blocks/cascade.ts

export async function resolveBlock(hash: string): Promise<Buffer | null> {
  // L0: Memory cache (microseconds)
  const cached = memoryCache.get(hash)
  if (cached) return cached

  // L1: Local encrypted block store (milliseconds)
  const local = readAndDecryptBlock(hash)
  if (local) {
    memoryCache.set(hash, local)
    touchAccess(hash)
    return local
  }

  // L2: Hot peers - parallel fetch (seconds)
  const fromPeers = await fetchFromHotPeers(hash, { timeout: 3000 })
  if (fromPeers) {
    await putBlock(fromPeers, ContentTier.P3_WARM)
    return fromPeers
  }

  // L3: DHT/swarm discovery via peer directory
  const discoveredPeers = await queryPeerDirectory(hash)
  if (discoveredPeers.length > 0) {
    const fromDiscovery = await fetchFromPeers(hash, discoveredPeers, { timeout: 5000 })
    if (fromDiscovery) {
      await putBlock(fromDiscovery, ContentTier.P3_WARM)
      return fromDiscovery
    }
  }

  // L4: Server fallback (reliable but slow)
  const fromServer = await fetchFromServer(hash)
  if (fromServer) {
    await putBlock(fromServer, ContentTier.P4_ALTRUISTIC)
    return fromServer
  }

  return null // Content unavailable
}
```

### Pattern 3: Parallel Peer Fetching (First-Responder-Wins)
**What:** Send block requests to all connected peers simultaneously, use the first response.
**When to use:** L2 cache layer (hot peers).
**Example:**
```typescript
// client/src/main/blocks/protocol.ts
import { lpStream } from 'it-length-prefixed-stream'

const BLOCK_PROTOCOL = '/united/block/1.0.0'

export async function fetchFromHotPeers(
  hash: string,
  opts: { timeout: number }
): Promise<Buffer | null> {
  const peers = getConnectedPeers() // from libp2p connection manager
  if (peers.length === 0) return null

  const requests = peers.map(peer =>
    fetchBlockFromPeer(peer, hash, opts.timeout)
  )

  try {
    // First successful response wins, others are cancelled
    return await Promise.any(requests)
  } catch {
    // All peers failed
    return null
  }
}

async function fetchBlockFromPeer(
  peerId: PeerId,
  hash: string,
  timeout: number
): Promise<Buffer> {
  const stream = await node.dialProtocol(peerId, BLOCK_PROTOCOL, {
    signal: AbortSignal.timeout(timeout)
  })
  const lp = lpStream(stream)

  // Send request: block hash
  await lp.write(new TextEncoder().encode(hash))

  // Read response: block data
  const response = await lp.read()
  const data = Buffer.from(response.subarray())

  // Verify hash matches
  const actualHash = computeBlockHash(data)
  if (actualHash !== hash) {
    throw new Error(`Hash mismatch: expected ${hash}, got ${actualHash}`)
  }

  await stream.close()
  return data
}
```

### Pattern 4: Content-Derived Server Encryption (HKDF)
**What:** Server encrypts blocks using keys derived from the content hash itself. Anyone who knows the hash (authorized peers) can decrypt.
**When to use:** Server-side block storage for channel content (not DMs).
**Example:**
```rust
// server/src/blocks/crypto.rs
use hkdf::Hkdf;
use sha2::Sha256;
use aes_gcm::{Aes256Gcm, Key, Nonce, aead::Aead, KeyInit};

const HKDF_INFO: &[u8] = b"united-block-encryption-v1";
const HKDF_SALT: &[u8] = b"united-content-derived-key";

/// Derive an AES-256-GCM key from the block's SHA-256 hash.
pub fn derive_block_key(content_hash: &[u8; 32]) -> Key<Aes256Gcm> {
    let hk = Hkdf::<Sha256>::new(Some(HKDF_SALT), content_hash);
    let mut okm = [0u8; 32];
    hk.expand(HKDF_INFO, &mut okm)
        .expect("32 bytes is valid for HKDF-SHA256");
    Key::<Aes256Gcm>::from(okm)
}

/// Encrypt a block for server storage.
pub fn encrypt_block(content_hash: &[u8; 32], plaintext: &[u8]) -> Vec<u8> {
    let key = derive_block_key(content_hash);
    let cipher = Aes256Gcm::new(&key);
    // Use first 12 bytes of hash as nonce (deterministic, unique per content)
    let nonce = Nonce::from_slice(&content_hash[..12]);
    let ciphertext = cipher.encrypt(nonce, plaintext)
        .expect("encryption should not fail");
    ciphertext
}
```

### Pattern 5: Inline vs. Deferred Content in Gossip
**What:** Small content (<50KB) is embedded in gossip messages; large content sends a block reference.
**When to use:** Message creation and rendering.
**Example:**
```protobuf
// shared/proto/blocks.proto
syntax = "proto3";
package united.blocks;

message BlockRef {
    string hash = 1;          // SHA-256 hex of the full content
    uint64 size = 2;          // Size in bytes
    string mime_type = 3;     // MIME type (image/jpeg, application/pdf, etc.)
    uint32 width = 4;         // Image width (0 if not image)
    uint32 height = 5;        // Image height (0 if not image)
    bytes micro_thumbnail = 6; // ~100px JPEG thumbnail (<5KB, images only)
    string filename = 7;      // Original filename
}

message BlockRequest {
    string hash = 1;
}

message BlockResponse {
    string hash = 1;
    bytes data = 2;
    bool not_found = 3;
}
```

### Anti-Patterns to Avoid
- **Storing large blocks in SQLite:** SQLite performs poorly with large BLOBs. Use the filesystem for block data, SQLite for metadata indexing only.
- **Synchronous block encryption:** All crypto operations should be async or offloaded to prevent blocking the main process event loop. Use `setImmediate` batching for bulk operations.
- **Single-peer sequential fetching:** Always fetch from multiple peers in parallel. Sequential retry adds unnecessary latency.
- **Evicting P1 content under budget pressure:** P1 (own messages, received DMs) must never be evicted regardless of budget. Calculate available budget as `total_budget - P1_usage`.
- **Trusting peer-provided block data without hash verification:** Always verify `SHA-256(received_data) === requested_hash` before accepting any block from a peer.
- **Reflow on content load:** Never render content without pre-declared dimensions. The shimmer/placeholder must match the final content dimensions exactly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| In-memory LRU with size budgeting | Custom linked list cache | `lru-cache` npm v11 | Handles maxSize, sizeCalculation, TTL, stale-while-revalidate. Battle-tested. |
| Image thumbnail generation | Canvas API / manual JPEG encoding | `sharp` | 4-5x faster than ImageMagick, handles EXIF rotation, quality control, memory-efficient streaming |
| Length-prefixed stream framing | Manual varint encoding/decoding | `it-length-prefixed-stream` | Standard libp2p pattern, handles message boundary disambiguation correctly |
| SHA-256 hashing | Custom implementation | Node.js built-in `crypto.createHash` | Native C++ binding, streaming support for large files |
| HKDF key derivation (server) | Manual HMAC-based KDF | `hkdf` crate (RustCrypto) | RFC 5869 compliant, well-audited, correct extract-expand separation |
| HKDF key derivation (client) | Custom HMAC chain | Node.js `crypto.hkdfSync` | Built-in, no dependency, RFC 5869 compliant |
| AEAD encryption | Custom encrypt-then-MAC | `sodium-native` AEAD primitives | Constant-time, hardware-accelerated, handles auth tag correctly |

**Key insight:** The block pipeline is fundamentally a plumbing problem -- hashing, encrypting, caching, networking. Every piece has a well-established library. The value is in the integration and the cascade logic, not in the crypto or caching primitives.

## Common Pitfalls

### Pitfall 1: AES-256-GCM Hardware Requirement
**What goes wrong:** `sodium.crypto_aead_aes256gcm_*` requires AES-NI CPU instructions (Intel Westmere 2010+). Calling without AES-NI support crashes.
**Why it happens:** The SEC-04 requirement specifies AES-256-GCM, but some older CPUs and all ARM-based machines lack AES-NI.
**How to avoid:** Check `sodium.crypto_aead_aes256gcm_is_available()` at startup. If false, fall back to XChaCha20-Poly1305 (already used throughout the codebase). Document the fallback.
**Warning signs:** Crash on `crypto_aead_aes256gcm_encrypt` with no error message on certain hardware.

### Pitfall 2: SQLite BLOB Bloat
**What goes wrong:** Storing block data as BLOBs in SQLite causes the database file to grow rapidly, WAL checkpointing becomes slow, and `VACUUM` takes minutes.
**Why it happens:** SQLite stores BLOBs inline in B-tree pages. Large BLOBs fragment pages and bloat the file.
**How to avoid:** Store block DATA as individual encrypted files on disk (named by hash). Store only METADATA in SQLite (hash, size, tier, timestamps, dimensions). This is the IPFS/git model.
**Warning signs:** Database file growing much larger than the sum of block sizes. Slow queries on the blocks table.

### Pitfall 3: Gossipsub Message Size Limits
**What goes wrong:** Gossip messages exceeding `max_transmit_size` (64 KiB default) are silently dropped by the gossipsub layer.
**Why it happens:** The 50KB inline content limit is close to the 64KB gossipsub limit. Adding protobuf overhead, envelope fields, and signature data can push over.
**How to avoid:** Enforce the 50KB limit on the RAW content before protobuf encoding. The actual gossip message will be ~51-52KB after envelope overhead, safely under 64KB. Add a guard check before publish.
**Warning signs:** Messages "sent" but never received by any peer. No error in sender logs.

### Pitfall 4: Memory Cache Size Explosion
**What goes wrong:** The L0 memory cache grows unbounded, causing Electron to consume excessive RAM and eventually OOM.
**Why it happens:** Caching every accessed block in memory without a size limit.
**How to avoid:** Configure `lru-cache` with `maxSize` in bytes (recommend 256MB default). Use `sizeCalculation: (value) => value.length` to track actual byte usage. This ensures the cache stays bounded regardless of block count.
**Warning signs:** Electron process memory growing steadily over time, eventually exceeding 2GB+.

### Pitfall 5: Race Condition in Parallel Peer Fetch
**What goes wrong:** Multiple parallel `dialProtocol` calls succeed, and the block gets written to the store multiple times.
**Why it happens:** `Promise.any()` resolves with the first success but doesn't cancel the others.
**How to avoid:** Use `AbortController` to signal cancellation to losing streams. The block store's `putBlock` already handles dedup (check-before-write), so duplicate writes are safe but wasteful.
**Warning signs:** Increased bandwidth usage, duplicate block write logs.

### Pitfall 6: Sharp as Native Module in Electron
**What goes wrong:** `sharp` fails to load at runtime with "module not found" or ABI mismatch errors.
**Why it happens:** `sharp` bundles prebuilt binaries for Node.js, but Electron uses a different ABI version.
**How to avoid:** Add `sharp` to the electron-rebuild command alongside existing native modules: `npx electron-rebuild --version 40.6.0`. This is the same pattern used for `sodium-native` and `better-sqlite3`.
**Warning signs:** Runtime error on first image thumbnail generation attempt.

### Pitfall 7: Nonce Reuse in Block Encryption
**What goes wrong:** Using the same nonce for different blocks with the same key completely breaks AES-GCM security.
**Why it happens:** If deriving nonce deterministically from block hash and using the same key for all blocks.
**How to avoid:** For local block store: use a random nonce per block (stored alongside ciphertext). For server content-derived encryption: the key is unique per block (derived from content hash via HKDF), so a deterministic nonce from the hash is safe since no key is ever reused.
**Warning signs:** None visible -- this is a silent security failure.

### Pitfall 8: Budget Calculation Ignoring P1 Overhead
**What goes wrong:** P1 content (never-evict) fills the entire budget, leaving zero room for any other content.
**Why it happens:** Not accounting for P1 usage separately from the evictable budget.
**How to avoid:** Track P1 usage separately. If P1 exceeds the budget, warn the user in settings but never evict P1. The evictable budget is `max(0, total_budget - P1_usage)`. Show P1 usage as a distinct segment in the storage slider visualization.
**Warning signs:** Storage budget bar shows 100% used but user sees "no content" for channels they haven't authored in.

## Code Examples

### Block Store Key Derivation (Client)
```typescript
// client/src/main/blocks/crypto.ts
import sodium from 'sodium-native'

// Derive block store encryption key from user passphrase
// Uses same Argon2id parameters as identity encryption (IDENTITY-ARCHITECTURE.md)
export function deriveBlockStoreKey(passphrase: string, salt: Buffer): Buffer {
  const key = Buffer.alloc(32) // 256-bit key
  const passphraseBuf = Buffer.from(passphrase, 'utf-8')

  sodium.crypto_pwhash(
    key,
    passphraseBuf,
    salt,
    3,                // t_cost (iterations)
    262144 * 1024,    // m_cost (256 MB in bytes)
    sodium.crypto_pwhash_ALG_ARGON2ID13
  )

  return key
}

// Encrypt a block for local storage
export function encryptBlock(data: Buffer, key: Buffer): Buffer {
  // Check AES-256-GCM availability
  if (sodium.crypto_aead_aes256gcm_is_available()) {
    const nonce = Buffer.alloc(sodium.crypto_aead_aes256gcm_NPUBBYTES) // 12 bytes
    sodium.randombytes_buf(nonce)
    const ciphertext = Buffer.alloc(
      data.length + sodium.crypto_aead_aes256gcm_ABYTES
    )
    sodium.crypto_aead_aes256gcm_encrypt(
      ciphertext, data, null, null, nonce, key
    )
    // Return nonce + ciphertext
    return Buffer.concat([nonce, ciphertext])
  } else {
    // Fallback: XChaCha20-Poly1305 (same as identity encryption)
    const nonce = Buffer.alloc(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) // 24 bytes
    sodium.randombytes_buf(nonce)
    const ciphertext = Buffer.alloc(
      data.length + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES
    )
    sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      ciphertext, data, null, null, nonce, key
    )
    return Buffer.concat([nonce, ciphertext])
  }
}
```

### Block Exchange Protocol Handler (Client)
```typescript
// client/src/main/blocks/protocol.ts
import { lpStream } from 'it-length-prefixed-stream'

const BLOCK_PROTOCOL = '/united/block/1.0.0'

// Register handler for incoming block requests
export function registerBlockProtocol(node: Libp2p): void {
  node.handle(BLOCK_PROTOCOL, ({ stream }) => {
    handleBlockRequest(stream).catch(err => {
      console.warn('[Blocks] Error handling block request:', err)
    })
  })
}

async function handleBlockRequest(stream: Stream): Promise<void> {
  const lp = lpStream(stream)

  // Read the requested hash
  const reqBytes = await lp.read()
  const hash = new TextDecoder().decode(reqBytes.subarray())

  // Try to serve from local store
  const data = getLocalBlock(hash)
  if (data) {
    await lp.write(data)
  } else {
    // Send empty response (not found)
    await lp.write(new Uint8Array(0))
  }

  await stream.close()
}
```

### Server Content-Derived HKDF Encryption (Rust)
```rust
// server/src/blocks/crypto.rs
use hkdf::Hkdf;
use sha2::Sha256;
use aes_gcm::{Aes256Gcm, Key, Nonce, aead::{Aead, OsRng}, KeyInit};
use rand::RngCore;

const HKDF_SALT: &[u8] = b"united-content-derived-key-v1";
const HKDF_INFO: &[u8] = b"united-server-block-encryption";

pub fn derive_content_key(content_hash: &[u8; 32]) -> Key<Aes256Gcm> {
    let hk = Hkdf::<Sha256>::new(Some(HKDF_SALT), content_hash);
    let mut okm = [0u8; 32];
    hk.expand(HKDF_INFO, &mut okm)
        .expect("32 bytes is a valid HKDF-SHA256 output length");
    Key::<Aes256Gcm>::from(okm)
}

pub fn server_encrypt_block(content_hash: &[u8; 32], plaintext: &[u8]) -> Vec<u8> {
    let key = derive_content_key(content_hash);
    let cipher = Aes256Gcm::new(&key);

    // Random nonce (12 bytes) -- stored with ciphertext
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext)
        .expect("encryption should not fail");

    // Return: nonce (12) + ciphertext (data + 16 tag)
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    result
}
```

### Content-Derived HKDF (Client -- for server upload/download)
```typescript
// client/src/main/blocks/crypto.ts
import { hkdfSync } from 'crypto'

const HKDF_SALT = 'united-content-derived-key-v1'
const HKDF_INFO = 'united-server-block-encryption'

// Derive the same content-derived key the server uses
// Client needs this to decrypt blocks fetched from server
export function deriveContentKey(contentHashHex: string): Buffer {
  const hashBytes = Buffer.from(contentHashHex, 'hex')
  return Buffer.from(
    hkdfSync('sha256', hashBytes, HKDF_SALT, HKDF_INFO, 32)
  )
}
```

### L0 Memory Cache Configuration
```typescript
// client/src/main/blocks/cache.ts
import { LRUCache } from 'lru-cache'

const DEFAULT_L0_MAX_BYTES = 256 * 1024 * 1024 // 256 MB

export function createBlockCache(maxBytes = DEFAULT_L0_MAX_BYTES): LRUCache<string, Buffer> {
  return new LRUCache<string, Buffer>({
    maxSize: maxBytes,
    sizeCalculation: (value: Buffer) => value.length,
    // No TTL for L0 -- eviction is purely size-based
  })
}
```

### Eviction Sweep
```typescript
// client/src/main/blocks/tiers.ts

const EVICTION_INTERVAL = 60_000 // Check every 60 seconds

export function startEvictionSweep(budgetBytes: number): NodeJS.Timeout {
  return setInterval(() => {
    const p1Usage = getTierUsage(ContentTier.P1_NEVER_EVICT)
    const totalUsage = getTotalUsage()
    const evictableBudget = Math.max(0, budgetBytes - p1Usage)
    const evictableUsage = totalUsage - p1Usage

    if (evictableUsage <= evictableBudget) return // Under budget

    const toFree = evictableUsage - evictableBudget

    // Evict P4 first, then P3, then P2
    // Within each tier: LRU (oldest last_accessed_at first)
    evictByTierLRU(ContentTier.P4_ALTRUISTIC, toFree)
    // Check if enough freed, continue if not...
  }, EVICTION_INTERVAL)
}
```

### Micro-Thumbnail Generation
```typescript
// client/src/main/blocks/thumbnails.ts
import sharp from 'sharp'

const MICRO_THUMB_WIDTH = 100
const MICRO_THUMB_QUALITY = 40 // Low quality is fine for blur preview

export async function generateMicroThumbnail(
  imageData: Buffer
): Promise<{ thumbnail: Buffer; width: number; height: number }> {
  const metadata = await sharp(imageData).metadata()

  if (!metadata.width || !metadata.height) {
    throw new Error('Cannot read image dimensions')
  }

  const thumbnail = await sharp(imageData)
    .resize(MICRO_THUMB_WIDTH, undefined, { fit: 'inside' })
    .jpeg({ quality: MICRO_THUMB_QUALITY })
    .toBuffer()

  return {
    thumbnail,
    width: metadata.width,
    height: metadata.height
  }
}
```

### Block Store SQLite Schema (Client Migration)
```sql
-- Client-side block metadata table
CREATE TABLE IF NOT EXISTS block_meta (
  hash TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  tier INTEGER NOT NULL DEFAULT 3,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  filename TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_block_meta_tier_access
  ON block_meta(tier, last_accessed_at);

-- Storage budget tracking
CREATE TABLE IF NOT EXISTS block_store_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### Server Block Store Schema (Rust Migration)
```sql
-- Migration 6: Content Distribution (Phase 6)

-- Server-side block metadata
CREATE TABLE blocks (
  hash TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  encrypted_size INTEGER NOT NULL,
  channel_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL
);

CREATE INDEX idx_blocks_expires ON blocks(expires_at);
CREATE INDEX idx_blocks_channel ON blocks(channel_id);
```

### WS Envelope Field Allocation
```
-- Phase 6 block events: fields 160-179
-- 160: BlockStored (server confirms block upload)
-- 161: BlockRequest (peer requests block via WS relay)
-- 162: BlockAvailable (notify peers of new block)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bitswap (IPFS) for block exchange | Custom request-response protocol | Project decision | Bitswap is heavyweight, pulls in IPFS dependency graph. Custom protocol over libp2p streams is simpler, fits UNITED's single-server model. |
| Full IPFS stack for content addressing | Minimal CAS with SHA-256 + local store | Project architecture | IPFS adds DHT overhead, peer routing complexity. UNITED uses server as always-available super-seeder, reducing need for global DHT. |
| AES-256-GCM only | AES-256-GCM with XChaCha20-Poly1305 fallback | libsodium best practice | AES-GCM requires hardware support (AES-NI). XChaCha20 is portable and already used throughout the codebase. |
| SQLite BLOB storage | File-based block storage + SQLite metadata | Industry pattern (git, IPFS) | Better I/O performance for large blocks, simpler vacuuming, filesystem-level dedup potential. |

**Deprecated/outdated:**
- `js-ipfs-bitswap`: The IPFS project has deprecated the standalone JS Bitswap library in favor of Helia. Not relevant for UNITED's simpler architecture.
- `sodium-native` v3.x HKDF: HKDF was added to libsodium 1.0.19 but the sodium-native npm bindings may not expose it. Use Node.js built-in `crypto.hkdfSync` instead for client-side HKDF.

## Open Questions

1. **Block chunking threshold for Phase 6 vs Phase 7**
   - What we know: Phase 6 builds the block pipeline, Phase 7 adds file uploads and media rendering. Large file chunking (splitting a 100MB video into 256KB blocks) may be better deferred to Phase 7.
   - What's unclear: Should Phase 6 implement chunking for any content, or only handle single-block content (messages, thumbnails, small inline content)?
   - Recommendation: Phase 6 stores content as single blocks. Phase 7 adds the chunking layer for large file uploads. This keeps Phase 6 scope focused on the pipeline infrastructure. Gossip payloads and inline content will never need chunking (all < 50KB).

2. **Block store key lifecycle across sessions**
   - What we know: The block store key is derived from the user's passphrase via Argon2id. It needs to be available whenever the identity is unlocked.
   - What's unclear: Should the key be derived once at unlock and held in memory (like sessionSecretKey), or re-derived on demand?
   - Recommendation: Derive once at identity unlock, hold in memory alongside sessionSecretKey. Zero on lock/quit. This is consistent with the existing identity key pattern in `crypto.ts`.

3. **Server block upload timing**
   - What we know: Server acts as super-seeder. Blocks need to get to the server somehow.
   - What's unclear: Should blocks be uploaded eagerly (immediately on creation) or lazily (when a peer requests and the server doesn't have it)?
   - Recommendation: Eager upload for channel content. The server already receives gossip messages and can extract block references. Implement as a server-side behavior: when the server receives a gossip message with a block reference it doesn't have, it fetches from the author peer. This avoids adding upload logic to every client.

## Sources

### Primary (HIGH confidence)
- Node.js `crypto` built-in documentation - SHA-256, HKDF functions: https://nodejs.org/api/crypto.html
- libsodium documentation - AES-256-GCM, HKDF: https://libsodium.gitbook.io/doc
- sodium-native docs - Key derivation: https://sodium-friends.github.io/docs/docs/keyderivation
- lru-cache npm - API reference: https://www.npmjs.com/package/lru-cache
- sharp npm - Image processing API: https://sharp.pixelplumbing.com/
- hkdf Rust crate - RustCrypto KDF: https://docs.rs/crate/hkdf/latest
- aes-gcm Rust crate: https://docs.rs/aes-gcm
- libp2p custom protocols example: https://github.com/libp2p/js-libp2p-example-custom-protocols
- it-length-prefixed-stream npm: https://www.npmjs.com/package/it-length-prefixed-stream

### Secondary (MEDIUM confidence)
- Gossipsub max_transmit_size defaults: https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/README.md
- libp2p request-response Rust API: https://libp2p.github.io/rust-libp2p/libp2p/request_response/struct.Behaviour.html
- Bitswap protocol spec (reference only): https://specs.ipfs.tech/bitswap-protocol/
- HKDF RFC 5869: https://en.wikipedia.org/wiki/HKDF

### Tertiary (LOW confidence)
- Sharp + Electron rebuild compatibility: https://github.com/lovell/sharp/issues/2797 (historical issue, may be resolved in current versions)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are already in the project or are well-established npm/crates.io packages with extensive documentation
- Architecture: HIGH - Content-addressed storage is a well-understood pattern (git, IPFS, BitTorrent). The 5-layer cascade is a standard caching pattern. Custom libp2p protocols are documented with examples.
- Pitfalls: HIGH - Identified through codebase analysis (AES-NI requirement, native module rebuild, gossipsub size limits) and standard distributed systems concerns (hash verification, nonce management, budget overflow)

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (30 days -- stable domain, no fast-moving dependencies)
