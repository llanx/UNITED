# Phase 3: P2P Networking - Research

**Researched:** 2026-02-25
**Domain:** libp2p mesh networking (gossipsub, relay, NAT traversal, WebRTC)
**Confidence:** MEDIUM-HIGH

## Summary

Phase 3 builds a libp2p mesh network where the UNITED server runs a rust-libp2p node (alongside axum) acting as super-seeder, relay, and AutoNAT probe, while Electron clients run js-libp2p nodes connecting via WebSocket to the server and via WebRTC DataChannels directly to peers. Gossipsub provides pub/sub messaging per channel topic. The server's existing WebSocket connection infrastructure (Phase 1) provides peer directory services, while a new libp2p Swarm runs as a parallel tokio task within the same runtime.

The primary technical risks are: (1) integrating rust-libp2p's Swarm event loop alongside axum's HTTP server in a shared tokio runtime, (2) bridging UNITED's Ed25519 identity keys with libp2p's Noise handshake and PeerId system, and (3) getting NAT traversal (AutoNAT + Circuit Relay v2 + DCUtR hole-punching) working reliably across client network configurations. The js-libp2p ecosystem has moved to v3.x (September 2025) but the project's STATE.md notes pinning at v3.1.3 — research confirms v3.x is the correct target.

**Primary recommendation:** Build the server's libp2p node first (gossipsub + relay + AutoNAT + identify), then the client's libp2p node (WebSocket to server + WebRTC to peers + gossipsub), then the peer discovery directory API, then the dev panel. Use `libp2p` crate v0.56 on the server and `libp2p` npm v3.1.x on the client.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Developer Observability — Dev Panel**: Full debug panel with Peers section (connected peer list with ID, connection type, latency, NAT type) and Gossipsub section (subscribed topics, message count, last received timestamp, delivery latency). Ctrl+Shift+D shortcut, floating overlay, live auto-refresh via push events (~1-2s), zero overhead when closed. 3 test actions: send test message, ping peer, force reconnect. Build proper IPC data pipeline now — dev panel UI is throwaway, IPC channel is permanent. Ships in all builds.
- **Peer Discovery**: Server as active directory — coordination server tracks online peers via existing WebSocket connections and responds to "who's in this channel?" queries. No DHT.
- **Connection Lifecycle**: No hard connection limit — gossipsub mesh degree (D=3-4) naturally caps connections. Gossipsub v1.1 peer scoring enabled. Hybrid reconnection: auto-reconnect with exponential backoff (1s-30s) for mesh peers, lazy for non-mesh. After ~2 min failed reconnection, query server directory for replacement.
- **Channel Subscription Model**: Subscribe to ALL joined channels at startup. Switching channels is purely UI — zero network activity.
- **Server Downtime Resilience**: Graceful degradation — existing P2P connections and gossipsub mesh continue. Lamport timestamp ordering during downtime. Ordering reconciliation on server return via sequence number assignment.
- **Server's P2P Role**: Full mesh participant with rust-libp2p, subscribes to all topics, super-seeder. Persists all messages to SQLite with server-assigned sequence numbers. Local-first client history with gap-fill from server.
- **NAT Traversal Infrastructure**: Circuit Relay v2 bundled as protocol handler on server's libp2p node. AutoNAT via server probing. Configurable relay limits in united.toml.
- **Message Signing & Peer Authentication**: Ed25519 signature on every gossipsub message. UNITED identity keys in Noise handshake. Key rotation changes PeerId; server directory maps identity to current PeerId. Member list verification after Noise handshake.
- **Wire Format & Encoding**: Protobuf everywhere — same .proto schemas for WebSocket and gossipsub. Rich message envelope: sender_pubkey + signature + topic + message_type + timestamp + sequence_hint (Lamport) + payload_bytes. Channel UUID topics.

### Claude's Discretion

- **Gossipsub tuning parameters**: Research exact values for D, D_lo, D_hi, batching window, per-topic bandwidth budgets
- **WebRTC DataChannel configuration**: SCTP parameters, DTLS settings, ICE candidate gathering
- **Server runtime topology**: Whether libp2p and axum share a tokio runtime or run isolated
- **Topic namespace prefix**: Whether to include server ID in gossipsub topic names

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| P2P-02 | New messages are propagated to channel peers via libp2p gossipsub protocol | Gossipsub architecture section covers rust-libp2p and js-libp2p gossipsub setup, message signing with MessageAuthenticity::Signed, and topic-per-channel pattern. ConfigBuilder tuning for D=4, D_lo=3, D_hi=8 documented. |
| SEC-06 | All peer-to-peer communication is encrypted in transit (TLS for WebSocket to server, DTLS for WebRTC DataChannels between peers) | Noise protocol section covers libp2p's mandatory Noise_XX handshake (encrypts all libp2p connections). WebSocket to server uses Noise over WS. WebRTC DataChannels use built-in DTLS. No additional TLS layer needed — libp2p Noise provides equivalent security. |
| APP-02 | All P2P connections persist across channel navigation | Channel subscription model: subscribe to all joined channels at startup means connections are topic-independent. Switching channels is a UI-only operation — no connection teardown. libp2p Swarm maintains connections at the transport level, not per-topic. |

</phase_requirements>

## Standard Stack

### Core — Server (Rust)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `libp2p` | 0.56 | P2P networking framework (meta-crate) | The canonical Rust libp2p implementation, actively maintained by Protocol Labs |
| Feature: `gossipsub` | (via libp2p 0.56) | Pub/sub mesh messaging | Implements gossipsub v1.1 spec with peer scoring |
| Feature: `relay` | (via libp2p 0.56) | Circuit Relay v2 server | Bundled relay for NAT traversal |
| Feature: `autonat` | (via libp2p 0.56) | NAT type detection | Probes clients to classify NAT |
| Feature: `noise` | (via libp2p 0.56) | Connection encryption | Noise_XX handshake with Ed25519 identity authentication |
| Feature: `identify` | (via libp2p 0.56) | Peer information exchange | Required for address discovery and protocol negotiation |
| Feature: `dcutr` | (via libp2p 0.56) | Direct Connection Upgrade through Relay | Hole-punching after relay connection established |
| Feature: `websocket` | (via libp2p 0.56) | WebSocket transport | Clients connect to server via WS (browser-compatible) |
| Feature: `tokio` | (via libp2p 0.56) | Tokio runtime integration | Shared runtime with existing axum server |
| Feature: `yamux` | (via libp2p 0.56) | Stream multiplexing | Standard multiplexer for libp2p |
| Feature: `tcp` | (via libp2p 0.56) | TCP transport | Server-to-server or local connections |
| Feature: `dns` | (via libp2p 0.56) | DNS resolution | Resolve multiaddresses |
| Feature: `ping` | (via libp2p 0.56) | Peer liveness checks | RTT measurement for dev panel |

### Core — Client (Electron/Node.js)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `libp2p` | ^3.1.3 | P2P networking framework | Latest stable js-libp2p (v3.x released Sept 2025) |
| `@libp2p/websockets` | ^10.1 | WebSocket transport | Connect to server's libp2p node |
| `@libp2p/webrtc` | ^6.0 | WebRTC transport (direct + relayed) | Peer-to-peer DataChannels between clients |
| `@chainsafe/libp2p-noise` | ^17.0 | Noise encryption | Must use v17+ with libp2p@3.x |
| `@chainsafe/libp2p-yamux` | latest | Stream multiplexing | Standard multiplexer |
| `@chainsafe/libp2p-gossipsub` | ^14.1 | Gossipsub pub/sub | TypeScript gossipsub v1.1 with peer scoring |
| `@libp2p/identify` | latest | Peer identification | Address exchange and protocol negotiation |
| `@libp2p/circuit-relay-v2` | latest | Circuit relay client | Connect through server relay when behind NAT |
| `@libp2p/dcutr` | latest | Hole punching | Upgrade relayed connections to direct |
| `@libp2p/ping` | latest | Peer liveness | RTT measurement for dev panel |
| `@libp2p/crypto` | latest | Key utilities | `privateKeyFromProtobuf` for Ed25519 key import |
| `node-datachannel` | ^0.31 | Native WebRTC | WebRTC for Node.js/Electron (N-API, no Chrome dependency) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `libp2p-identity` | (via libp2p 0.56) | Ed25519 keypair for libp2p | Convert UNITED Ed25519 keys to libp2p identity format |
| `multiaddr` | latest | Multiaddress parsing | Construct and parse libp2p multiaddresses |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Gossipsub | Floodsub | Simpler but no mesh optimization, no peer scoring — floods every message to every peer. Not viable at scale. |
| Circuit Relay v2 | Separate TURN server | More standard WebRTC approach but requires separate infrastructure. Relay v2 is zero-config bundled with server. |
| js-libp2p 3.x | js-libp2p 2.x | v2.x still works but module versions are behind. v3.x is the active development target with async protocol handlers. |
| WebRTC (node-datachannel) | TCP only via server | Removes NAT traversal complexity but all traffic routes through server — defeats P2P purpose. |

**Installation — Server (Cargo.toml addition):**
```toml
libp2p = { version = "0.56", features = [
    "gossipsub", "relay", "autonat", "noise", "identify",
    "dcutr", "websocket", "tokio", "yamux", "tcp", "dns", "ping"
] }
```

**Installation — Client (npm):**
```bash
npm install libp2p@^3.1.3 @libp2p/websockets @libp2p/webrtc @chainsafe/libp2p-noise @chainsafe/libp2p-yamux @chainsafe/libp2p-gossipsub @libp2p/identify @libp2p/circuit-relay-v2 @libp2p/dcutr @libp2p/ping @libp2p/crypto node-datachannel
```

## Architecture Patterns

### Recommended Project Structure — Server

```
server/src/
├── p2p/
│   ├── mod.rs              # Module declarations, public types
│   ├── behaviour.rs        # Composed NetworkBehaviour (gossipsub + relay + autonat + identify + dcutr + ping)
│   ├── swarm.rs            # SwarmBuilder setup, event loop, integration with AppState
│   ├── config.rs           # P2P config struct (relay limits, gossipsub tuning) merged into united.toml
│   ├── directory.rs        # Peer directory: who's online, who's in which channel
│   ├── messages.rs         # Gossipsub message handling: envelope encode/decode, signature verify, persist to DB
│   └── identity.rs         # Convert UNITED Ed25519 keys to libp2p identity, PeerId management
├── config.rs               # Extended with P2P config section
├── state.rs                # Extended with Swarm handle / command channel
└── ...existing modules...
```

### Recommended Project Structure — Client

```
client/src/main/
├── p2p/
│   ├── node.ts             # createLibp2p() configuration, start/stop lifecycle
│   ├── gossipsub.ts        # Topic subscription, message publish/receive, envelope handling
│   ├── discovery.ts        # Peer directory queries via IPC (server WebSocket), connect to discovered peers
│   ├── identity.ts         # Convert UNITED Ed25519 keys to libp2p format, PeerId derivation
│   ├── stats.ts            # P2P stats aggregation: peer list, latency, topic counts, push to renderer
│   └── types.ts            # Shared P2P types (PeerInfo, TopicStats, etc.)
├── ipc/
│   ├── p2p.ts              # IPC handlers for P2P operations (start mesh, get peers, send test msg, etc.)
│   └── channels.ts         # Extended with P2P IPC channel names
└── ...existing modules...

client/src/renderer/src/
├── components/
│   └── DevPanel.tsx         # Floating overlay: peer list, gossipsub stats, test actions
├── hooks/
│   └── useP2P.ts            # Subscribe to P2P stats push events
├── stores/
│   └── p2p.ts               # P2P state slice: peers, topics, latency, NAT type
└── ...existing modules...
```

### Pattern 1: Shared Tokio Runtime (Server)

**What:** Run both axum HTTP server and libp2p Swarm in the same `#[tokio::main]` runtime.
**When to use:** Always for this project (simpler deployment, shared state).
**Recommendation:** Share runtime. The libp2p Swarm event loop runs as a `tokio::spawn`ed task. Communication between axum handlers and the Swarm uses `tokio::sync::mpsc` command channels.

```rust
// Simplified architecture:
// main.rs spawns both axum::serve and the swarm event loop

// Command channel: axum handlers -> swarm task
let (swarm_cmd_tx, swarm_cmd_rx) = tokio::sync::mpsc::unbounded_channel::<SwarmCommand>();

// Event channel: swarm task -> message handler
let (swarm_evt_tx, swarm_evt_rx) = tokio::sync::mpsc::unbounded_channel::<SwarmEvent>();

// Swarm task
tokio::spawn(async move {
    let mut swarm = build_swarm(identity_keypair).await;
    swarm.listen_on("/ip4/0.0.0.0/tcp/0/ws".parse().unwrap()).unwrap();

    loop {
        tokio::select! {
            event = swarm.select_next_some() => {
                handle_swarm_event(event, &swarm_evt_tx).await;
            }
            cmd = swarm_cmd_rx.recv() => {
                if let Some(cmd) = cmd {
                    handle_swarm_command(&mut swarm, cmd).await;
                }
            }
        }
    }
});
```

**Rationale:** Isolated runtimes add complexity (cross-runtime messaging, separate thread pools) with no real benefit. The Swarm event loop is async and cooperates well with other tokio tasks. axum 0.8 is built on tokio/hyper. Both are designed for the same runtime.

### Pattern 2: Identity Bridge (UNITED Ed25519 to libp2p PeerId)

**What:** Convert UNITED's existing Ed25519 keypair into libp2p's identity format for Noise handshakes and PeerId derivation.
**When to use:** When initializing the libp2p node (server and client).

```rust
// Server (Rust) — convert UNITED Ed25519 keys to libp2p identity
use libp2p::identity;

fn united_keys_to_libp2p(secret_key_bytes: &[u8]) -> identity::Keypair {
    // UNITED stores 32-byte Ed25519 seed
    let ed25519_keypair = identity::ed25519::Keypair::try_from_bytes(
        &mut secret_key_bytes.to_vec()  // ed25519 expects 64 bytes (seed+public) or 32-byte seed
    ).expect("valid Ed25519 key");
    identity::Keypair::from(ed25519_keypair)
}

// PeerId is derived: for Ed25519 (32 bytes), identity multihash is used (key embedded directly)
let peer_id = identity::PeerId::from(keypair.public());
```

```typescript
// Client (TypeScript) — convert UNITED Ed25519 keys to libp2p identity
import { privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'

// UNITED stores Ed25519 seed bytes
function unitedKeysToLibp2p(secretKeyBytes: Uint8Array): { privateKey: Ed25519PrivateKey, peerId: PeerId } {
    // Need to encode as protobuf format that libp2p expects
    const privateKey = privateKeyFromProtobuf(encodeEd25519ToProtobuf(secretKeyBytes))
    const peerId = peerIdFromPrivateKey(privateKey)
    return { privateKey, peerId }
}
```

**Critical detail:** libp2p PeerId for Ed25519 keys uses the identity multihash (key is embedded directly, not SHA-256 hashed), because serialized Ed25519 public keys are <= 42 bytes. This means the PeerId changes when the UNITED identity key rotates. The server's peer directory MUST map UNITED identity (stable fingerprint) to current PeerId (changes on rotation).

### Pattern 3: Gossipsub Message Envelope

**What:** Wrap every gossipsub message in a protobuf envelope with cryptographic metadata.
**When to use:** All gossipsub publish and receive operations.

```protobuf
// New proto file: p2p.proto
syntax = "proto3";
package united.p2p;

message GossipEnvelope {
    bytes sender_pubkey = 1;      // 32-byte Ed25519 public key
    bytes signature = 2;          // 64-byte Ed25519 signature over fields 3-7
    string topic = 3;             // Channel UUID
    MessageType message_type = 4;
    uint64 timestamp = 5;         // Sender wall clock (hint only)
    uint64 sequence_hint = 6;     // Lamport counter for offline ordering
    bytes payload = 7;            // Inner message (protobuf-encoded)
}

enum MessageType {
    MESSAGE_TYPE_UNSPECIFIED = 0;
    MESSAGE_TYPE_CHAT = 1;        // Phase 4
    MESSAGE_TYPE_TYPING = 2;      // Phase 4
    MESSAGE_TYPE_PRESENCE = 3;    // Phase 4
    MESSAGE_TYPE_TEST = 99;       // Dev panel test messages
}
```

**Signing:** libp2p gossipsub has built-in message signing via `MessageAuthenticity::Signed(keypair)` — this signs the gossipsub-level message. UNITED additionally signs the inner envelope with the UNITED identity key (the `signature` field above). This provides two layers: (1) gossipsub mesh integrity (prevents relay tampering), (2) UNITED identity proof (verifiable by any peer, persists in storage).

### Pattern 4: Peer Directory via WebSocket

**What:** Clients query the server for peer multiaddresses via the existing WebSocket connection (not a new protocol).
**When to use:** On startup, when joining new channels, when mesh peers become unreachable.

```
Client → Server (via existing WS envelope):
  PeerDirectoryRequest { channel_ids: [uuid1, uuid2, ...] }

Server → Client:
  PeerDirectoryResponse {
    peers: [
      { united_id: "fingerprint", peer_id: "12D3KooW...", multiaddrs: ["/ip4/.../tcp/.../ws/p2p/..."], channels: [uuid1] },
      ...
    ]
  }
```

The server builds this from: (1) its WebSocket connection registry (who's online), (2) the libp2p identify protocol results (what multiaddresses each peer advertises), (3) channel membership from SQLite. This is a simple REST-like query over the existing WS connection — no DHT, no mDNS, no complex discovery protocol.

### Pattern 5: Dev Panel IPC Pipeline

**What:** P2P stats flow from main process to renderer via push events on a consistent IPC channel.
**When to use:** Permanent architecture — dev panel is throwaway UI, IPC pipeline is the investment.

```typescript
// Main process: aggregate stats and push
const P2P_STATS_INTERVAL = 2000 // 2 seconds

function startStatsPush(libp2pNode: Libp2p) {
    let panelOpen = false

    ipcMain.on(IPC.P2P_PANEL_OPEN, () => { panelOpen = true })
    ipcMain.on(IPC.P2P_PANEL_CLOSE, () => { panelOpen = false })

    setInterval(() => {
        if (!panelOpen) return // Zero overhead when closed

        const stats: P2PStats = {
            peers: getPeerList(libp2pNode),      // id, type, latency, NAT
            topics: getTopicStats(libp2pNode),    // subscribed, msg count, last received
            natType: getNatType(),                 // from AutoNAT
        }

        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC.PUSH_P2P_STATS, stats)
        }
    }, P2P_STATS_INTERVAL)
}
```

### Anti-Patterns to Avoid

- **Running libp2p in the renderer process:** The renderer has CSP restrictions and runs in a sandboxed context. libp2p MUST run in the main process (Node.js context) where it has access to native modules (node-datachannel, sodium-native) and can make direct network connections.
- **Using DHT for peer discovery:** The user explicitly decided against DHT. The server is the directory. Adding DHT adds enormous complexity with no benefit at self-hosted community scale.
- **Separate topic per message type:** The user decided channel UUID = topic. Message type is a field in the envelope, not the topic name. Fewer topics = healthier mesh.
- **Reconnecting libp2p connections on channel switch:** The user explicitly decided connections persist across channel navigation. The Swarm maintains transport-level connections independently of topic subscriptions.
- **Treating server-assigned sequence numbers as real-time:** Sequence numbers are assigned when messages are persisted to SQLite. During server downtime, Lamport counters provide ordering hints. Reconciliation happens when the server returns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pub/sub messaging | Custom relay/fanout | `libp2p-gossipsub` | Mesh optimization, peer scoring, message deduplication, heartbeat protocol — 10K+ lines of tested code |
| NAT traversal | Custom STUN/TURN | `libp2p-relay` + `libp2p-autonat` + `libp2p-dcutr` | Circuit Relay v2 + AutoNAT + hole-punching is a complete NAT traversal stack |
| Connection encryption | Custom TLS wrapper | `libp2p-noise` | Noise_XX handshake with identity authentication, forward secrecy, no certificate management |
| Stream multiplexing | Custom framing | `libp2p-yamux` | Yamux handles flow control, backpressure, stream lifecycle |
| Peer identity | Custom PeerId format | `libp2p-identity` | Multihash-based PeerId with Ed25519 identity embedding |
| Message deduplication | In-memory seen-set | Gossipsub's `duplicate_cache_time` | Built-in 1-minute dedup with configurable TTL |
| WebRTC for Node.js/Electron | wrtc npm package (deprecated) | `node-datachannel` | Active maintenance, N-API v8, lighter than full WebRTC stack |
| Lamport clock | Custom implementation | Simple u64 counter | Lamport clocks are trivial — just max(local, received) + 1. No library needed. |

**Key insight:** libp2p is a modular framework — every component (transport, encryption, muxing, routing) is pluggable. The standard stack provides tested implementations for every layer. Custom solutions in any of these areas would need to handle edge cases that took years to discover in production P2P networks.

## Common Pitfalls

### Pitfall 1: Gossipsub Default D=6 Causes Bandwidth Storms for Chat

**What goes wrong:** Default gossipsub mesh degree D=6 means each message is forwarded to 6 peers. At chat rates (1-10 messages/second), this creates O(N*D) traffic. With 100 users and D=6, a single message generates 600 forwards.
**Why it happens:** Default parameters are tuned for blockchain/IPFS use cases with low message frequency and high reliability requirements. Chat has the opposite profile: high frequency, tolerance for occasional loss.
**How to avoid:** Set `mesh_n=4`, `mesh_n_low=3`, `mesh_n_high=8`. This gives adequate redundancy while capping per-message amplification. Enable `flood_publish=false` (default is true) for non-critical messages after initial testing.
**Warning signs:** CPU/bandwidth spikes that scale quadratically with user count.

### Pitfall 2: Gossipsub max_transmit_size Default Too Small

**What goes wrong:** Default `max_transmit_size` is 2048 bytes. A gossipsub envelope with sender_pubkey (32) + signature (64) + topic UUID (36) + metadata + payload can easily exceed this for longer text messages.
**Why it happens:** Default is tuned for small blockchain messages.
**How to avoid:** Set `max_transmit_size` to 65536 (64 KiB). This accommodates text messages with inline thumbnails (per P2P-10 requirement for future phases) while preventing abuse. The 64 KiB limit is the gossipsub RPC max, so individual messages should stay well under.
**Warning signs:** Messages silently dropped with no error; gossipsub logs "message too large".

### Pitfall 3: Noise Keypair Mismatch With UNITED Identity

**What goes wrong:** libp2p's Noise handshake authenticates the peer's static DH key against their libp2p identity key. If the UNITED Ed25519 key is not correctly converted to libp2p's identity format, the PeerId check fails and connections are rejected.
**Why it happens:** UNITED stores 32-byte Ed25519 seeds. libp2p's `ed25519::Keypair::try_from_bytes` expects either 32-byte seed or 64-byte expanded key. Wrong format = wrong PeerId = handshake failure.
**How to avoid:** Test the identity conversion early. Verify that `PeerId::from(keypair.public())` on the server matches the PeerId the client derives from the same key bytes.
**Warning signs:** All connections fail with Noise handshake errors; PeerId mismatch in logs.

### Pitfall 4: Circuit Relay v2 Default Limits Block Chat

**What goes wrong:** Default relay limits are designed for bootstrapping (2 min duration, 128 KB data limit per direction). Chat connections through relay will be killed every 2 minutes.
**Why it happens:** Relay v2 defaults assume temporary connections that will be upgraded via DCUtR hole-punching. If hole-punching fails (20-30% of NAT configurations), the relay becomes the primary connection.
**How to avoid:** Increase server relay config: `max_circuit_duration` to 30+ minutes, `max_circuit_bytes` to 10+ MB. Expose these in `united.toml` so server admins can tune them. Add reconnection logic for when relay limits are hit.
**Warning signs:** Users behind strict NATs lose connections every 2 minutes; relay "circuit closed" events in logs.

### Pitfall 5: js-libp2p v3.x API Breaking Changes

**What goes wrong:** Code examples found online (tutorials, Stack Overflow) are for libp2p v1.x or v2.x. The v3.x API has breaking changes: protocol handler signature changed from `({ stream, connection }): void` to `(stream, connection): void | Promise<void>`, and middleware support was added.
**Why it happens:** js-libp2p v3.0.0 was released September 2025, so most online resources are outdated.
**How to avoid:** Pin `libp2p@^3.1.3` and use only the official v3.x documentation. Check the v2 -> v3 migration guide for all breaking changes.
**Warning signs:** TypeScript errors about protocol handler signatures; `stream.sink` vs `stream.writable` confusion.

### Pitfall 6: node-datachannel Requires Electron Rebuild

**What goes wrong:** `node-datachannel` is a native N-API module (like `sodium-native` and `better-sqlite3`). Without rebuilding for Electron's specific Node.js version, it crashes at runtime.
**Why it happens:** Electron bundles its own Node.js ABI. Native modules compiled for system Node.js have incompatible binary interfaces.
**How to avoid:** Add `node-datachannel` to the existing `electron-rebuild` step that already handles `sodium-native` and `better-sqlite3`. The project already has `@electron/rebuild` configured with `--version 40.6.0`.
**Warning signs:** `MODULE_NOT_FOUND` or `NAPI_VERSION` errors at startup.

### Pitfall 7: Swarm Event Loop Starvation

**What goes wrong:** The libp2p Swarm event loop must be polled continuously (`swarm.select_next_some()`). If the swarm task is blocked by slow SQLite writes or expensive gossipsub message processing, the Swarm stops processing network events, causing connection timeouts and message delays.
**Why it happens:** The Swarm event loop is single-select — it processes one event at a time.
**How to avoid:** Use `tokio::spawn_blocking` for all SQLite operations (the project already does this pattern). Process gossipsub messages asynchronously — receive the message, validate the signature, then spawn a task for persistence. Never block the swarm select loop.
**Warning signs:** Peer connections timing out during high message volume; gossipsub heartbeat delays.

### Pitfall 8: Member List Verification Race Condition

**What goes wrong:** After Noise handshake, peers verify the connecting key belongs to a registered server member. But the member list is pushed via WebSocket events and may be stale. A newly registered user's key might not be in the local cache yet.
**Why it happens:** Member list updates are eventually consistent — WebSocket push is async.
**How to avoid:** On verification failure, query the server for the specific member before rejecting. Cache the member list locally but treat it as a hint, not authoritative for rejection decisions. Only reject if the server confirms the key is not registered.
**Warning signs:** Newly registered users can't connect to the P2P mesh; "unknown peer" errors that resolve after a few seconds.

## Code Examples

### Server: Building the Composed NetworkBehaviour

```rust
// Source: rust-libp2p SwarmBuilder pattern from docs.rs/libp2p/0.56
use libp2p::{
    gossipsub, relay, autonat, identify, dcutr, noise, yamux, ping,
    swarm::NetworkBehaviour, identity, PeerId,
};

#[derive(NetworkBehaviour)]
pub struct UnitedBehaviour {
    pub gossipsub: gossipsub::Behaviour,
    pub relay: relay::Behaviour,
    pub autonat: autonat::Behaviour,
    pub identify: identify::Behaviour,
    pub dcutr: dcutr::Behaviour,
    pub ping: ping::Behaviour,
}

pub async fn build_swarm(
    keypair: identity::Keypair,
    gossipsub_config: gossipsub::Config,
    relay_config: relay::Config,
) -> libp2p::Swarm<UnitedBehaviour> {
    let peer_id = PeerId::from(keypair.public());

    libp2p::SwarmBuilder::with_existing_identity(keypair.clone())
        .with_tokio()
        .with_tcp(
            Default::default(),
            noise::Config::new,
            yamux::Config::default,
        )
        .unwrap()
        .with_websocket(
            noise::Config::new,
            yamux::Config::default,
        )
        .await
        .unwrap()
        .with_behaviour(|key| {
            let gossipsub = gossipsub::Behaviour::new(
                gossipsub::MessageAuthenticity::Signed(key.clone()),
                gossipsub_config,
            ).expect("valid gossipsub config");

            UnitedBehaviour {
                gossipsub,
                relay: relay::Behaviour::new(peer_id, relay_config),
                autonat: autonat::Behaviour::new(peer_id, Default::default()),
                identify: identify::Behaviour::new(identify::Config::new(
                    "/united/1.0.0".to_string(),
                    key.public(),
                )),
                dcutr: dcutr::Behaviour::new(peer_id),
                ping: ping::Behaviour::default(),
            }
        })
        .unwrap()
        .build()
}
```

### Server: Gossipsub Configuration (Tuned for Chat)

```rust
// Source: Gossipsub spec + CONTEXT.md decisions
let gossipsub_config = gossipsub::ConfigBuilder::default()
    .mesh_n(4)                                              // D=4 (user decision: 3-4 range)
    .mesh_n_low(3)                                          // D_lo=3
    .mesh_n_high(8)                                         // D_hi=8 (conservative upper bound)
    .mesh_outbound_min(2)                                   // At least 2 outbound mesh peers
    .heartbeat_interval(Duration::from_secs(1))             // Default, fine for chat
    .max_transmit_size(65536)                               // 64 KiB (accommodate text + small inline data)
    .validation_mode(gossipsub::ValidationMode::Strict)     // Require valid signatures
    .flood_publish(true)                                    // Ensure initial message delivery
    .message_id_fn(|msg| {                                  // Dedup by content hash
        let mut hasher = sha2::Sha256::new();
        hasher.update(&msg.data);
        gossipsub::MessageId::from(hasher.finalize().to_vec())
    })
    .build()
    .expect("valid gossipsub config");
```

### Server: Relay Configuration (Tuned for Chat)

```rust
// Source: libp2p-relay Config defaults + CONTEXT.md decisions
let relay_config = relay::Config {
    max_reservations: 128,              // Default — fine for most communities
    max_reservations_per_peer: 4,       // Default
    reservation_duration: Duration::from_secs(3600),  // 1 hour (default)
    max_circuits: 64,                   // Increased from default 16 — chat needs more
    max_circuits_per_peer: 8,           // Increased from default 4
    max_circuit_duration: Duration::from_secs(30 * 60),  // 30 min (up from 2 min default!)
    max_circuit_bytes: 10 * 1024 * 1024,  // 10 MB per direction (up from 128 KB!)
    ..Default::default()
};
```

### Client: Creating the libp2p Node

```typescript
// Source: js-libp2p v3.x CONFIGURATION.md + libp2p guides
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { webRTC } from '@libp2p/webrtc'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { dcutr } from '@libp2p/dcutr'
import { ping } from '@libp2p/ping'

async function createUnitedP2PNode(privateKey: Ed25519PrivateKey) {
    return createLibp2p({
        privateKey,
        transports: [
            webSockets(),
            webRTC(),
            circuitRelayTransport(),
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: {
            pubsub: gossipsub({
                emitSelf: false,
                D: 4,
                Dlo: 3,
                Dhi: 8,
                allowPublishToZeroTopicPeers: true,  // Server is always subscribed
            }),
            identify: identify(),
            dcutr: dcutr(),
            ping: ping(),
        },
    })
}
```

### Gossipsub Topic Management

```typescript
// Subscribe to all joined channels at startup (per CONTEXT.md decision)
async function subscribeToChannels(node: Libp2p, channelIds: string[]) {
    for (const channelId of channelIds) {
        const topic = channelIdToTopic(channelId)
        node.services.pubsub.subscribe(topic)
    }
}

// Topic naming: channel UUID, optionally prefixed with server ID
function channelIdToTopic(channelId: string, serverId?: string): string {
    // Recommendation: include server ID prefix for multi-server future-proofing
    return serverId ? `${serverId}/${channelId}` : channelId
}
```

## Discretion Recommendations

### Gossipsub Tuning Parameters

**Recommendation (HIGH confidence):**
- `D (mesh_n)` = 4 — within user's 3-4 range. 4 provides slightly better redundancy than 3.
- `D_lo (mesh_n_low)` = 3 — triggers mesh repair when below 3 peers.
- `D_hi (mesh_n_high)` = 8 — prunes when above 8. Conservative cap prevents bandwidth waste.
- `mesh_outbound_min` = 2 — ensures at least 2 outbound connections for eclipse attack resistance.
- `heartbeat_interval` = 1s (default) — fine for chat. No need to change.
- `max_transmit_size` = 65536 (64 KiB) — accommodates text messages with metadata. Increase later for inline media.
- Message batching: Not needed at Phase 3. Gossipsub heartbeat naturally batches IHAVE/IWANT. If chat rate exceeds 10 msg/s per topic, add application-level batching (50-100ms window) in Phase 4.

### WebRTC DataChannel Configuration

**Recommendation (MEDIUM confidence):**
- Let `@libp2p/webrtc` handle SCTP/DTLS configuration with defaults. These are well-tuned for data-oriented use cases.
- ICE candidate gathering: Use the server's libp2p multiaddress as a STUN-like reference point. AutoNAT handles NAT classification.
- `node-datachannel` in Electron provides the WebRTC implementation. No browser WebRTC API needed since this is a desktop app.

### Server Runtime Topology

**Recommendation: Shared runtime (HIGH confidence).**
- Both axum and the libp2p Swarm run in the same `#[tokio::main]` runtime.
- Communication via `tokio::sync::mpsc` channels (command channel for axum -> swarm, event channel for swarm -> handler).
- The Swarm event loop runs as a `tokio::spawn` task.
- Rationale: Both are async, both use tokio. Separate runtimes add cross-thread communication overhead and deployment complexity with no measurable benefit.

### Topic Namespace Prefix

**Recommendation: Include server ID prefix (MEDIUM confidence).**
- Format: `{server_id}/{channel_uuid}` — e.g., `srv_abc123/550e8400-e29b-41d4-a716-446655440000`
- Rationale: Costs nothing now, prevents topic collision if multi-server support is added later.
- The `server_id` could be a truncated hash of the server's public key, or the server URL hash, or a UUID. Recommend: first 16 chars of server fingerprint.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| js-libp2p v2.x (sync protocol handlers) | js-libp2p v3.x (async protocol handlers, middleware) | Sept 2025 | Must use v3.x module versions (@chainsafe/libp2p-noise v17+, etc.) |
| libp2p-gossipsub as separate crate | Bundled in libp2p meta-crate via feature flag | libp2p 0.52+ | Use `libp2p = { features = ["gossipsub"] }`, not `libp2p-gossipsub` directly |
| Circuit Relay v1 (unlimited, no reservations) | Circuit Relay v2 (resource reservation, limited relay) | 2022 | Must configure increased limits for chat use case |
| `SwarmBuilder::new()` | `SwarmBuilder::with_existing_identity()` / `::with_new_identity()` | libp2p 0.53+ | Type-safe builder pattern, no separate Transport construction |
| `wrtc` npm package for Node.js WebRTC | `node-datachannel` | 2023 | `wrtc` is unmaintained. `node-datachannel` is lighter and actively maintained. |
| `peer-id` npm package | `@libp2p/peer-id` + `@libp2p/crypto` | libp2p modularization | Use `peerIdFromPrivateKey()` and `privateKeyFromProtobuf()` |

**Deprecated/outdated:**
- `wrtc` npm package: Unmaintained, do not use. Use `node-datachannel` for Electron.
- `libp2p-gossipsub` direct crate dependency: Use the feature flag on the `libp2p` meta-crate instead.
- `@libp2p/webrtc-direct` npm package (v6.0.0, last published 2 years ago): Consolidated into `@libp2p/webrtc`.
- `peer-id` npm package: Deprecated, use `@libp2p/peer-id`.

## Open Questions

1. **Ed25519 seed format compatibility between sodium-native and libp2p**
   - What we know: UNITED uses `sodium-native` for Ed25519 key generation (32-byte seed). libp2p's `ed25519::Keypair::try_from_bytes` accepts 32-byte seed or 64-byte expanded key. On the JS side, `@libp2p/crypto` uses protobuf encoding for key import.
   - What's unclear: Whether the 32-byte seed from sodium-native can be directly imported into libp2p's Ed25519 format without transformation. The Ed25519 "seed" vs "secret key" distinction varies between libraries.
   - Recommendation: Build a test during the first plan that generates a key with sodium-native, converts it to libp2p identity format, and verifies the PeerId matches on both Rust and JS sides. This is the single most critical integration point.

2. **libp2p WebSocket listener port vs axum HTTP port**
   - What we know: The server currently listens on port 1984 for HTTP/WS (axum). libp2p needs its own WebSocket listener for the Swarm.
   - What's unclear: Whether to use a separate port for libp2p WS (e.g., 1985) or multiplex on the same port. Multiplexing is complex; separate ports are simpler.
   - Recommendation: Use a separate port (configurable in united.toml, default 1985). Client connects to both: axum WS on 1984 for control plane, libp2p WS on 1985 for data plane. Document this clearly.

3. **Gossipsub peer scoring parameter values**
   - What we know: Peer scoring is enabled per CONTEXT.md. The PeerScoreParams and TopicScoreParams structs have many interdependent fields. The gossipsub v1.1 spec says "reasonable defaults are not shown because parameters are application-specific."
   - What's unclear: Optimal scoring weights for a chat application (vs. blockchain which dominates the existing examples).
   - Recommendation: Start with conservative scoring: enable mesh delivery tracking but set penalty weights low. Tune in later phases based on real-world testing. The mesh will self-optimize even with basic scoring.

4. **js-libp2p v3.1.3 compatibility with @libp2p/webrtc for Electron (Node.js, not browser)**
   - What we know: `@libp2p/webrtc` v6.x works in browsers and Node.js. Node.js support uses `node-datachannel` under the hood. Electron runs Node.js in the main process.
   - What's unclear: Whether `@libp2p/webrtc` v6.x correctly discovers and uses `node-datachannel` in the Electron main process environment, or if additional polyfill/configuration is needed.
   - Recommendation: Test early in the first client plan. If `@libp2p/webrtc` doesn't work in Electron, fall back to direct `node-datachannel` usage with manual signaling through the server's WS connection.

## Sources

### Primary (HIGH confidence)
- [libp2p 0.56.0 — docs.rs](https://docs.rs/libp2p/latest/libp2p/) — Module list, feature flags, SwarmBuilder API
- [libp2p-gossipsub ConfigBuilder — docs.rs](https://docs.rs/libp2p-gossipsub/latest/libp2p_gossipsub/struct.ConfigBuilder.html) — Mesh parameters, defaults
- [libp2p-relay Config — rust-libp2p source](https://github.com/libp2p/rust-libp2p/blob/master/protocols/relay/src/behaviour.rs) — Relay limits and defaults
- [libp2p gossipsub v1.1 spec](https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md) — Peer scoring, message signing, mesh parameters
- [libp2p Circuit Relay v2 spec](https://github.com/libp2p/specs/blob/master/relay/circuit-v2.md) — Reservation protocol, resource limits
- [libp2p Noise spec](https://github.com/libp2p/specs/tree/master/noise) — Noise_XX handshake, identity authentication
- [libp2p Peer IDs spec](https://github.com/libp2p/specs/blob/master/peer-ids/peer-ids.md) — PeerId derivation from Ed25519 public keys
- [js-libp2p CONFIGURATION.md](https://github.com/libp2p/js-libp2p/blob/main/doc/CONFIGURATION.md) — Node.js/browser configuration
- [node-datachannel GitHub](https://github.com/murat-dogan/node-datachannel) — WebRTC for Node.js/Electron

### Secondary (MEDIUM confidence)
- [js-libp2p v3.0.0 announcement](https://blog.libp2p.io/2025-09-30-js-libp2p/) — Breaking changes in v3.x
- [libp2p DCUtR spec](https://github.com/libp2p/specs/blob/master/relay/DCUtR.md) — Hole-punching protocol
- [libp2p AutoNAT spec](https://github.com/libp2p/specs/blob/master/autonat/README.md) — NAT detection protocol
- [libp2p identify spec](https://github.com/libp2p/specs/tree/master/identify) — Peer information exchange
- [rust-libp2p SwarmBuilder docs](https://libp2p.github.io/rust-libp2p/libp2p/struct.SwarmBuilder.html) — Type-safe builder API
- [@chainsafe/libp2p-gossipsub GitHub](https://github.com/ChainSafe/js-libp2p-gossipsub) — JS gossipsub v1.1
- [MessageAuthenticity — docs.rs](https://docs.rs/libp2p/latest/libp2p/gossipsub/enum.MessageAuthenticity.html) — Gossipsub signing modes

### Tertiary (LOW confidence)
- [Gossipsub with relays discussion](https://discuss.libp2p.io/t/gossipsub-with-relays/1923) — Community patterns for relay + gossipsub integration
- [Gossipsub message ordering discussion](https://discuss.libp2p.io/t/gossipsub-message-ordering-and-consensus/2240) — Confirms no built-in ordering in gossipsub

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — libp2p 0.56 is the current stable release on crates.io. js-libp2p 3.x confirmed as latest. Module versions verified via npm/crates.io.
- Architecture: MEDIUM-HIGH — Server-side patterns verified against docs.rs API. Client-side patterns follow official examples but js-libp2p v3.x + Electron + node-datachannel combination is not widely documented.
- Pitfalls: HIGH — Gossipsub default tuning issues well-documented. Relay default limits verified from source code. Electron rebuild requirement confirmed from existing project patterns.
- Identity bridge: MEDIUM — Ed25519 seed format compatibility between sodium-native and libp2p needs validation. The concept is sound but exact byte format conversions need testing.

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (30 days — libp2p ecosystem is moderately stable)
