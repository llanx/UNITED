# Architecture Research

**Domain:** P2P Encrypted Chat Platform (Desktop)
**Researched:** 2026-02-22
**Confidence:** MEDIUM (training data only -- WebSearch/WebFetch unavailable; all claims need validation against current docs during implementation)

## System Overview

```
                          COORDINATION SERVER (Rust)
                   ┌──────────────────────────────────────┐
                   │  Auth    Signaling    Content Index   │
                   │  Module  Module       Module          │
                   │     │       │            │            │
                   │  ┌──┴───────┴────────────┴──┐        │
                   │  │    Message Ordering       │        │
                   │  │    (Lamport + Causal)      │        │
                   │  └──────────┬────────────────┘        │
                   │             │                         │
                   │  ┌──────────┴────────────────┐        │
                   │  │   Fallback Block Store     │        │
                   │  │   (Encrypted, S3-like)     │        │
                   │  └───────────────────────────┘        │
                   └────────────┬───────────────────────────┘
                                │ WebSocket (TLS)
                ┌───────────────┼───────────────┐
                │               │               │
         ┌──────┴──────┐ ┌─────┴───────┐ ┌─────┴───────┐
         │  CLIENT A   │ │  CLIENT B   │ │  CLIENT C   │
         │  (Electron) │ │  (Electron) │ │  (Electron) │
         └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
                │               │               │
                └───── WebRTC DataChannels ──────┘
                       (P2P Gossip + Blocks)
                └───── WebRTC Media Streams ─────┘
                       (Voice/Video)
```

### Three-Tier Architecture

The system has three distinct tiers that communicate through well-defined interfaces:

1. **Coordination Server (Rust)** -- Thin authority for auth, ordering, and discovery. Never sees plaintext DM content. Runs on minimal hardware.
2. **P2P Mesh (libp2p via WebRTC DataChannels)** -- Peers gossip messages and exchange content blocks directly. This is the primary data path.
3. **Client Application (Electron + React)** -- Thick client containing the P2P engine, block store, cache cascade, and UI.

## Component Responsibilities

### Server Components

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **Auth Module** | User registration, login, JWT issuance, session management | Argon2id password hashing, Ed25519 key pair generation, JWT with short expiry + refresh tokens |
| **Signaling Module** | WebRTC SDP/ICE exchange, peer discovery bootstrap, NAT traversal assistance | WebSocket relay for SDP offers/answers, STUN/TURN coordination |
| **Content Index Module** | Maps content hashes to known peer locations, tracks which peers seed which blocks | In-memory hash table with SQLite persistence, probabilistic data structures (bloom filters) for peer-has queries |
| **Message Ordering Module** | Assigns server-authoritative sequence numbers per channel, validates causal ordering | Monotonic counter per channel, accepts Lamport timestamps from clients, rejects out-of-order when causal deps missing |
| **Fallback Block Store** | Stores encrypted blocks when no peers online, acts as last-resort seeder | Flat file store (SHA-256 hash as filename), encrypted at rest, LRU eviction with configurable quota |
| **Moderation Module** | Server-admin tools: kick, ban, delete, role management | Permission checks on incoming requests, broadcast moderation events to connected peers |

### Client Components

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **P2P Engine** (main process) | Manages libp2p node, gossipsub subscriptions, DHT queries, peer connections | js-libp2p with WebRTC transport, runs in main process (needs native access) |
| **Block Store** | Content-addressed storage, encryption at rest, LRU eviction | Flat files in `~/.united/blocks/AB/CDEF...`, AES-256-GCM encrypted, SQLite metadata index |
| **Cache Cascade** | 5-layer resolution: memory -> SQLite -> hot peers -> DHT -> server | Waterfall resolver with timeout escalation, parallel peer fetching at L2 |
| **Crypto Module** | Key management, message signing, DM encryption/decryption, block encryption | sodium-native wrapping libsodium, X25519 for DM key exchange, Ed25519 for signatures |
| **WebRTC Voice Manager** | Voice channel connections, ICE negotiation, audio processing | Native Chromium WebRTC, separate PeerConnection per voice participant |
| **UI Layer** (renderer process) | React app, chat rendering, user interaction, app shell | React + state management, receives data via IPC from main process |
| **Prefetch Engine** | McMaster-Carr-style predictive loading, hover/scroll-ahead triggers | Heuristic scoring based on user behavior, background block fetching via P2P engine |

## Detailed Architecture Decisions

### 1. Rust Coordination Server Architecture

**Confidence: MEDIUM** (well-known patterns, but verify crate versions)

#### Module Structure

```
united-server/
├── Cargo.toml
├── src/
│   ├── main.rs                 # Entrypoint, server startup, graceful shutdown
│   ├── config.rs               # Configuration (TOML/env), CLI args (clap)
│   ├── server.rs               # Axum/warp router setup, middleware stack
│   │
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── handler.rs          # HTTP handlers: register, login, refresh
│   │   ├── jwt.rs              # JWT creation/validation (jsonwebtoken crate)
│   │   ├── password.rs         # Argon2id hashing (argon2 crate)
│   │   └── middleware.rs       # Auth extraction middleware
│   │
│   ├── signaling/
│   │   ├── mod.rs
│   │   ├── ws.rs               # WebSocket upgrade, per-connection actor
│   │   ├── ice.rs              # ICE candidate relay
│   │   └── sdp.rs              # SDP offer/answer relay
│   │
│   ├── channels/
│   │   ├── mod.rs
│   │   ├── handler.rs          # Channel CRUD, membership
│   │   ├── ordering.rs         # Sequence number assignment, causal validation
│   │   └── moderation.rs       # Admin actions: kick, ban, delete
│   │
│   ├── content/
│   │   ├── mod.rs
│   │   ├── index.rs            # Content hash -> peer location mapping
│   │   ├── fallback_store.rs   # Encrypted block storage on server
│   │   └── replication.rs      # Replication factor tracking, seeder health
│   │
│   ├── presence/
│   │   ├── mod.rs
│   │   └── tracker.rs          # Online/offline, typing indicators, heartbeats
│   │
│   ├── db/
│   │   ├── mod.rs
│   │   ├── migrations/         # SQLite migrations (sqlx or rusqlite)
│   │   ├── models.rs           # Data structs
│   │   └── queries.rs          # Prepared statements
│   │
│   └── error.rs                # Error types, into_response conversions
```

#### Async Patterns

**Use Axum (not Actix-Web, not Warp).** Axum is built on top of tokio and tower, provides:
- Native tokio integration (no separate runtime)
- Tower middleware ecosystem (rate limiting, tracing, compression)
- Type-safe extractors
- WebSocket support via `axum::extract::ws`

**Key patterns:**

```rust
// Connection handling: one tokio task per WebSocket connection
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    claims: AuthClaims,  // extracted by middleware
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_connection(socket, state, claims))
}

async fn handle_connection(
    socket: WebSocket,
    state: AppState,
    claims: AuthClaims,
) {
    let (tx, rx) = socket.split();
    let (msg_tx, msg_rx) = mpsc::channel(256);

    // Register this connection
    state.connections.write().await.insert(claims.user_id, msg_tx);

    // Spawn writer task (reads from channel, writes to WS)
    let writer = tokio::spawn(write_loop(rx_half, msg_rx));

    // Reader loop (reads from WS, dispatches to handlers)
    while let Some(Ok(msg)) = tx.next().await {
        match msg {
            Message::Text(text) => handle_message(&state, &claims, text).await,
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Cleanup
    state.connections.write().await.remove(&claims.user_id);
    writer.abort();
}
```

**State management:** Use `Arc<AppState>` with interior mutability:
- `DashMap` for concurrent connection registry (not `RwLock<HashMap>` -- DashMap has per-shard locking)
- `tokio::sync::broadcast` for channel-wide event fanout
- `tokio::sync::mpsc` for per-connection outbound message queues
- SQLite via `rusqlite` with a dedicated connection pool (r2d2) or `sqlx` with async SQLite

**Why not actix-web:** Actix has its own actor system that adds conceptual overhead. Axum's tower-based approach composes better with the broader tokio ecosystem. Axum is also the direction the Rust async web ecosystem is consolidating around.

**Why not warp:** Warp's filter-based API becomes unwieldy for complex routing. Axum's handler-based approach with extractors is more intuitive for a project with many endpoints.

#### Message Ordering on Server

The server assigns a monotonically increasing `server_seq` per channel:

```rust
// In channels/ordering.rs
pub struct ChannelOrderer {
    // channel_id -> next sequence number
    sequences: DashMap<ChannelId, AtomicU64>,
}

impl ChannelOrderer {
    pub fn assign_seq(&self, channel_id: &ChannelId) -> u64 {
        self.sequences
            .entry(channel_id.clone())
            .or_insert_with(|| AtomicU64::new(0))
            .fetch_add(1, Ordering::SeqCst)
    }
}
```

This provides a total order within each channel. Clients also embed Lamport timestamps for causal tracking between channels (e.g., replies that reference messages in other channels).

---

### 2. Electron Client P2P Engine Structure

**Confidence: MEDIUM** (established Electron patterns, but verify MessagePort specifics)

#### Process Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MAIN PROCESS                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  P2P Engine   │  │ Block Store  │  │ Crypto Module│  │
│  │  (js-libp2p)  │  │ (flat files  │  │ (sodium-     │  │
│  │              │  │  + SQLite)   │  │  native)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│  ┌──────┴─────────────────┴─────────────────┴───────┐   │
│  │              Event Bus (EventEmitter)             │   │
│  └──────────────────────┬───────────────────────────┘   │
│                         │                                │
│  ┌──────────────────────┴───────────────────────────┐   │
│  │           IPC Bridge (ipcMain handlers)           │   │
│  └──────────────────────┬───────────────────────────┘   │
│                         │ contextBridge                   │
├─────────────────────────┼────────────────────────────────┤
│                    PRELOAD SCRIPT                         │
│  ┌──────────────────────┴───────────────────────────┐   │
│  │  contextBridge.exposeInMainWorld('united', {...}) │   │
│  └──────────────────────┬───────────────────────────┘   │
├─────────────────────────┼────────────────────────────────┤
│                   RENDERER PROCESS                       │
│  ┌──────────────────────┴───────────────────────────┐   │
│  │              React Application                    │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │   │
│  │  │ Chat UI  │  │ Voice UI │  │ Settings UI  │   │   │
│  │  └──────────┘  └──────────┘  └──────────────┘   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### Why P2P Engine in Main Process (Not Worker Thread)

The P2P engine (js-libp2p) MUST run in the main process, not a Worker Thread:

1. **WebRTC requires Node.js native addons.** `wrtc` (or `@aspect-build/webrtc`) uses native C++ bindings that cannot run in Worker Threads. Worker Threads support native addons only partially and many WebRTC bindings crash.
2. **sodium-native is a native addon.** The crypto module needs `sodium-native` which is a C binding. It works in the main process but may have issues in Worker Threads.
3. **File system access for block store.** While `fs` works in Worker Threads, the block store benefits from being co-located with the P2P engine to avoid serialization overhead on large block transfers.

**Mitigation for main process blocking:** Use `setImmediate()` yielding in tight loops, and offload CPU-intensive crypto operations (bulk encryption/decryption of blocks) to a Worker Thread pool via `worker_threads`. The P2P networking itself is I/O-bound and handled by libuv's event loop, so it does not block.

```
┌─ MAIN PROCESS ──────────────────────────────────┐
│                                                   │
│  js-libp2p (I/O-bound, non-blocking)             │
│  Block Store (I/O-bound, non-blocking)           │
│  IPC handling (event-driven)                      │
│                                                   │
│  ┌─ WORKER THREAD POOL (2-4 threads) ─────────┐ │
│  │  Bulk encryption/decryption                  │ │
│  │  SHA-256 hashing of large files              │ │
│  │  Image thumbnail generation                  │ │
│  └──────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

#### IPC Pattern: contextBridge + ipcRenderer (NOT MessagePort)

**Use `contextBridge` with `ipcRenderer.invoke()` and `ipcRenderer.on()`.** Do NOT use raw `MessagePort` for the primary IPC channel.

**Rationale:**
- `contextBridge` is the security boundary. With `contextIsolation: true` and `nodeIntegration: false` (both required), this is the ONLY safe way to expose APIs to the renderer.
- `ipcRenderer.invoke()` provides request-response semantics (send message, get result) -- ideal for fetching messages, loading blocks, querying state.
- `ipcRenderer.on()` (exposed via contextBridge) provides push semantics -- ideal for real-time message delivery, presence updates, typing indicators.

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('united', {
  // Request-response (renderer asks main for data)
  messages: {
    getHistory: (channelId: string, before: number, limit: number) =>
      ipcRenderer.invoke('messages:getHistory', channelId, before, limit),
    send: (channelId: string, content: string) =>
      ipcRenderer.invoke('messages:send', channelId, content),
  },

  // Push events (main pushes to renderer)
  on: {
    newMessage: (callback: (msg: Message) => void) => {
      const handler = (_event: any, msg: Message) => callback(msg);
      ipcRenderer.on('push:newMessage', handler);
      return () => ipcRenderer.removeListener('push:newMessage', handler);
    },
    presenceUpdate: (callback: (update: PresenceUpdate) => void) => {
      const handler = (_event: any, update: PresenceUpdate) => callback(update);
      ipcRenderer.on('push:presenceUpdate', handler);
      return () => ipcRenderer.removeListener('push:presenceUpdate', handler);
    },
    typingIndicator: (callback: (indicator: TypingIndicator) => void) => {
      const handler = (_event: any, indicator: TypingIndicator) => callback(indicator);
      ipcRenderer.on('push:typingIndicator', handler);
      return () => ipcRenderer.removeListener('push:typingIndicator', handler);
    },
  },

  // Block/content resolution
  content: {
    resolveBlock: (hash: string) =>
      ipcRenderer.invoke('content:resolveBlock', hash),
    getContentUrl: (hash: string) =>
      ipcRenderer.invoke('content:getContentUrl', hash),
  },

  // Voice
  voice: {
    join: (channelId: string) =>
      ipcRenderer.invoke('voice:join', channelId),
    leave: () =>
      ipcRenderer.invoke('voice:leave'),
  },
});
```

**When to use MessagePort:** Only for high-throughput binary data streams (e.g., streaming a large file download progress to the renderer). For chat messages (small JSON, moderate frequency), `ipcRenderer` with contextBridge is sufficient and simpler.

**Performance note:** Electron IPC serializes data using the structured clone algorithm. For chat messages (JSON, typically <10KB), this adds negligible overhead. For block data (up to 256KB chunks), pass the block hash and let the renderer fetch via a local HTTP server or data URL rather than sending raw bytes over IPC.

---

### 3. libp2p Gossipsub Mapping to Chat Channels

**Confidence: MEDIUM** (gossipsub is well-documented, but verify js-libp2p current API)

#### Topic-Per-Channel Model

Map each chat channel to a gossipsub topic. This is the natural and recommended mapping:

```
Channel: #general  ->  Topic: "/united/<server-id>/channel/<channel-id>"
Channel: #random   ->  Topic: "/united/<server-id>/channel/<channel-id>"
DM: user-a/user-b  ->  Topic: "/united/dm/<sorted-user-id-pair-hash>"
Presence:           ->  Topic: "/united/<server-id>/presence"
Typing:             ->  Topic: "/united/<server-id>/typing"
```

**Topic naming convention:** Use hierarchical paths prefixed with `/united/` to namespace and avoid collisions. Include the server ID so peers can participate in multiple servers.

#### Why Topic-Per-Channel Works

1. **Gossipsub builds a mesh per topic.** Peers subscribed to the same topic form a partial mesh (default D=6 peers). Messages propagate through this mesh via eager push to mesh peers and lazy push (IHAVE/IWANT) to non-mesh peers.
2. **Subscription = channel join.** When a user opens a channel, their libp2p node subscribes to that topic. When they leave, they unsubscribe. This naturally limits message propagation to interested peers.
3. **Fanout for inactive topics.** If a user sends a message to a channel they are not subscribed to (e.g., a bot posting), gossipsub maintains a fanout cache of peers for that topic.

#### Message Routing Flow

```
User types message in #general
    │
    ▼
Client creates message envelope:
{
  id: <uuid>,
  channel_id: <channel-id>,
  author_id: <user-id>,
  content: <plaintext or encrypted>,
  timestamp: <lamport-timestamp>,
  signature: <ed25519-sig>,
  content_refs: [<hash1>, <hash2>]  // referenced blocks (images, files)
}
    │
    ▼
P2P Engine publishes to gossipsub topic
    │
    ├──► Mesh peers receive immediately (eager push)
    │    They re-gossip to THEIR mesh peers
    │
    ├──► Non-mesh peers receive IHAVE notification
    │    They request via IWANT if interested
    │
    └──► Server (also a gossipsub peer) receives
         Assigns server_seq for total ordering
         Persists to fallback store if needed
```

#### Gossipsub Configuration

```typescript
import { gossipsub } from '@chainsafe/libp2p-gossipsub';

const pubsub = gossipsub({
  // Mesh parameters
  D: 6,          // Target mesh degree (connected peers per topic)
  Dlo: 4,        // Minimum mesh degree before grafting
  Dhi: 12,       // Maximum mesh degree before pruning
  Dlazy: 6,      // Peers to gossip IHAVE to (lazy push)

  // Timing
  heartbeatInterval: 1000,   // 1s heartbeat (default)

  // Message validation
  msgIdFn: (msg) => {
    // Use message UUID for dedup, not content hash
    // (identical content in different messages should not dedup)
    return new TextEncoder().encode(msg.data.slice(0, 36)); // UUID prefix
  },

  // Flood publishing for small channels (< D peers)
  floodPublish: true,

  // Message signing (libp2p handles this, but we also sign at app level)
  globalSignaturePolicy: 'StrictSign',

  // Score parameters for peer reputation
  scoreParams: {
    // Penalize peers that send invalid messages
    topicScoreCap: 10,
    // Penalize peers that are slow to relay
    meshMessageDeliveriesThreshold: 1,
  },
});
```

#### Handling Inline vs. Referenced Content

Messages under 50KB (text + small thumbnails) are gossiped inline in the message envelope. Larger content (images, files, videos) is referenced by content hash:

```
Message envelope (gossiped):
{
  content: "Check out this photo",
  inline_attachments: [
    { hash: "abc123", data: <base64-blurhash-thumbnail>, size: 2400 }
  ],
  block_refs: [
    { hash: "def456", filename: "photo.jpg", size: 3145728, mime: "image/jpeg" }
  ]
}

// Renderer shows blurhash placeholder immediately
// Then requests full block via cache cascade:
//   L0 memory -> L1 SQLite -> L2 hot peers -> L3 DHT -> L4 server
```

#### Presence and Typing as Separate Topics

Use dedicated lightweight topics for ephemeral data:

- **Presence topic:** Heartbeats every 30s. Payload: `{ user_id, status, last_active }`. Peers aggregate locally. No persistence.
- **Typing topic:** Fire-and-forget. Payload: `{ user_id, channel_id, is_typing }`. 5s TTL, no persistence. These are explicitly NOT routed through the server.

This separation prevents chat message delivery from being affected by high-frequency ephemeral updates.

---

### 4. Content-Addressed Block Store

**Confidence: MEDIUM** (well-established patterns from IPFS/BitTorrent)

#### Chunking Strategy

Use **fixed-size 256KB blocks** for content-addressed storage:

| Content Type | Strategy |
|-------------|----------|
| Text messages | Inline in gossipsub envelope (no blocks) |
| Small images (<256KB) | Single block, hash = content hash |
| Large images (>256KB) | Split into 256KB blocks + manifest block |
| Files | Split into 256KB blocks + manifest block |
| Video | Split into 256KB blocks + manifest block (enables streaming) |
| Thumbnails | Separate small block, referenced from manifest |

**Why 256KB (not 64KB or 1MB):**
- 64KB: Too many blocks for large files, excessive DHT overhead
- 256KB: Good balance -- a 10MB image = 40 blocks, manageable for parallel fetching
- 1MB: Too large for efficient partial replication on resource-constrained peers

#### Block Layout on Disk

```
~/.united/
├── blocks/
│   ├── a1/
│   │   ├── a1b2c3d4e5f6...  (256KB encrypted block)
│   │   └── a1ff92830ab1...
│   ├── b3/
│   │   └── b3e8a912c4d2...
│   └── ...
├── index.sqlite              (block metadata, channel index, message index)
└── keys/
    ├── identity.key          (Ed25519 private key, encrypted with user password)
    └── dm_keys/              (per-conversation X25519 key pairs)
```

**2-character hex prefix directories** prevent single-directory inode exhaustion. With SHA-256, the first byte gives 256 subdirectories, each holding a manageable number of files.

#### Manifest Block Structure

For multi-block content, create a manifest block:

```json
{
  "type": "manifest",
  "version": 1,
  "content_type": "image/jpeg",
  "filename": "photo.jpg",
  "total_size": 3145728,
  "block_size": 262144,
  "blocks": [
    { "index": 0, "hash": "sha256:abc123...", "size": 262144 },
    { "index": 1, "hash": "sha256:def456...", "size": 262144 },
    { "index": 11, "hash": "sha256:ghi789...", "size": 196608 }
  ],
  "thumbnail_hash": "sha256:thumb01...",
  "blurhash": "LEHV6nWB2yk8pyo0adR*.7kCMdnj"
}
```

The manifest block itself is content-addressed. The message envelope references the manifest hash.

#### Deduplication

Deduplication is **automatic via content addressing** -- if two users upload the same file, it produces the same SHA-256 hash and maps to the same blocks. The block store simply recognizes it already has those blocks.

However, **encryption complicates deduplication.** Two approaches:

**Recommended: Convergent encryption (encrypt-then-hash on plaintext, but store encrypted).**

```
1. Hash the plaintext content -> content_hash (for addressing)
2. Derive block key: HKDF(user_master_key, content_hash) -> block_key
3. Encrypt block: AES-256-GCM(block_key, plaintext) -> ciphertext
4. Store ciphertext at content_hash path
```

Wait -- this breaks cross-user dedup because each user has a different `user_master_key`. For a P2P system where blocks are shared between peers, we need a different approach.

**Actual recommendation: Encrypt at rest with a per-device key, NOT per-content key.**

```
Storage layer: All blocks on disk encrypted with device-level key
                (derived from user password via Argon2id)

Network layer: Blocks in transit are plaintext-over-encrypted-transport
               (WebRTC DTLS provides transport encryption)

This means:
- Blocks are identical across peers (same content hash = same bytes in transit)
- Deduplication works perfectly (hash of plaintext content)
- At rest, each device encrypts with its own key
- Stolen disk yields only encrypted blobs
```

This is the correct model for channel messages (which are cleartext-in-transit per the project spec). For DMs (end-to-end encrypted), blocks ARE encrypted before hashing, so dedup does not apply across conversations (this is correct -- DM content should not be correlatable).

#### Encryption at Rest Implementation

```typescript
// Block store encryption wrapper
class EncryptedBlockStore {
  private deviceKey: Uint8Array; // Derived from password via Argon2id at login

  async writeBlock(hash: string, plaintext: Uint8Array): Promise<void> {
    const nonce = sodium.randombytes_buf(24); // XChaCha20-Poly1305 nonce
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext, null, null, nonce, this.deviceKey
    );
    const stored = Buffer.concat([nonce, ciphertext]);
    const dir = path.join(BLOCKS_DIR, hash.slice(0, 2));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, hash), stored);
  }

  async readBlock(hash: string): Promise<Uint8Array> {
    const stored = await fs.readFile(path.join(BLOCKS_DIR, hash.slice(0, 2), hash));
    const nonce = stored.slice(0, 24);
    const ciphertext = stored.slice(24);
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null, ciphertext, null, nonce, this.deviceKey
    );
  }
}
```

**Note:** Use XChaCha20-Poly1305 instead of AES-256-GCM for at-rest encryption. XChaCha20 has a 24-byte nonce (safe for random generation without collision risk), while AES-GCM's 12-byte nonce requires careful counter management. sodium-native supports both; XChaCha20 is the better default.

---

### 5. WebRTC Voice Integration with libp2p

**Confidence: MEDIUM** (architectural patterns are well-understood; integration specifics need validation)

#### Separate Connections (NOT Unified)

Voice and data should use **separate WebRTC PeerConnections**, not a unified connection:

```
┌─ PEER A ───────────────────────────────────────────┐
│                                                      │
│  libp2p Node                                         │
│  ├── WebRTC Transport (DataChannels)                │
│  │   └── Gossipsub, DHT, Block Transfer             │
│  │       [managed by js-libp2p]                     │
│  │                                                   │
│  └── Voice Manager (separate)                        │
│      ├── PeerConnection to Peer B (media tracks)    │
│      ├── PeerConnection to Peer C (media tracks)    │
│      └── Audio processing (gain, mute, noise gate)  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Why separate:**

1. **Different lifecycle.** Data connections persist as long as peers are online. Voice connections exist only while users are in the same voice channel. Coupling them means voice leave/join disrupts data.
2. **Different QoS needs.** Voice needs low-latency, lossy transport (UDP preferred). Data channels can tolerate reordering and retransmission. Separate PeerConnections allow different ICE configurations.
3. **libp2p manages its own connections.** js-libp2p's WebRTC transport manages DataChannel connections internally. Injecting media tracks into libp2p-managed connections is fragile and unsupported.
4. **Mesh topology differs.** Data uses gossipsub mesh (partial, D=6). Voice uses full mesh among channel participants (every participant connects to every other for mixing).

#### Voice Architecture

```
Voice Channel Join Flow:
    │
    ▼
1. Client sends voice:join to coordination server via WebSocket
2. Server responds with list of current voice channel participants
3. For each existing participant:
   a. Create new RTCPeerConnection
   b. Exchange SDP offer/answer via server signaling
   c. Exchange ICE candidates via server signaling
   d. Add local audio track to connection
4. When new participant joins later, receive server notification
   → Create PeerConnection to new participant
5. When participant leaves, close that PeerConnection

Audio Pipeline:
    Microphone
        ↓
    getUserMedia({ audio: constraints })
        ↓
    AudioContext processing (noise gate, gain)
        ↓
    MediaStream → addTrack to each PeerConnection
        ↓
    Remote audio tracks → AudioContext mixing → speakers
```

#### Scaling Concern

WebRTC mesh creates O(n^2) connections. Practical limits:

| Participants | Connections per user | Total connections | Viable? |
|-------------|---------------------|-------------------|---------|
| 2 | 1 | 1 | Yes |
| 5 | 4 | 10 | Yes |
| 10 | 9 | 45 | Marginal |
| 20 | 19 | 190 | No (SFU needed) |

**For v1:** Cap voice channels at 10-12 participants with mesh. Display warning at 8+. SFU support (potentially using a volunteer super-seeder as relay) is a post-v1 feature.

---

### 6. Electron IPC Pattern for Real-Time Chat

**Confidence: MEDIUM** (well-documented Electron patterns)

#### Recommended Pattern: Typed Event Bus over contextBridge

The IPC architecture uses three communication patterns:

##### Pattern A: Request-Response (Renderer asks Main)

For queries and commands. Uses `ipcRenderer.invoke()` / `ipcMain.handle()`.

```typescript
// main/ipc/messages.ts
ipcMain.handle('messages:getHistory', async (event, channelId, before, limit) => {
  const messages = await messageStore.getHistory(channelId, before, limit);
  return messages; // Serialized via structured clone
});

ipcMain.handle('messages:send', async (event, channelId, content) => {
  const envelope = await createMessageEnvelope(channelId, content);
  await p2pEngine.publish(channelId, envelope);
  return envelope; // Return the created message to sender
});
```

##### Pattern B: Server Push (Main pushes to Renderer)

For real-time events. Uses `webContents.send()` with corresponding `ipcRenderer.on()` exposed via contextBridge.

```typescript
// main/ipc/push.ts
class IPCPushService {
  private mainWindow: BrowserWindow;

  pushNewMessage(msg: MessageEnvelope) {
    this.mainWindow.webContents.send('push:newMessage', msg);
  }

  pushPresence(update: PresenceUpdate) {
    this.mainWindow.webContents.send('push:presenceUpdate', update);
  }

  pushTyping(indicator: TypingIndicator) {
    this.mainWindow.webContents.send('push:typingIndicator', indicator);
  }

  pushBlockResolved(hash: string, localPath: string) {
    this.mainWindow.webContents.send('push:blockResolved', hash, localPath);
  }
}
```

##### Pattern C: Content Serving (for images/files)

Do NOT send binary block data over IPC. Instead, run a local HTTP server in the main process:

```typescript
// main/content-server.ts
import { createServer } from 'http';

const contentServer = createServer(async (req, res) => {
  const hash = req.url?.slice(1); // /sha256:abc123...
  if (!hash) { res.writeHead(404).end(); return; }

  try {
    const block = await blockStore.readBlock(hash);
    res.writeHead(200, {
      'Content-Type': lookupMime(hash),
      'Cache-Control': 'immutable, max-age=31536000', // content-addressed = immutable
    });
    res.end(block);
  } catch {
    res.writeHead(404).end();
  }
});

contentServer.listen(0, '127.0.0.1'); // Random port, localhost only
```

The renderer loads images/files via `<img src="http://127.0.0.1:{port}/{hash}">`. This avoids serialization overhead for binary data, leverages Chromium's native image decoding pipeline, and gets HTTP caching for free.

**Security:** The content server binds to `127.0.0.1` only (not `0.0.0.0`) and validates a session token in a custom header or query parameter to prevent local network attackers from accessing blocks.

##### React Integration

```typescript
// renderer/hooks/useMessages.ts
import { useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store';

export function useMessages(channelId: string) {
  const addMessage = useStore(s => s.addMessage);
  const messages = useStore(s => s.messages[channelId] ?? []);

  useEffect(() => {
    // Subscribe to push events
    const unsub = window.united.on.newMessage((msg) => {
      if (msg.channel_id === channelId) {
        addMessage(channelId, msg);
      }
    });
    return unsub;
  }, [channelId, addMessage]);

  const sendMessage = useCallback(async (content: string) => {
    const msg = await window.united.messages.send(channelId, content);
    addMessage(channelId, msg); // Optimistic add
  }, [channelId, addMessage]);

  const loadHistory = useCallback(async (before: number) => {
    return window.united.messages.getHistory(channelId, before, 50);
  }, [channelId]);

  return { messages, sendMessage, loadHistory };
}
```

---

### 7. Message Ordering Strategy

**Confidence: HIGH** (well-studied distributed systems problem; the hybrid approach is standard)

#### Recommendation: Hybrid Lamport Timestamps + Server Sequence Numbers

Neither pure vector clocks nor pure CRDTs are the right fit. Use a hybrid approach:

| Mechanism | Where | Purpose |
|-----------|-------|---------|
| **Lamport timestamp** | Client-generated, embedded in every message | Causal ordering between messages (a reply always comes after the message it replies to) |
| **Server sequence number** | Server-assigned on receipt | Total ordering within a channel (definitive display order) |
| **Wall clock** | Client-generated, informational only | Human-readable "sent at" time, NOT used for ordering |

#### Why NOT Vector Clocks

Vector clocks track causality across all participants. For a chat channel with N participants, each message carries an N-dimensional vector. Problems:

1. **Vector grows with participants.** A channel with 1000 members means every message carries 1000 entries. This is unacceptable overhead for chat.
2. **Membership changes are complex.** Users joining/leaving requires vector resizing and coordination.
3. **Overkill for chat.** Chat needs total order within a channel, not arbitrary partial order detection. Users expect messages in one definitive sequence.

#### Why NOT Pure CRDTs

CRDTs (specifically sequence CRDTs like Yjs or Automerge) are designed for convergent editing of shared documents. For chat:

1. **Messages are append-only.** Chat is not concurrent editing of shared state -- it is appending immutable messages to a log. A simple sequence number suffices.
2. **CRDT overhead.** CRDTs carry metadata for conflict resolution that is unnecessary when the server provides total ordering.
3. **Complexity budget.** CRDTs add significant implementation complexity. Save this budget for features that actually need it (e.g., collaborative document editing, if ever added).

**Exception:** If UNITED ever adds collaborative features (shared documents, wikis), CRDTs become relevant for THOSE features. Not for chat messages.

#### Why NOT Pure Server Ordering

If the server is the sole source of ordering, messages cannot be displayed until the server responds. This adds latency and makes offline operation impossible.

#### The Hybrid Approach

```
CLIENT sends message:
  1. Increment local Lamport clock
  2. Attach lamport_ts to message envelope
  3. Attach causal_deps: [hash of message being replied to, if any]
  4. Publish via gossipsub (peers see it immediately)
  5. Server receives via gossipsub (it is a peer)
  6. Server assigns server_seq for the channel
  7. Server broadcasts ordering confirmation: { msg_id, server_seq }

CLIENT receives message from peer:
  1. Update local Lamport clock: max(local, received) + 1
  2. Display message immediately in "unconfirmed" position
     (sorted by lamport_ts, after all confirmed messages)
  3. When server_seq arrives, move message to confirmed position
  4. If server_seq ordering differs from lamport_ts ordering,
     reorder (with subtle animation to avoid jarring UX)

DISPLAY ORDER:
  [confirmed messages sorted by server_seq]
  [--- pending line ---]
  [unconfirmed messages sorted by lamport_ts]
```

#### Handling Server Unavailability

When the server is unreachable (temporarily down, network partition):

1. Messages still propagate via gossipsub between connected peers
2. Messages display in Lamport timestamp order (causal, but not total)
3. When server reconnects, it assigns server_seq for all pending messages
4. Clients reconcile: confirmed order may differ from tentative order
5. For channels with low traffic, the Lamport order and server order will almost always agree

#### Message Envelope Structure

```typescript
interface MessageEnvelope {
  // Identity
  id: string;                    // UUIDv7 (timestamp-sortable)
  author_id: string;             // User ID
  channel_id: string;            // Channel ID

  // Content
  content: string;               // Plaintext for channels, encrypted for DMs
  inline_attachments: InlineAttachment[];  // <50KB items
  block_refs: BlockRef[];        // Content-addressed hashes for large content

  // Ordering
  lamport_ts: number;            // Client Lamport clock
  server_seq?: number;           // Assigned by server (absent until confirmed)
  causal_deps: string[];         // Message IDs this causally depends on (replies, etc.)
  wall_clock: number;            // Unix ms, informational only

  // Auth
  signature: Uint8Array;         // Ed25519 signature over all above fields (except server_seq)
}
```

---

## Data Flow Diagrams

### Flow 1: Sending a Chat Message

```
User types "Hello"
    │
    ▼
React UI ──invoke──► Main Process (IPC)
                        │
                        ▼
                     Create MessageEnvelope
                     Sign with Ed25519
                        │
                   ┌────┴────┐
                   ▼         ▼
            Gossipsub     WebSocket
            publish()     (to server)
                │            │
                ▼            ▼
           Peers get     Server assigns
           message       server_seq
           immediately      │
                            ▼
                     Server broadcasts
                     ordering confirmation
                     via WebSocket to all
                     connected clients
```

### Flow 2: Receiving a Message with Attachment

```
Peer B gossips message with block_ref for image
    │
    ▼
P2P Engine receives message
    │
    ├──► Push message to renderer (IPC push)
    │    Renderer shows text + blurhash placeholder
    │
    └──► Cache Cascade resolves block_ref
         │
         ├── L0: In-memory cache? NO
         ├── L1: SQLite/block store? NO
         ├── L2: Request from hot peers (parallel)
         │        Peer B responds with block ──► FOUND
         │        Block decrypted, cached at L1 and L0
         │
         └──► Push blockResolved to renderer (IPC push)
              Renderer replaces blurhash with actual image
              (loaded via local content server HTTP)
```

### Flow 3: Voice Channel Join

```
User clicks "Join Voice"
    │
    ▼
React UI ──invoke──► Main Process: voice:join(channelId)
                        │
                        ▼
                     WebSocket to Server: voice:join
                        │
                        ▼
                     Server responds with participant list:
                     [user_b, user_c]
                        │
                   ┌────┴────┐
                   ▼         ▼
            Create PC    Create PC
            to user_b    to user_c
                │            │
                ▼            ▼
            SDP exchange via server signaling
            ICE candidate exchange
                │            │
                ▼            ▼
            Add local    Add local
            audio track  audio track
                │            │
                ▼            ▼
            Audio flowing both directions
            Mixed and played locally
```

### Flow 4: Cache Cascade Resolution

```
Renderer needs block "sha256:abc123..."
    │
    ▼
invoke content:resolveBlock("sha256:abc123...")
    │
    ▼
┌─ L0: In-Memory LRU Cache ──────────────┐
│  Capacity: ~100MB                        │
│  Lookup: O(1) hash map                   │
│  HIT? → Return immediately (< 1ms)      │
└──── MISS ────────────────────────────────┘
    │
    ▼
┌─ L1: SQLite + Block Store ──────────────┐
│  Capacity: User-configured (e.g., 10GB)  │
│  Lookup: SQLite index → read file → decrypt │
│  HIT? → Return, promote to L0 (< 10ms)  │
└──── MISS ────────────────────────────────┘
    │
    ▼
┌─ L2: Hot Peers (Parallel) ─────────────┐
│  Ask peers known to have block           │
│  (from content index or recent senders)  │
│  Parallel requests, first-responder-wins │
│  HIT? → Return, store at L1+L0 (< 200ms)│
│  Timeout: 2s                             │
└──── MISS ────────────────────────────────┘
    │
    ▼
┌─ L3: DHT / Swarm Discovery ────────────┐
│  Kademlia DHT findProviders(hash)        │
│  Connect to discovered peers, request    │
│  HIT? → Return, store at L1+L0 (< 2s)   │
│  Timeout: 5s                             │
└──── MISS ────────────────────────────────┘
    │
    ▼
┌─ L4: Server Fallback ──────────────────┐
│  HTTPS request to coordination server    │
│  Server has encrypted copy as last resort│
│  HIT? → Return, store at L1+L0 (< 1s)   │
│  MISS? → Content unavailable error       │
└──────────────────────────────────────────┘
```

---

## Recommended Project Structure

### Server (Rust)

```
united-server/
├── Cargo.toml
├── Cargo.lock
├── config/
│   └── default.toml          # Default configuration
├── migrations/
│   └── 001_initial.sql       # SQLite migrations
├── src/
│   ├── main.rs               # Entrypoint, CLI, server init
│   ├── config.rs             # Config loading (toml + env vars)
│   ├── error.rs              # Unified error type
│   ├── state.rs              # AppState: connections, channels, stores
│   │
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── handler.rs        # register, login, refresh endpoints
│   │   ├── jwt.rs            # JWT creation/validation
│   │   ├── password.rs       # Argon2id hashing
│   │   └── middleware.rs     # Auth extractor for Axum
│   │
│   ├── ws/
│   │   ├── mod.rs
│   │   ├── handler.rs        # WebSocket upgrade handler
│   │   ├── connection.rs     # Per-connection actor (read/write loops)
│   │   └── protocol.rs       # Message types for WS protocol
│   │
│   ├── signaling/
│   │   ├── mod.rs
│   │   ├── sdp.rs            # SDP relay
│   │   └── ice.rs            # ICE candidate relay
│   │
│   ├── channels/
│   │   ├── mod.rs
│   │   ├── handler.rs        # Channel CRUD REST endpoints
│   │   ├── ordering.rs       # Sequence number assignment
│   │   ├── membership.rs     # Join/leave/permissions
│   │   └── moderation.rs     # Admin actions
│   │
│   ├── content/
│   │   ├── mod.rs
│   │   ├── index.rs          # Hash -> peer mapping
│   │   └── fallback.rs       # Fallback encrypted block store
│   │
│   ├── presence/
│   │   ├── mod.rs
│   │   └── tracker.rs        # Online/offline tracking
│   │
│   └── db/
│       ├── mod.rs
│       ├── pool.rs           # Connection pool setup
│       └── queries.rs        # Prepared queries
│
├── tests/
│   ├── auth_test.rs
│   ├── ws_test.rs
│   └── ordering_test.rs
│
└── Dockerfile
```

### Client (Electron + React)

```
united-client/
├── package.json
├── electron-builder.yml
├── tsconfig.json
│
├── src/
│   ├── main/                          # Electron main process
│   │   ├── index.ts                   # App entry, window creation
│   │   ├── ipc/
│   │   │   ├── index.ts               # Register all IPC handlers
│   │   │   ├── messages.ts            # Message CRUD handlers
│   │   │   ├── channels.ts            # Channel operations
│   │   │   ├── voice.ts               # Voice join/leave
│   │   │   └── content.ts             # Block resolution
│   │   │
│   │   ├── p2p/
│   │   │   ├── engine.ts              # js-libp2p node setup + lifecycle
│   │   │   ├── gossipsub.ts           # Topic management, publish/subscribe
│   │   │   ├── dht.ts                 # Kademlia DHT queries
│   │   │   └── transport.ts           # WebRTC transport config
│   │   │
│   │   ├── storage/
│   │   │   ├── block-store.ts         # Content-addressed encrypted block storage
│   │   │   ├── cache-cascade.ts       # 5-layer cache resolution
│   │   │   ├── sqlite.ts             # SQLite connection + queries
│   │   │   └── retention.ts           # TTL enforcement, LRU eviction
│   │   │
│   │   ├── crypto/
│   │   │   ├── keys.ts               # Key generation, storage, derivation
│   │   │   ├── signing.ts            # Ed25519 message signing/verification
│   │   │   ├── encryption.ts         # AES/XChaCha20 encrypt/decrypt
│   │   │   └── dm.ts                 # X25519 DM key exchange
│   │   │
│   │   ├── voice/
│   │   │   ├── manager.ts            # Voice channel state machine
│   │   │   ├── peer-connection.ts     # WebRTC PeerConnection wrapper
│   │   │   └── audio.ts              # Audio processing (gain, mute, noise gate)
│   │   │
│   │   ├── server-connection/
│   │   │   ├── websocket.ts          # WebSocket to coordination server
│   │   │   ├── auth.ts               # Login, token refresh
│   │   │   └── signaling.ts          # SDP/ICE relay via server
│   │   │
│   │   ├── content-server.ts          # Local HTTP server for block content
│   │   └── workers/
│   │       └── crypto-worker.ts       # Worker thread for bulk crypto ops
│   │
│   ├── preload/
│   │   └── index.ts                   # contextBridge API definition
│   │
│   └── renderer/                      # React application
│       ├── index.html
│       ├── index.tsx                  # React root
│       ├── App.tsx                    # App shell (persistent chrome)
│       │
│       ├── components/
│       │   ├── chat/
│       │   │   ├── MessageList.tsx    # Virtualized message list
│       │   │   ├── MessageItem.tsx    # Single message rendering
│       │   │   ├── MessageInput.tsx   # Composition area
│       │   │   └── Attachment.tsx     # Image/file with blurhash placeholder
│       │   ├── channels/
│       │   │   ├── ChannelList.tsx    # Sidebar channel list
│       │   │   └── ChannelHeader.tsx  # Channel name, members, actions
│       │   ├── voice/
│       │   │   ├── VoiceChannel.tsx   # Voice UI, participant list
│       │   │   └── VoiceControls.tsx  # Mute, deafen, disconnect
│       │   └── common/
│       │       ├── UserAvatar.tsx
│       │       └── PresenceDot.tsx
│       │
│       ├── hooks/
│       │   ├── useMessages.ts         # Message subscription + send
│       │   ├── usePresence.ts         # Presence state
│       │   ├── useVoice.ts            # Voice channel state
│       │   └── useContent.ts          # Block resolution + content URLs
│       │
│       ├── store/                     # State management (Zustand recommended)
│       │   ├── index.ts
│       │   ├── messages.ts            # Message state per channel
│       │   ├── channels.ts            # Channel list, active channel
│       │   ├── presence.ts            # User presence map
│       │   └── voice.ts              # Voice channel state
│       │
│       └── styles/
│           └── ...
│
├── tests/
│   ├── main/                          # Main process unit tests
│   └── renderer/                      # React component tests
│
└── scripts/
    └── build.ts                       # Build configuration
```

### Structure Rationale

- **`src/main/`:** All main process code grouped by domain (p2p, storage, crypto, voice). Each domain is a self-contained module with clear exports.
- **`src/main/ipc/`:** IPC handlers are thin -- they validate input, call domain modules, and return results. They do NOT contain business logic.
- **`src/main/p2p/`:** The libp2p node and all P2P networking logic. The engine.ts is the entry point that wires gossipsub, DHT, and transport together.
- **`src/main/storage/`:** All persistence logic. The cache cascade is the public API; block-store and sqlite are implementation details.
- **`src/preload/`:** Minimal. Only exposes typed API surface. Never contains logic.
- **`src/renderer/`:** Standard React app. Communicates with main process only via `window.united` API. Has zero Node.js dependencies.

---

## Architectural Patterns

### Pattern 1: Event-Driven IPC Bus

**What:** All communication between P2P engine and UI flows through a typed event bus. The main process emits events (new message, presence change, block resolved) that the IPC layer forwards to the renderer. The renderer sends commands (send message, join channel) that the IPC layer routes to the appropriate domain module.

**When to use:** Always. This is the backbone of the client architecture.

**Trade-offs:**
- Pro: Decouples P2P engine from UI; testable in isolation
- Pro: Clear data flow direction (commands down, events up)
- Con: Adds indirection; harder to trace a request through the full stack

```typescript
// main/events.ts
import { EventEmitter } from 'events';

export interface UnitedEvents {
  'message:received': (msg: MessageEnvelope) => void;
  'message:confirmed': (msgId: string, serverSeq: number) => void;
  'presence:updated': (userId: string, status: string) => void;
  'block:resolved': (hash: string) => void;
  'voice:participant-joined': (userId: string) => void;
  'voice:participant-left': (userId: string) => void;
}

export const eventBus = new EventEmitter() as TypedEventEmitter<UnitedEvents>;
```

### Pattern 2: Cache Cascade with Timeout Escalation

**What:** Block resolution tries each cache layer in sequence, with increasing timeouts. Each layer is a pluggable resolver with a common interface.

**When to use:** For all content resolution (images, files, message history).

**Trade-offs:**
- Pro: Graceful degradation -- fast for cached content, slower but available for rare content
- Pro: Each layer is independently testable and replaceable
- Con: Complexity in timeout management and cancellation

```typescript
interface CacheLayer {
  name: string;
  resolve(hash: string, signal: AbortSignal): Promise<Uint8Array | null>;
  store(hash: string, data: Uint8Array): Promise<void>;
}

async function cascadeResolve(
  hash: string,
  layers: CacheLayer[]
): Promise<{ data: Uint8Array; layer: string } | null> {
  for (const layer of layers) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      LAYER_TIMEOUTS[layer.name]
    );
    try {
      const data = await layer.resolve(hash, controller.signal);
      if (data) {
        // Backfill higher layers
        for (const higherLayer of layers.slice(0, layers.indexOf(layer))) {
          higherLayer.store(hash, data).catch(() => {}); // best-effort
        }
        return { data, layer: layer.name };
      }
    } catch {
      // Layer failed or timed out, try next
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}
```

### Pattern 3: Actor-per-Connection (Server)

**What:** Each WebSocket connection spawns two tokio tasks: a reader and a writer. They communicate through an mpsc channel. This isolates connection state and prevents a slow writer from blocking reads.

**When to use:** For all WebSocket connections on the server.

**Trade-offs:**
- Pro: Backpressure per connection (slow clients don't block fast ones)
- Pro: Clean shutdown (drop the mpsc sender to signal writer task to exit)
- Con: More tasks per connection (but tokio tasks are cheap -- millions are fine)

```rust
async fn handle_connection(socket: WebSocket, state: Arc<AppState>, user_id: UserId) {
    let (ws_write, ws_read) = socket.split();
    let (tx, rx) = mpsc::channel::<ServerMessage>(256);

    // Register connection
    state.connections.insert(user_id.clone(), tx.clone());

    // Writer task: reads from channel, sends to WebSocket
    let writer = tokio::spawn(async move {
        let mut rx = rx;
        let mut ws_write = ws_write;
        while let Some(msg) = rx.recv().await {
            let text = serde_json::to_string(&msg).unwrap();
            if ws_write.send(Message::Text(text)).await.is_err() {
                break;
            }
        }
    });

    // Reader loop: reads from WebSocket, dispatches
    let mut ws_read = ws_read;
    while let Some(Ok(msg)) = ws_read.next().await {
        if let Message::Text(text) = msg {
            if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                dispatch(&state, &user_id, client_msg).await;
            }
        }
    }

    // Cleanup
    state.connections.remove(&user_id);
    writer.abort();
}
```

### Pattern 4: Optimistic UI with Server Reconciliation

**What:** When a user sends a message, display it immediately in the UI (optimistic). When the server confirms with `server_seq`, reconcile the position. If the optimistic position was correct (common case), no visible change.

**When to use:** For all user-initiated mutations (send message, react, edit).

**Trade-offs:**
- Pro: Feels instant to the user (<10ms to see own message)
- Pro: Gracefully handles server latency (message visible even before server confirms)
- Con: Occasional reorder when server disagrees (mitigated by subtle animation)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixing P2P and Server State

**What people do:** Store some state in libp2p DHT and some on the server, with no clear boundary for which lives where.
**Why it is wrong:** Creates split-brain scenarios. Channel membership might disagree between DHT and server. Permission checks bypass server authority.
**Do this instead:** The server is the SOLE authority for: authentication, channel membership, permissions, message ordering. The P2P layer handles: content delivery, message propagation, presence gossip. If in doubt, it goes to the server.

### Anti-Pattern 2: Large Messages over Gossipsub

**What people do:** Send entire images or files through gossipsub message payloads.
**Why it is wrong:** Gossipsub replicates to D mesh peers + lazy gossip. A 5MB image becomes 5MB * 12+ copies in the mesh. Congests the gossip network, delays real-time chat messages.
**Do this instead:** Content over 50KB is always block-referenced. Gossipsub carries only the message envelope (typically <5KB) with content hashes. Blocks are fetched on demand via direct peer requests (libp2p bitswap-like protocol or custom request-response).

### Anti-Pattern 3: Trusting Client Timestamps for Ordering

**What people do:** Use the sender's wall-clock time as the definitive message order.
**Why it is wrong:** Clocks drift. Malicious clients can backdate messages. Timezone confusion. Two messages sent at the "same" millisecond have no tiebreaker.
**Do this instead:** Wall clock is informational only (displayed as "sent at"). Server sequence number is the definitive order. Lamport timestamps provide causal ordering as a fallback when the server is unreachable.

### Anti-Pattern 4: Renderer Process Doing Crypto or P2P

**What people do:** Run libp2p or crypto operations in the Electron renderer process.
**Why it is wrong:** The renderer runs untrusted web content with strict security (contextIsolation, no nodeIntegration). Crypto keys in the renderer are exposed to XSS. Native addons (sodium-native, wrtc) cannot load in the renderer.
**Do this instead:** All crypto and P2P operations in the main process. The renderer gets only serialized results via contextBridge. Private keys never cross the IPC boundary.

### Anti-Pattern 5: Single WebSocket for Everything

**What people do:** Multiplex all data (signaling, chat messages, presence, voice negotiation, block requests) over a single WebSocket to the server.
**Why it is wrong:** Head-of-line blocking. A large block transfer delays signaling. No independent backpressure per data type.
**Do this instead:** One WebSocket for control plane (auth, signaling, ordering confirmations, presence). Block transfers go peer-to-peer via DataChannels. Voice signaling is a subset of the control WebSocket (low volume). If needed, separate WebSocket connections for high-throughput data.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| STUN server | Standard WebRTC ICE, use public servers (Google, Twilio) or self-host (coturn) | Free STUN is sufficient; only TURN costs money |
| TURN server | Fallback relay for peers behind symmetric NAT | Self-host coturn; this is the main operational cost if many peers need relay |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Server <-> Client | WebSocket (control plane) | JSON protocol, JWT auth, reconnect with backoff |
| Client <-> Client | WebRTC DataChannel (data plane) | Managed by libp2p, gossipsub for messages, request-response for blocks |
| Client <-> Client | WebRTC MediaStream (voice) | Separate PeerConnection, signaled via server |
| Main <-> Renderer | Electron IPC (contextBridge) | Structured clone serialization, typed API surface |
| Main <-> Workers | Worker Threads (MessagePort) | For bulk crypto only, not primary data path |
| P2P Engine <-> Block Store | Direct function calls | Same process, no serialization |
| P2P Engine <-> Server Connection | Event bus | Decoupled: P2P engine emits events, server connection listens and relays |

### Key Interface Contracts

```typescript
// Between P2P Engine and Block Store
interface BlockStore {
  has(hash: string): Promise<boolean>;
  get(hash: string): Promise<Uint8Array | null>;
  put(hash: string, data: Uint8Array): Promise<void>;
  delete(hash: string): Promise<void>;
  getSize(): Promise<number>; // Total bytes stored
}

// Between P2P Engine and IPC layer
interface P2PEngineAPI {
  publish(channelId: string, envelope: MessageEnvelope): Promise<void>;
  subscribe(channelId: string): Promise<void>;
  unsubscribe(channelId: string): Promise<void>;
  requestBlock(hash: string): Promise<Uint8Array | null>;
  getConnectedPeers(): Promise<PeerInfo[]>;
}

// Between Server Connection and IPC layer
interface ServerAPI {
  authenticate(email: string, password: string): Promise<AuthResult>;
  getChannels(): Promise<Channel[]>;
  joinChannel(channelId: string): Promise<void>;
  getMessageHistory(channelId: string, before: number, limit: number): Promise<MessageEnvelope[]>;
  onOrderingConfirmation(cb: (msgId: string, seq: number) => void): void;
}
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-50 users | Single coordination server (even Raspberry Pi). Full mesh gossipsub. WebRTC mesh voice works fine. All blocks replicated across most peers. |
| 50-500 users | Gossipsub mesh parameters matter (D=6 keeps overlay manageable). Content index on server becomes important for finding rare blocks. Voice channels should cap at 10-12. Super-seeders help with block availability. |
| 500-5000 users | Server needs decent hardware (not RPi). SQLite may need WAL mode tuning. Consider sharding gossipsub topics by server (already namespaced). DHT becomes important for peer discovery. TURN costs increase -- encourage NAT-friendly network configs. |
| 5000+ users | Multiple coordination servers behind load balancer (shared SQLite -> consider PostgreSQL). Gossipsub works well at this scale (designed for Ethereum with 10k+ nodes). Voice needs SFU for channels >10 people. Block availability is good (many peers to fetch from). |

### Scaling Priorities

1. **First bottleneck: NAT traversal / TURN relay.** If many peers are behind symmetric NAT, the TURN server becomes a bandwidth bottleneck. Mitigation: encourage UPnP, provide clear network setup docs, consider multiple TURN servers.
2. **Second bottleneck: Content availability with peer churn.** When peers go offline, their blocks become unavailable. Mitigation: replication factor tracking on server, super-seeders, server fallback store.
3. **Third bottleneck: Server WebSocket connections.** At 5000+ concurrent connections, the server needs tuning (ulimit, connection pooling). Rust/tokio handles this well but monitor memory per connection.

---

## Build Order (Dependency Graph)

Components should be built in this order based on dependencies:

```
Phase 1: Foundation
├── Server: Auth module + WebSocket skeleton
├── Client: Electron shell + IPC framework + preload bridge
└── Client: React app shell (empty, but connected via IPC)

Phase 2: P2P Core
├── Client: js-libp2p node (WebRTC transport, basic connectivity)
├── Client: Gossipsub (publish/subscribe to topics)
├── Server: Signaling module (SDP/ICE relay)
└── Test: Two clients can discover each other and gossip messages

Phase 3: Chat
├── Client: Message envelope creation, signing
├── Server: Message ordering (server_seq assignment)
├── Client: Message display (React components)
├── Client: Block store (content-addressed, encrypted at rest)
└── Test: Two clients can chat with messages appearing in order

Phase 4: Content Distribution
├── Client: Cache cascade (5 layers)
├── Client: Block splitting/manifests for large content
├── Server: Content index + fallback block store
├── Client: Prefetch engine
└── Test: Image sharing works, loads from peers

Phase 5: Voice
├── Client: Voice manager (WebRTC PeerConnections)
├── Server: Voice signaling (participant tracking)
├── Client: Audio processing pipeline
└── Test: Two clients can voice chat

Phase 6: Polish
├── Client: Presence + typing indicators
├── Client: Threads, reactions, embeds
├── Server: Moderation tools
├── Client: DM encryption (X25519)
└── Client: Retention/eviction policies
```

**Phase ordering rationale:**
- Auth + IPC first because everything depends on authenticated connections and the IPC bridge
- P2P core before chat because chat messages flow through gossipsub
- Chat before content distribution because text chat validates the gossip layer before adding complexity
- Content distribution before voice because it exercises the full data path (blocks, caching, resolution)
- Voice is independent of content distribution but needs signaling infrastructure from Phase 1-2
- Polish features (presence, DMs, moderation) are additive and do not block core functionality

---

## Sources

- libp2p gossipsub specification: https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md (HIGH confidence -- canonical spec)
- Electron IPC documentation: https://www.electronjs.org/docs/latest/tutorial/ipc (HIGH confidence -- official docs, but could not verify current API; validate during implementation)
- Axum framework: https://github.com/tokio-rs/axum (HIGH confidence -- official tokio ecosystem project)
- Lamport timestamps: Lamport, L. "Time, Clocks, and the Ordering of Events in a Distributed System" (1978) (HIGH confidence -- foundational CS paper)
- Content-addressed storage patterns: IPFS documentation, https://docs.ipfs.tech/ (MEDIUM confidence -- training data, not live-verified)
- sodium-native: https://github.com/sodium-friends/sodium-native (MEDIUM confidence -- training data)
- WebRTC mesh scaling: General distributed systems knowledge (MEDIUM confidence -- well-known but not source-verified)

**Note on confidence:** WebSearch and WebFetch were unavailable during this research session. All findings are based on training data (cutoff May 2025). Architecture patterns for libp2p, Electron, Rust/tokio, and content-addressed storage are well-established and unlikely to have changed materially, but specific API details (js-libp2p current version, Electron MessagePort behavior, Axum extractors) should be validated against current documentation during implementation.

---
*Architecture research for: UNITED P2P Encrypted Chat Platform*
*Researched: 2026-02-22*
