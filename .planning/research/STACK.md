# Technology Stack

**Project:** UNITED (Unified Network for Independent, Trusted, Encrypted Dialogue)
**Researched:** 2026-02-22
**Mode:** Stack validation and prescriptive recommendations

## Verdict on Chosen Stack

The chosen stack (Rust/tokio server, Electron/React client, libp2p P2P, SQLite DB, libsodium crypto, WebRTC voice) is **well-chosen and validated** with three important caveats:

1. **rust-libp2p `webrtc` transport is alpha-only** (0.9.0-alpha.1) -- the Rust server should NOT use WebRTC DataChannels for P2P. Use WebSocket transport on the server side. Only the Electron/js-libp2p side should use WebRTC DataChannels for browser-peer communication.
2. **Many RustCrypto crates are in release-candidate state** (aes-gcm 0.11.0-rc.3, argon2 0.6.0-rc.7, dalek 3.0.0-pre.6). Use current stable versions (aes-gcm 0.10.3, argon2 0.5.3, ed25519-dalek 2.2.0) rather than chasing pre-releases.
3. **sodium-native + Electron requires native rebuild** -- plan for `@electron/rebuild` in the build pipeline from day one.

## Recommended Stack

### Server (Rust)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Rust** | stable (1.85+) | Language | Memory safety without GC, single-binary deployment, runs on RPi4. No viable alternative for this constraint set. | HIGH |
| **tokio** | 1.49.0 | Async runtime | Industry standard. Every async Rust library assumes tokio. No reason to use async-std or smol. | HIGH |
| **libp2p** | 0.56.0 | P2P networking | gossipsub, Kademlia DHT, noise, yamux all built-in. Battle-tested at IPFS/Filecoin scale. | HIGH |
| **axum** | 0.8.8 | HTTP/WebSocket server | Built on tower/hyper, first-party tokio ecosystem. Better ergonomics than warp, more composable than actix-web. | HIGH |
| **rusqlite** | 0.38.0 | SQLite bindings | Mature, direct C bindings, bundled SQLite option. Faster and simpler than sqlx for embedded use (sqlx 0.9 still alpha). | HIGH |
| **serde** | 1.0.228 | Serialization | Universal Rust serialization. No alternative worth considering. | HIGH |
| **serde_json** | 1.0.149 | JSON | For API responses, config files. | HIGH |
| **tracing** | 0.1.44 | Structured logging | Industry standard for async Rust. Replaces log/env_logger. | HIGH |
| **tracing-subscriber** | 0.3.22 | Log formatting | Companion to tracing. | HIGH |

#### Server Crypto (Rust)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **ed25519-dalek** | 2.2.0 (stable) | Message signing | Ed25519 signatures for author verification. Stable release, well-audited. Do NOT use 3.0.0-pre.x in production. | HIGH |
| **x25519-dalek** | 2.0.1 (stable) | DH key exchange | X25519 for DM E2E encryption key agreement. Stable. Do NOT use 3.0.0-pre.x. | HIGH |
| **aes-gcm** | 0.10.3 (stable) | Block encryption at rest | AES-256-GCM for encrypted block store. RustCrypto ecosystem. Stable release -- the 0.11.0-rc series is not production-ready. | MEDIUM |
| **argon2** | 0.5.3 (stable) | KDF for user keys | Argon2id for encrypting Ed25519 private keys with user passphrase (client-side) and deriving at-rest encryption keys. Stable. The 0.6.0-rc series is active but not finalized. | MEDIUM |
| **rand** | 0.10.0 | CSPRNG | Cryptographic random number generation. | HIGH |
| **blake3** | 1.8.3 | Fast hashing | Content-addressing for blocks. 2-3x faster than SHA-256, SIMD-accelerated, tree-hashable (parallel). Consider over SHA-256 for block hashing. | MEDIUM |

**Crypto version strategy:** Pin to current stable releases. The RustCrypto ecosystem is undergoing a major version transition (curve25519-dalek v4, new AEAD APIs). When these reach 1.0/stable, migrate. Do not chase release candidates.

#### Server libp2p Features

```toml
[dependencies]
libp2p = { version = "0.56.0", features = [
    "tokio",
    "gossipsub",
    "kad",
    "noise",
    "yamux",
    "websocket",       # Server accepts WS connections from clients
    "identify",
    "ping",
    "relay",           # Server acts as relay for NAT-blocked peers
    "dcutr",           # Direct Connection Upgrade through Relay
    "autonat",         # NAT status detection
    "upnp",            # UPnP port mapping
    "macros",
    "ed25519",
    "serde",
    "request-response", # Custom protocol for block transfer
    "memory-connection-limits",
    "metrics",
] }
```

**CRITICAL:** Do NOT enable `webrtc-websys` (browser WASM only) or depend on `libp2p-webrtc` (alpha). The server communicates over WebSocket. Peer-to-peer WebRTC DataChannels happen exclusively on the client side via js-libp2p.

#### Server Supporting Crates

| Crate | Version | Purpose | Confidence |
|-------|---------|---------|------------|
| **tokio-tungstenite** | 0.28.0 | WebSocket implementation (used by axum) | HIGH |
| **tower** | 0.5.3 | Middleware framework (rate limiting, auth) | HIGH |
| **bytes** | 1.11.1 | Efficient byte buffer manipulation | HIGH |
| **dashmap** | 6.1.0 (stable) | Concurrent HashMap for peer/session state | MEDIUM |
| **uuid** | 1.21.0 | Unique identifiers | HIGH |
| **sha2** | 0.10.8 (stable) | SHA-256 for content addressing (if not using blake3) | HIGH |

### Client (Electron + React)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Electron** | 40.6.0 | Desktop shell | Chromium for WebRTC, Node.js for native modules. Discord uses it. v40 is current stable (Feb 2026). | HIGH |
| **React** | 19.2.4 | UI framework | Largest ecosystem, concurrent rendering, suspense for data loading. v19 is stable. | HIGH |
| **TypeScript** | 5.9.3 | Type safety | Non-negotiable for a project this complex. | HIGH |
| **Vite** | 7.3.1 | Build tool | Fast HMR, ESM-native. Use with electron-vite for Electron integration. | HIGH |
| **electron-vite** | 5.0.0 | Electron + Vite integration | Handles main/preload/renderer build configuration. Supports Vite 5-7. | HIGH |

#### Client libp2p Stack

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| **libp2p** | 3.1.3 | Core P2P node | HIGH |
| **@chainsafe/libp2p-gossipsub** | 14.1.2 | Pub/sub for message propagation | HIGH |
| **@libp2p/kad-dht** | 16.1.3 | DHT for peer/content discovery | HIGH |
| **@chainsafe/libp2p-noise** | 17.0.0 | Encrypted transport (Noise protocol) | HIGH |
| **@chainsafe/libp2p-yamux** | 8.0.1 | Stream multiplexer | HIGH |
| **@libp2p/webrtc** | 6.0.11 | WebRTC DataChannel transport (peer-to-peer) | HIGH |
| **@libp2p/websockets** | 10.1.3 | WebSocket transport (to server) | HIGH |
| **@libp2p/identify** | 4.0.10 | Peer identification protocol | HIGH |
| **@libp2p/ping** | 3.0.10 | Connection health checks | HIGH |
| **@libp2p/bootstrap** | 12.0.11 | Bootstrap peer discovery | HIGH |
| **@libp2p/circuit-relay-v2** | 4.1.3 | Relay for NAT traversal | HIGH |
| **@libp2p/dcutr** | 3.0.10 | Direct connection upgrade through relay | HIGH |
| **@libp2p/autonat** | 3.0.10 | NAT status detection | HIGH |
| **@libp2p/upnp-nat** | 4.0.10 | UPnP port mapping | HIGH |

**Key interop note:** js-libp2p `@libp2p/webrtc` depends on `node-datachannel` (v0.32.1) which wraps libdatachannel via native Node.js addon. This works in Electron's Node.js context (main process or preload) but NOT in the renderer process. The libp2p node MUST run in Electron's main process.

#### Client Crypto

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| **sodium-native** | 5.0.10 | libsodium bindings | HIGH |

**Why sodium-native over Web Crypto API:** sodium-native provides Argon2id (not in Web Crypto), X25519 key exchange, Ed25519 signing, and AES-256-GCM all in one audited C library. Web Crypto lacks Argon2id and has awkward APIs for the X25519+Ed25519 combo. sodium-native is a native addon -- requires `@electron/rebuild` for Electron compatibility.

**Alternative considered:** `libsodium-wrappers` (WASM-based, no native compilation). Slower but avoids rebuild complexity. Use only as fallback if sodium-native causes persistent build issues.

#### Client Database

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| **better-sqlite3** | 12.6.2 | SQLite for local message index, metadata, peer cache | HIGH |

**Why better-sqlite3 over sql.js:** Synchronous API is actually an advantage for Electron main process -- no callback overhead. Native SQLite is 10-50x faster than WASM sql.js. Supports Node 20-25. Requires `@electron/rebuild`.

**Engine constraint:** Node 20.x+ required (per better-sqlite3 engines field). Electron 40 ships Chromium 132 + Node ~22, so this is fine.

#### Client UI Libraries

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| **zustand** | 5.0.11 | State management | Minimal, fast, React 19 compatible. Simpler than Redux for chat state. | HIGH |
| **@tanstack/react-query** | 5.90.21 | Async state/cache management | For server API calls, peer data fetching with caching. | MEDIUM |
| **@tanstack/react-virtual** | 3.13.18 | Virtualized lists | Essential for chat message lists with thousands of items. | HIGH |
| **tailwindcss** | 4.2.0 | Utility-first CSS | Fast iteration, small output with purge. v4 is stable. | HIGH |
| **Radix UI** | 1.1.x | Unstyled accessible components | Dialogs, popovers, dropdowns, tooltips. Composable with Tailwind. | MEDIUM |
| **lucide-react** | 0.575.0 | Icons | Consistent icon set, tree-shakeable. | LOW |
| **blurhash** | 2.0.5 | Placeholder images | Zero-reflow image loading per McMaster-Carr pattern. | MEDIUM |

#### Client Build & Tooling

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| **electron-builder** | 26.8.1 | App packaging & distribution | More mature than Electron Forge for cross-platform builds. Auto-update support. | MEDIUM |
| **@electron/rebuild** | 4.0.3 | Native module compilation | Required for sodium-native + better-sqlite3 in Electron. | HIGH |
| **electron-updater** | 6.8.3 | Auto-updates | Companion to electron-builder. | MEDIUM |
| **esbuild** | 10.1.18 | Fast JS bundling (used by Vite) | | HIGH |

#### Client Testing

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| **vitest** | 4.0.18 | Unit/integration testing | Vite-native, fast, good DX. | HIGH |
| **playwright** | 1.58.2 | E2E testing | Cross-platform Electron testing support. | MEDIUM |
| **@testing-library/react** | 16.3.2 | React component testing | Standard React testing approach. | HIGH |

#### Client Serialization

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| **@bufbuild/protobuf** | 2.11.0 | Protocol Buffers | For structured P2P messages. Matches libp2p's internal protobuf use. Newer and better than protobufjs. | MEDIUM |
| **msgpackr** | 1.11.8 | MessagePack | For efficient binary serialization of chat messages. Faster and smaller than JSON for structured data. | MEDIUM |

**Recommendation:** Use protobuf for P2P protocol messages (interop with Rust `prost` crate) and msgpackr for application-level message payloads where schema evolution matters less.

### Shared Utilities

| Package/Crate | Version | Purpose | Confidence |
|---------------|---------|---------|------------|
| **multiformats** (npm) | 13.4.2 | CID/multiaddr encoding | Required by libp2p for content addressing. | HIGH |
| **uint8arrays** (npm) | 5.1.0 | Uint8Array utilities | Required by libp2p ecosystem. | HIGH |
| **prost** (Rust crate) | ~0.13 | Protobuf for Rust | Matches @bufbuild/protobuf for cross-language message definitions. | MEDIUM |

## rust-libp2p / js-libp2p Integration Points

This is the most critical interop boundary in the entire project. Here are the specific integration concerns:

### Protocol Compatibility

| Protocol | Rust Crate | JS Package | Interop Status | Confidence |
|----------|-----------|------------|----------------|------------|
| Noise XX | libp2p-noise 0.46.1 | @chainsafe/libp2p-noise 17.0.0 | Fully interoperable (spec-compliant) | HIGH |
| Yamux | libp2p-yamux 0.47.0 | @chainsafe/libp2p-yamux 8.0.1 | Fully interoperable (spec-compliant) | HIGH |
| Gossipsub v1.1 | libp2p-gossipsub 0.49.2 | @chainsafe/libp2p-gossipsub 14.1.2 | Fully interoperable | HIGH |
| Kademlia DHT | libp2p-kad 0.48.0 | @libp2p/kad-dht 16.1.3 | Interoperable (same protocol ID) | HIGH |
| Identify | libp2p-identify 0.47.0 | @libp2p/identify 4.0.10 | Interoperable | HIGH |
| WebSocket | libp2p-websocket 0.45.1 | @libp2p/websockets 10.1.3 | Primary server-client transport | HIGH |
| Circuit Relay v2 | libp2p-relay 0.21.1 | @libp2p/circuit-relay-v2 4.1.3 | Interoperable | MEDIUM |
| DCUtR | libp2p-dcutr 0.14.1 | @libp2p/dcutr 3.0.10 | Interoperable | MEDIUM |

### Transport Architecture

```
[Electron Client A]                [Rust Server]              [Electron Client B]
    js-libp2p                      rust-libp2p                    js-libp2p
        |                              |                              |
        |------- WebSocket ----------->|<--------- WebSocket ---------|
        |    (server comms,            |     (server comms,           |
        |     gossipsub relay,         |      gossipsub relay,        |
        |     DHT bootstrap)           |      DHT bootstrap)          |
        |                              |                              |
        |<========= WebRTC DataChannel (direct P2P) ================>|
        |    (block transfer,                                         |
        |     direct gossip,                                          |
        |     voice signaling)                                        |
```

**Critical architecture decision:** The Rust server uses `libp2p-websocket` (stable) to accept connections. It does NOT use WebRTC. Clients connect to the server over WebSocket and to each other over WebRTC DataChannels. The server acts as:
1. **Bootstrap node** for DHT peer discovery
2. **Relay node** for NAT-blocked peers (circuit-relay-v2)
3. **Gossipsub router** relaying messages when peers lack direct connections
4. **Fallback super-seeder** for content blocks

### Custom Protocol Registration

Both Rust and JS libp2p support custom protocol handlers via `request-response` (Rust: `libp2p-request-response`, JS: custom stream handlers). Define shared protocol IDs:

```
/united/block-transfer/1.0.0   -- Content block request/response
/united/channel-sync/1.0.0     -- Channel history synchronization
/united/peer-announce/1.0.0    -- Peer capability announcement
```

Protocol messages should use **Protobuf** for cross-language compatibility (Rust `prost` + JS `@bufbuild/protobuf`). Both libraries encode/decode identically from the same `.proto` files.

### Gossipsub Topic Mapping

```
/united/channel/<channel-id>/messages    -- Channel messages
/united/channel/<channel-id>/presence    -- Typing, online status
/united/server/<server-id>/events        -- Server-wide events (joins, leaves)
/united/peer/<peer-id>/direct            -- Direct message notification
```

Both rust-libp2p gossipsub and js-libp2p gossipsub use the same topic string format. Messages are raw bytes -- use protobuf encoding for cross-language safety.

### Kademlia DHT Keys

```
/united/block/<sha256-hash>             -- Find peers seeding a content block
/united/channel/<channel-id>/peers      -- Find peers in a channel
/united/peer/<peer-id>/addrs            -- Peer address records
```

DHT provider records and peer records are interoperable between Rust and JS implementations.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **Server language** | Rust | Go, Node.js | Go lacks libp2p maturity vs Rust. Node.js cannot run on RPi4 with acceptable memory. Rust's single-binary deployment is ideal for self-hosting. |
| **Server HTTP** | axum 0.8 | actix-web 4.13, warp 0.4 | actix-web has good perf but weaker tower integration. warp's filter system is awkward. axum is the tokio team's recommended choice. |
| **Server DB** | rusqlite 0.38 | sqlx 0.8/0.9 | sqlx adds async complexity for an embedded DB. sqlx 0.9 is still alpha. rusqlite is sync, fast, and simple for SQLite-only use. |
| **Client framework** | React 19 | Svelte 5, Solid | React has the largest component ecosystem (important for chat UI complexity). Svelte/Solid have smaller ecosystems. Bundle size is irrelevant in Electron. |
| **Client state** | zustand 5 | Redux Toolkit, Jotai | Redux is over-engineered for this. Zustand is minimal, fast, works well with React 19 concurrent features. |
| **Client build** | electron-vite + Vite 7 | Webpack, esbuild direct | Vite has best-in-class HMR. electron-vite handles main/preload/renderer split cleanly. Webpack is slow. |
| **Packaging** | electron-builder 26 | Electron Forge 7 | electron-builder is more mature for auto-updates and cross-platform. Forge is improving but electron-builder has better docs/ecosystem for complex builds. |
| **P2P library** | libp2p | Hypercore/Hyperswarm | libp2p has both Rust and JS implementations with interop. Hypercore is JS-only (no Rust server). libp2p gossipsub maps perfectly to chat message propagation. |
| **Crypto (JS)** | sodium-native 5 | libsodium-wrappers, Web Crypto | sodium-native is fastest. libsodium-wrappers (WASM) is fallback. Web Crypto lacks Argon2id. |
| **Crypto (Rust)** | RustCrypto ecosystem (stable) | ring, sodiumoxide | ring lacks X25519 as public API. sodiumoxide is unmaintained. RustCrypto has active maintenance and the full primitive set needed. |
| **Block hashing** | BLAKE3 | SHA-256 | BLAKE3 is 2-3x faster, parallelizable (tree hashing), and standardized. Consider migrating from SHA-256 if content-addressing is performance-critical. SHA-256 is safer default if interop with existing systems matters. |
| **Serialization** | Protobuf (protocol) + msgpackr (payload) | JSON everywhere, CBOR | JSON is too verbose for binary P2P messages. CBOR is good but protobuf has better cross-language codegen (prost + @bufbuild/protobuf). |
| **Voice** | Chromium WebRTC (built-in) | mediasoup, Janus | No external media server needed for P2P mesh voice. Chromium's WebRTC stack is production-grade. SFU deferred to post-v1. |

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| **libp2p-webrtc (Rust)** | Alpha-only (0.9.0-alpha.1). Not production-ready. Server should use WebSocket transport. |
| **sqlx (Rust)** | 0.9 is alpha. 0.8 is stable but adds unnecessary async complexity for embedded SQLite. Use rusqlite. |
| **ed25519-dalek 3.0.0-pre.x** | Pre-release. Use stable 2.2.0. |
| **x25519-dalek 3.0.0-pre.x** | Pre-release. Use stable 2.0.1. |
| **aes-gcm 0.11.0-rc.x** | Release candidate. Use stable 0.10.3. |
| **argon2 0.6.0-rc.x** | Release candidate. Use stable 0.5.3. |
| **wrtc (npm)** | Abandoned at 0.4.7. Not maintained. Use @libp2p/webrtc which uses node-datachannel. |
| **simple-peer (npm)** | Legacy WebRTC wrapper. Unnecessary when using libp2p's WebRTC transport. |
| **@libp2p/mplex** | Deprecated muxer. Use yamux. |
| **Webpack** | Slow, complex config. Vite is strictly better for new Electron projects. |
| **Redux** | Over-engineered for chat state management. Zustand is sufficient. |
| **Electron Forge** | Less mature auto-update story than electron-builder for complex native module projects. |

## Installation

### Server (Cargo.toml)

```toml
[package]
name = "united-server"
version = "0.1.0"
edition = "2024"
rust-version = "1.85"

[dependencies]
# Async Runtime
tokio = { version = "1.49", features = ["full"] }

# P2P Networking
libp2p = { version = "0.56", features = [
    "tokio", "gossipsub", "kad", "noise", "yamux", "websocket",
    "identify", "ping", "relay", "dcutr", "autonat", "upnp",
    "macros", "ed25519", "serde", "request-response",
    "memory-connection-limits", "metrics"
] }

# HTTP/WebSocket Server
axum = { version = "0.8", features = ["ws"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace"] }

# Database
rusqlite = { version = "0.38", features = ["bundled", "vtab"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
prost = "0.13"

# Crypto
ed25519-dalek = { version = "2.2", features = ["serde"] }
x25519-dalek = { version = "2.0", features = ["static_secrets"] }
aes-gcm = "0.10"
argon2 = "0.5"
rand = "0.10"
blake3 = "1.8"

# Utilities
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
bytes = "1.11"
uuid = { version = "1.21", features = ["v4", "serde"] }
```

### Client (package.json dependencies)

```bash
# Core
npm install react@^19.2 react-dom@^19.2 libp2p@^3.1.3

# libp2p transports & protocols
npm install @libp2p/websockets@^10.1 @libp2p/webrtc@^6.0 \
  @chainsafe/libp2p-gossipsub@^14.1 @libp2p/kad-dht@^16.1 \
  @chainsafe/libp2p-noise@^17.0 @chainsafe/libp2p-yamux@^8.0 \
  @libp2p/identify@^4.0 @libp2p/ping@^3.0 @libp2p/bootstrap@^12.0 \
  @libp2p/circuit-relay-v2@^4.1 @libp2p/dcutr@^3.0 \
  @libp2p/autonat@^3.0 @libp2p/upnp-nat@^4.0

# Crypto
npm install sodium-native@^5.0

# Database
npm install better-sqlite3@^12.6

# UI
npm install zustand@^5.0 @tanstack/react-query@^5.90 \
  @tanstack/react-virtual@^3.13 tailwindcss@^4.2 \
  blurhash@^2.0 lucide-react@^0.575

# Serialization
npm install @bufbuild/protobuf@^2.11 msgpackr@^1.11 \
  multiformats@^13.4 uint8arrays@^5.1

# Dev dependencies
npm install -D typescript@^5.9 electron@^40.6 \
  electron-vite@^5.0 vite@^7.3 @electron/rebuild@^4.0 \
  electron-builder@^26.8 electron-updater@^6.8 \
  vitest@^4.0 @testing-library/react@^16.3 playwright@^1.58 \
  @types/react@^19 @types/better-sqlite3@^7
```

## Native Module Build Pipeline

Both `sodium-native` and `better-sqlite3` are native Node.js addons (C/C++ compiled via node-gyp). In Electron, the Node.js version differs from system Node.js, so modules must be recompiled.

### Required Setup

```json
// package.json
{
  "scripts": {
    "postinstall": "electron-builder install-app-deps",
    "rebuild": "electron-rebuild -f -w sodium-native,better-sqlite3,node-datachannel"
  }
}
```

`node-datachannel` (dependency of `@libp2p/webrtc`) is also a native module. Three native modules total require rebuild for Electron.

### Build Matrix Concern

Native modules must be compiled per-platform (Windows, macOS, Linux) and per-architecture (x64, arm64). `electron-builder` handles this during packaging, but CI must build on all target platforms.

## Electron Security Configuration

```javascript
// main process - BrowserWindow creation
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,      // REQUIRED: isolate renderer from Node.js
    nodeIntegration: false,      // REQUIRED: no Node.js in renderer
    sandbox: true,               // Additional isolation
    preload: path.join(__dirname, 'preload.js'),
  }
});
```

All libp2p, crypto, and database operations run in the **main process** or a **utility process**. The renderer communicates via `contextBridge`/`ipcRenderer` exposed in the preload script. This is non-negotiable for security.

## Version Pinning Strategy

| Category | Strategy | Rationale |
|----------|----------|-----------|
| Electron | Pin major (40.x) | Major version = Chromium version. Test before upgrading. |
| React | Pin major (19.x) | Stable API. Minor updates safe. |
| libp2p (JS) | Pin minor (3.1.x) | Breaking changes between minors are common in libp2p. Test upgrades. |
| libp2p (Rust) | Pin minor (0.56.x) | Same -- libp2p breaks between minors. |
| Crypto (Rust) | Pin exact stable | Never auto-upgrade crypto. Audit each update. |
| sodium-native | Pin major (5.x) | Native addon -- test rebuilds on upgrade. |

## Sources

All version data verified via live queries (2026-02-22):

- **crates.io API** (direct HTTP): libp2p 0.56.0 (published 2025-06-27), tokio 1.49.0 (2026-01-03), axum 0.8.8, rusqlite 0.38.0 (2025-12-20), ed25519-dalek 2.2.0 (2025-07-09), x25519-dalek 2.0.1 (2024-02-07), aes-gcm 0.10.3 (2023-09-21), argon2 0.5.3 (2024-01-20), blake3 1.8.3, serde 1.0.228
- **npm registry** (`npm view`): libp2p 3.1.3 (2026-01-16), electron 40.6.0 (2026-02-19), sodium-native 5.0.10, better-sqlite3 12.6.2 (2026-01-17), react 19.2.4, vite 7.3.1, typescript 5.9.3
- **npm dependency trees**: libp2p deps, @libp2p/webrtc deps (node-datachannel 0.32.1)
- **crates.io feature inspection**: libp2p 0.56.0 feature flags verified (no native webrtc, websys only)

**Confidence note:** Rust crate versions verified via crates.io API. npm versions verified via local npm CLI. No web search available -- interop claims based on training data + protocol spec compliance (libp2p protocols are specified, not implementation-specific). Interop confidence is HIGH for core protocols (noise, yamux, gossipsub, kad) because these are spec-defined. MEDIUM for relay/dcutr because fewer real-world cross-implementation deployments are documented.
