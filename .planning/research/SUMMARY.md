# Project Research Summary

**Project:** UNITED (Unified Network for Independent, Trusted, Encrypted Dialogue)
**Domain:** P2P encrypted desktop chat platform / self-hosted Discord alternative
**Researched:** 2026-02-22
**Confidence:** MEDIUM

## Executive Summary

UNITED is a self-hosted, P2P chat platform that occupies a genuinely empty niche: Discord-class UX on top of a torrent-inspired, peer-to-peer content distribution architecture. Research confirms that building this type of product requires a three-tier system: a thin Rust coordination server for auth, ordering, and signaling; a libp2p-based P2P mesh (gossipsub + WebRTC DataChannels) for message propagation and content distribution; and a thick Electron+React client containing the P2P engine, 5-layer cache cascade, encrypted block store, and React UI. The chosen technology stack (Rust/tokio, libp2p, Electron, sodium-native, better-sqlite3) is well-validated with three important caveats: rust-libp2p's WebRTC transport is alpha-only and must not be used server-side, all RustCrypto crates must be pinned to current stable releases (not release candidates), and both sodium-native and better-sqlite3 require native module rebuild for Electron via `@electron/rebuild`.

The recommended approach is to build in six explicit phases following the architecture's dependency graph: Foundation (auth + app shell + IPC bridge) first, P2P Core second, Chat third, Content Distribution fourth, Voice fifth, and Polish sixth. This order is non-negotiable because the IPC bridge is required by every subsequent layer, gossipsub must work before chat messages, and the content-addressed block pipeline must be proven before voice and polish features are layered on top. The critical insight from competitor analysis is that no existing product combines P2P architecture with Discord-class UX — Keet is closest but targets small groups, not community servers. UNITED can win this niche if and only if it nails the core UX loop: messages feel instant, media loads fast (blurhash placeholders + parallel peer fetching), and the P2P mechanics are completely invisible to end users.

The principal risks, in priority order, are: (1) NAT traversal — 20-30% of real-world peer connections will require TURN relay, and this must be budgeted as core infrastructure from Phase 1; (2) content availability collapse in small servers (5-20 users) where peer churn leaves blocks unreachable, requiring the coordination server to act as a reliable fallback seeder; (3) gossipsub bandwidth storms when active channels produce high message volume with default parameters, requiring aggressive mesh tuning (D=3-4 for chat topics) and message batching from the start; and (4) E2E encryption key management complexity, which must be designed carefully in Phase 2 using a Megolm-style sender-ratchet scheme and a Signal-style prekey system for offline delivery. The Discord API compatibility trap is also a significant project risk — it must be explicitly deferred to Phase 4+ with a hard scope cap, or it will consume development time before core P2P features are complete.

---

## Key Findings

### Recommended Stack

The stack research validated all major technology choices and produced specific, pinned versions for production use. On the server side: Rust 1.85+ stable with tokio 1.49.0, libp2p 0.56.0 (WebSocket transport only — no WebRTC), axum 0.8.8 for HTTP/WebSocket, rusqlite 0.38.0 for SQLite (not sqlx, which is still in alpha at 0.9). Crypto is pinned to stable RustCrypto releases: ed25519-dalek 2.2.0, x25519-dalek 2.0.1, aes-gcm 0.10.3, argon2 0.5.3. The client uses Electron 40.6.0 with js-libp2p 3.1.3, React 19.2.4, TypeScript 5.9.3, Vite 7.3.1, sodium-native 5.0.10, and better-sqlite3 12.6.2. Three native addons require rebuild for Electron: sodium-native, better-sqlite3, and node-datachannel (dependency of @libp2p/webrtc).

**Core technologies:**
- **Rust + tokio**: Server language and async runtime — memory safety, single-binary deployment, runs on Raspberry Pi 4
- **libp2p (Rust 0.56 / JS 3.1.3)**: P2P networking — gossipsub, Kademlia DHT, noise, yamux; interoperable across Rust and JS implementations
- **axum 0.8.8**: HTTP/WebSocket server — built on tower/hyper, first-party tokio ecosystem
- **Electron 40.6.0**: Desktop shell — Chromium WebRTC built-in, Node.js for native modules; security requires contextIsolation=true, nodeIntegration=false
- **React 19.2.4 + zustand 5.0**: UI framework and state management — concurrent rendering, minimal state overhead
- **sodium-native 5.0.10**: Cryptography — libsodium bindings for Argon2id, X25519, Ed25519, AES-256-GCM
- **better-sqlite3 12.6.2**: Client-side database — fast sync SQLite for message index, block metadata, peer cache
- **@tanstack/react-virtual 3.13**: Virtualized message lists — mandatory from day one to prevent memory explosion
- **Protobuf (prost + @bufbuild/protobuf)**: Cross-language P2P protocol messages
- **electron-vite 5.0**: Build integration — handles main/preload/renderer split cleanly

**Critical version rules:** Never use libp2p-webrtc on the server (alpha only). Pin RustCrypto to stable releases, not release candidates. Use BLAKE3 for block hashing (2-3x faster than SHA-256). Version pin libp2p at the minor level for both Rust and JS — breaking changes between minors are common.

### Expected Features

Research analyzed 10 reference products (Discord, Element/Matrix, Keet, Revolt, Briar, RetroShare, Jami, Mumble, TeamSpeak, Guilded) to establish feature baselines. UNITED occupies an empty niche: no existing product combines P2P architecture with Discord-class community features and UX polish.

**Must have (table stakes — v1.0):**
- Text channels with real-time gossip-propagated delivery
- Direct messages with X25519 E2E encryption
- Message history and scrollback via P2P block fetching (validates entire cache cascade)
- File and image sharing with inline display and blurhash placeholders
- Markdown formatting, emoji reactions, typing indicators, user presence
- Voice channels for 2-8 users via WebRTC mesh
- Roles, basic permissions (admin/moderator/member), invite links, kick/ban
- Unread indicators, notifications, @mentions
- Configurable storage buffer and seeding indicators (P2P social contract)
- Encryption indicators

**Should have (differentiators — v1.x):**
- Threads, message editing and deletion with tombstone propagation
- Pinned messages with TTL bypass
- Full-text search over local SQLite index
- Link previews with privacy-conscious proxy
- Key verification (emoji/QR safety numbers)
- Screen sharing for small groups
- Predictive prefetching (McMaster-Carr-style)
- Volunteer super-seeders with cosmetic rewards
- Group DMs, peer status dashboard

**Defer (v2+):**
- Discord-compatible bot API (enormous surface area, scope trap)
- Mobile clients (iOS/Android background P2P is fundamentally broken by OS design)
- Server federation (Matrix complexity, years to stabilize)
- Video calls (P2P video at scale requires SFU, which is centralization)
- Noise suppression (requires ML models, too resource-intensive)
- Server discovery directory

**Confirmed anti-features:** Platform-level content moderation, OAuth/social login, GIF picker with Tenor/Giphy integration, AI features, vanity URLs, server boosting, rich presence, read receipts on channels.

### Architecture Approach

UNITED uses a three-tier architecture where the coordination server is intentionally thin (auth, signaling, ordering, fallback seeding) and the clients are thick (P2P engine, block store, cache cascade, crypto, voice manager). The server uses WebSocket transport only — never WebRTC. Peers communicate with the server via WebSocket and with each other via WebRTC DataChannels (managed by js-libp2p). Voice uses separate WebRTC PeerConnections (not libp2p-managed) to avoid lifecycle coupling with the data plane. Inside the Electron client, the libp2p engine, block store, and sodium-native crypto module all run in the main process (native addons cannot run in the renderer); the React UI runs in the renderer and communicates exclusively via contextBridge/ipcMain. A local HTTP content server in the main process serves decrypted blocks to the renderer, avoiding serialization overhead for binary data.

**Major components:**
1. **Coordination Server (Rust)** — Auth, JWT, WebSocket signaling, channel ordering (monotonic server_seq per channel), content index (hash-to-peer mapping), fallback encrypted block store, moderation
2. **P2P Engine (Client main process)** — js-libp2p node with gossipsub (topic-per-channel), Kademlia DHT, WebRTC DataChannel transport, peer discovery; runs in main process for native addon access
3. **Block Store + Cache Cascade (Client main process)** — Content-addressed flat-file storage (256KB blocks, 2-char hex prefix dirs), AES-256-GCM/XChaCha20 encrypted at rest with device key; 5-layer resolution: L0 memory LRU → L1 SQLite+files → L2 hot peers (parallel) → L3 DHT → L4 server fallback
4. **Crypto Module (Client main process)** — sodium-native: Argon2id KDF, Ed25519 signing/verification on every message, X25519 DM key exchange, prekey system for offline forward secrecy
5. **Voice Manager (Client main process)** — Separate WebRTC PeerConnections per participant, full mesh topology, capped at 10-12 participants, signaled via coordination server WebSocket
6. **React UI (Renderer)** — Virtualized message list, app shell architecture, communicates via contextBridge only; images served via local HTTP content server at 127.0.0.1:{random-port}
7. **IPC Bridge (Preload)** — Typed contextBridge API (invoke for request-response, ipcRenderer.on for push events); 60Hz batching for high-frequency updates

**Key patterns:** Hybrid Lamport timestamp + server_seq ordering (display optimistically, reconcile on confirmation); actor-per-connection on server (reader/writer tokio tasks with mpsc channel); convergent block addressing (hash plaintext, encrypt with device key at rest); separate gossipsub topics for chat, presence, and typing; UUIDv7 message IDs (timestamp-sortable).

### Critical Pitfalls

1. **NAT traversal failure cascade** — 20-30% of real-world connections need TURN relay; CGNAT is increasing. Prevention: budget TURN as core infrastructure from Phase 1; deploy libp2p AutoNAT + Circuit Relay v2; cap per-relay bandwidth; test with simulated symmetric NAT (connection success rate must exceed 95% with relay).

2. **Gossipsub message storm amplification** — Default D=6 parameters were designed for blockchain (1-2 msg/sec), not chat (10+ msg/sec). At 50+ concurrent chatters, residential upstream bandwidth saturates and cascading disconnects create a death spiral. Prevention: reduce mesh degree to D=3-4 for chat topics; batch messages into 50-100ms windows; implement per-topic bandwidth budgets; inline only content under 50KB.

3. **Content availability collapse in small servers** — A 10-person server with peer churn produces zero-seeder scenarios; blocks become permanently unavailable. Prevention: server must be a reliable fallback seeder for all recent content, not aspirationally "thin"; implement eager replication to at least 3 peers + server on upload; build content health monitoring tracking replication factor per block.

4. **Message ordering divergence** — Gossipsub provides no ordering guarantees; using wall-clock timestamps produces different conversation views at different peers. Prevention: server-assigned monotonic server_seq per channel is authoritative; Lamport timestamps for causal ordering when server is unreachable; design message store to handle out-of-order inserts from day one.

5. **E2E encryption key management complexity** — X25519 DM key exchange is straightforward for 2 parties; group DMs and forward secrecy for offline delivery explode in complexity. Prevention: use Megolm-style sender-ratchet (O(N) state, not O(N^2)); implement Signal-style prekey bundles (100 one-time keys per user) for offline forward secrecy; reliable key distribution via coordination server, not gossip; build safety number verification from the start.

6. **Electron memory leak** — Long-running chat apps accumulate DOM nodes, IPC listeners, and block cache entries without bounds. Prevention: virtualize message list from day one; LRU memory budget for block cache (default 256MB); audit IPC listeners on every channel switch; set regression target of RSS < 400MB after 8 hours; run Chrome DevTools memory profiling weekly.

7. **IPC bridge bottleneck** — All main-process-to-renderer communication crosses a serialization boundary; at 1000+ events/second this degrades to dropped frames. Prevention: never use sendSync; batch at 60Hz; use MessagePort (structured clone, transferable) for binary data; serve blocks via local HTTP server not IPC; benchmark 1000 msg/sec at 1KB without frame drops.

8. **DHT cold-start death** — Kademlia DHT is ineffective with fewer than 50-100 peers; most k-buckets are empty; queries time out 30-50% of the time. Prevention: do not rely on DHT for core operations in small servers; use server content index as primary; DHT is L3 (last-resort) in cache cascade; strongly consider skipping DHT for v1 and adding it when network is larger.

---

## Implications for Roadmap

Research produces a clear six-phase dependency graph. Each phase has hard prerequisites from the preceding phases. The ordering is not stylistic — it reflects the actual dependency structure of the system.

### Phase 1: Foundation
**Rationale:** The IPC bridge, Electron process architecture, and authenticated WebSocket connection to the server are prerequisites for every subsequent layer. Without the process model, libp2p cannot be placed. Without auth, channels have no access control. Without the IPC bridge pattern established, all P2P events have no path to the UI. These architectural decisions are expensive to change later (they require restructuring every IPC call site).
**Delivers:** Working Electron app shell (instant UI from app shell architecture); authenticated WebSocket connection to coordination server; typed contextBridge IPC bridge (request-response + push events pattern); local HTTP content server skeleton; SQLite schema with out-of-order-insert-capable message model; empty React UI scaffolding with virtualized list placeholders; Rust server with auth (Argon2id, JWT), WebSocket upgrade, channel CRUD, and actor-per-connection pattern.
**Addresses:** User auth, invite links, server management structure.
**Avoids:** IPC bridge bottleneck (Pitfall 10), Electron memory leak (Pitfall 7), single-process architecture becoming technical debt.
**Stack elements:** Rust/tokio/axum, Electron/electron-vite, React/TypeScript, better-sqlite3, contextBridge/ipcMain, @tanstack/react-virtual.
**Research flag:** SKIP — well-documented patterns for Electron + Rust auth.

### Phase 2: P2P Core
**Rationale:** Text message delivery via gossipsub validates the entire P2P architecture before adding content complexity. Peer discovery and NAT traversal must be proven with real-world connection testing before any feature depends on P2P connectivity. Gossipsub parameter tuning must be established now because changing gossip topology later requires network-wide upgrades.
**Delivers:** js-libp2p node in main process (WebRTC transport, WebSocket transport to server); gossipsub pub/sub with topic-per-channel mapping; NAT traversal (AutoNAT, DCUtR hole-punching, Circuit Relay v2 via server); Kademlia DHT bootstrapped from server (used as L3 only, not primary); server acting as bootstrap node, relay node, and gossipsub router; two clients discovering each other and gossiping text messages.
**Addresses:** Text channel delivery (real-time), typing indicators, presence heartbeats (separate ephemeral topics).
**Avoids:** NAT traversal failure cascade (Pitfall 1), gossipsub storm (Pitfall 2), message ordering divergence (Pitfall 3), DHT cold-start (Pitfall 8).
**Stack elements:** libp2p 3.1.3 (JS) + 0.56.0 (Rust), @libp2p/webrtc, @libp2p/circuit-relay-v2, @libp2p/autonat, gossipsub with D=3-4 for chat topics, server Circuit Relay v2.
**Research flag:** RESEARCH-PHASE recommended — libp2p 3.x API specifics, gossipsub parameter tuning for chat workloads, ICE configuration for current Electron version.

### Phase 3: Chat Core
**Rationale:** Text-only chat without media validates the complete message pipeline (send → gossip → server ordering → reconcile → display) before adding content distribution complexity. Message signing, ordering reconciliation, SQLite persistence, and the React message components must all work correctly at this phase. The encryption architecture must be designed and implemented for DMs before any user has message history (changing crypto protocols backward-compatibly is extremely difficult).
**Delivers:** Complete text chat (message creation, Ed25519 signing, gossip publication, server_seq assignment, optimistic display with server reconciliation); message persistence in SQLite with efficient out-of-order insert; React message components (virtualized, markdown rendering, reactions, @mentions, timestamps); DM encryption (X25519 key exchange, prekey system with 100 one-time keys per user, Megolm-style sender ratchet for group DMs); roles + permissions enforced on server and client; kick/ban with propagation to peers; unread indicators and desktop notifications.
**Addresses:** All P1 text messaging table stakes, DM encryption, roles/permissions, moderation.
**Avoids:** Message ordering divergence (Pitfall 3), E2E encryption key complexity (Pitfall 4), gossip storm via inline-only-under-50KB rule.
**Stack elements:** Ed25519-dalek 2.2.0, X25519-dalek 2.0.1, sodium-native (prekey system), @bufbuild/protobuf + msgpackr for message envelopes, zustand for message state, @tanstack/react-virtual for message list.
**Research flag:** RESEARCH-PHASE recommended — prekey protocol implementation specifics, js-libp2p current request-response API for key distribution.

### Phase 4: Content Distribution
**Rationale:** The P2P block pipeline (chunking, content addressing, cache cascade, peer fetching, server fallback) is the most technically complex feature and the make-or-break UX differentiator. It must be proven with realistic peer churn (80% of peers offline) before voice and polish features are added on top. Blurhash placeholders and parallel peer fetching transform P2P from "feels slow" to "feels fast."
**Delivers:** Content-addressed block store (256KB chunks, 2-char hex prefix dirs, XChaCha20-Poly1305 at-rest encryption with device key); 5-layer cache cascade (L0 memory LRU → L1 SQLite+files → L2 hot peers parallel → L3 DHT → L4 server fallback); server content index (hash-to-peer mapping) + fallback encrypted block store; file and image upload with blurhash placeholder generation; manifest blocks for multi-chunk content; eager replication (upload pushes to 3 peers + server immediately); content health monitoring (replication factor tracking); configurable storage buffer UI; seeding indicators; local HTTP content server for binary serving to renderer.
**Addresses:** File/image sharing, inline media display, message history scrollback, predictive prefetching (initial), volunteer super-seeders (initial), peer status dashboard.
**Avoids:** Content availability collapse (Pitfall 6), gossip storm via block-ref-only gossip for content >50KB.
**Stack elements:** BLAKE3 1.8.3 for block hashing, XChaCha20-Poly1305 (sodium-native) for at-rest encryption, @libp2p/kad-dht for L3, axum fallback store endpoint, blurhash 2.0, local HTTP content server.
**Research flag:** RESEARCH-PHASE recommended — verify js-libp2p request-response protocol for block transfer, verify BLAKE3 crate current API, test parallel peer fetching with real-world network conditions.

### Phase 5: Voice
**Rationale:** Voice requires the signaling infrastructure from Phase 1, the P2P connection layer from Phase 2, and a stable server before being added. It is architecturally independent of content distribution (Phase 4) but benefits from a stable platform to build on. Voice uses separate PeerConnections from libp2p DataChannels — coupling them would disrupt data plane connectivity on voice join/leave.
**Delivers:** Voice channel join/leave with server-tracked participant lists; separate WebRTC PeerConnections per participant (not libp2p-managed); SDP/ICE exchange via server control WebSocket; audio pipeline (getUserMedia → AudioContext gain/noise gate → addTrack to each PeerConnection); mute/deafen controls (local track enable/disable); voice activity indicators (WebRTC audio level detection); hard cap at 10-12 participants with warning at 8+; voice channel UI with participant list.
**Addresses:** Voice channels, mute/deafen, voice activity indicator, push-to-talk (defer to v1.x).
**Avoids:** Voice mesh scaling failure at >12 participants (Pitfall: O(n^2) connections); lifecycle coupling with libp2p data plane.
**Stack elements:** Chromium built-in WebRTC (no external library), RTCPeerConnection API in main process via Node.js globals, server voice session tracking in Rust.
**Research flag:** RESEARCH-PHASE recommended — verify current RTCPeerConnection behavior in Electron 40 main process, ICE restart handling for voice channel robustness.

### Phase 6: Polish and v1.x Features
**Rationale:** Polish features are additive and do not block the core product. They are best built after the core loop is validated with real users. This phase converts the v1.0 release into a complete product.
**Delivers:** Threads (sub-gossip streams linked to parent message hash); message editing/deletion (new envelope with edit reference; tombstone events with peer propagation); pinned messages with TTL bypass; link previews (privacy proxy approach); full-text search on local SQLite FTS5 index; channel categories (metadata only); key verification (safety numbers / QR code); predictive prefetching enhancement (hover-prefetch, scroll-ahead, app-launch prefetch); group DMs; screen sharing (small groups, separate PeerConnection track); channel audit log; custom emoji with per-server storage budgets.
**Addresses:** All P2 (v1.x) features.
**Avoids:** Discord API scope creep (Pitfall 5) — bot API remains explicitly deferred to v2+.
**Stack elements:** SQLite FTS5, libp2p request-response for custom prefetch signals, React Suspense for deferred content.
**Research flag:** SKIP for most items (standard patterns). RESEARCH-PHASE for predictive prefetching implementation specifics.

### Phase Ordering Rationale

- **Auth before P2P**: Channel subscriptions require knowing who the user is. Unauthenticated gossip creates peer identity problems.
- **P2P Core before Chat Core**: Message envelopes must flow through gossipsub before the chat UI can display them. The gossipsub parameter tuning and NAT traversal must be proven with basic message flow before adding crypto complexity.
- **Chat Core before Content Distribution**: Text chat validates the gossip → server ordering → client reconciliation pipeline at low complexity. Adding binary block transfers before this pipeline is solid creates compound debugging challenges.
- **Content Distribution before Voice**: The content server, block pipeline, and peer-to-peer data protocols must be stable before adding a second major data path (voice). Voice uses the server signaling infrastructure built in Phase 1 and P2P connections from Phase 2 but does not depend on the block pipeline.
- **Voice before Polish**: Voice channels are a table-stakes P1 feature with higher complexity than polish items. Polish features are additive and do not create architectural dependencies.
- **Discord API deferred indefinitely**: Not a Phase 6 item. UNITED-native bot API is earliest Phase 4+. Discord compatibility shim is v2+ only with hard scope cap (max 3-5 target bots, not general compatibility).

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (P2P Core):** libp2p 3.x API has breaking changes between minors; gossipsub parameter tuning for chat workload needs empirical validation; ICE/TURN configuration for Electron 40 needs verification.
- **Phase 3 (Chat Core):** Prekey system implementation in sodium-native; js-libp2p request-response current API for key distribution; DM encryption state machine edge cases.
- **Phase 4 (Content Distribution):** js-libp2p request-response for block transfer protocol; parallel peer fetching implementation; BLAKE3 integration with content addressing.
- **Phase 5 (Voice):** RTCPeerConnection in Electron 40 main process (verify native API availability); ICE restart semantics for voice reconnection.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Electron + Rust auth + axum are extremely well-documented; IPC bridge patterns are stable.
- **Phase 6 (Polish):** SQLite FTS5, React Suspense, and gossipsub sub-streams are well-understood patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified via live crates.io and npm registry queries on 2026-02-22. Interop confidence is HIGH for core protocols (noise, yamux, gossipsub, kad) — spec-defined, not implementation-specific. MEDIUM for relay/dcutr (fewer cross-implementation deployments documented). |
| Features | MEDIUM | Reference product feature sets are well-established (most 5+ years old). Keet and Revolt are actively developed; some features may have changed. Cannot verify against live product pages. |
| Architecture | MEDIUM | Patterns for libp2p, Electron, Rust/tokio, and content-addressed storage are well-established. Specific API details (js-libp2p 3.x current API, Electron 40 MessagePort behavior, Axum 0.8 extractors) require validation against current docs during Phase 2+ implementation. |
| Pitfalls | MEDIUM | Structural and architectural pitfalls documented here are domain-stable (P2P NAT traversal, gossipsub tuning, E2E key management, Electron memory). These do not change rapidly. Library-specific pitfalls (sodium-native rebuild, libp2p version pinning) were verified against current npm/cargo. |

**Overall confidence:** MEDIUM — sufficient to begin Phase 1 and structure the roadmap with confidence. Phase 2+ will require research-phase validation of specific API details.

### Gaps to Address

- **libp2p 3.x breaking changes**: JS libp2p versions break between minors frequently. Before Phase 2, validate that 3.1.3 supports the exact API used in the architecture docs (especially gossipsub topic management and WebRTC DataChannel transport creation). Use `npm view libp2p@3.1.3` to inspect package.
- **Electron 40 + node-datachannel compatibility**: `@libp2p/webrtc` depends on `node-datachannel` 0.32.1 (native addon). Confirm this rebuilds correctly under Electron 40's Node.js version (approximately Node 22). Run `electron-rebuild` as an early build system smoke test.
- **TURN server economics**: TURN relay for 20-30% of connections has real bandwidth costs. Estimate bandwidth cost per user per day and design self-hosting docs accordingly. Consider Tailscale or Nebula as mesh overlay alternatives for teams that control their network.
- **Prekey depletion UX**: Signal-style prekey bundles require replenishment logic. Define the client behavior when fewer than 20 prekeys remain — silent background replenishment requires the client to be online. Document the "last resort prekey" fallback behavior.
- **Keet and Revolt current feature parity**: These products are in active development. Before finalizing v1.x feature priorities, verify their current feature sets to ensure UNITED's differentiators are still differentiated.

---

## Sources

### Primary (HIGH confidence)
- **crates.io API** (live query 2026-02-22): libp2p 0.56.0, tokio 1.49.0, axum 0.8.8, rusqlite 0.38.0, ed25519-dalek 2.2.0, x25519-dalek 2.0.1, aes-gcm 0.10.3, argon2 0.5.3, blake3 1.8.3, serde 1.0.228
- **npm registry** (live query 2026-02-22): libp2p 3.1.3, electron 40.6.0, sodium-native 5.0.10, better-sqlite3 12.6.2, react 19.2.4, vite 7.3.1, typescript 5.9.3
- **libp2p gossipsub v1.1 specification**: https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md — mesh parameters, scoring, IHAVE/IWANT mechanics
- **Lamport (1978)**: "Time, Clocks, and the Ordering of Events in a Distributed System" — ordering strategy rationale

### Secondary (MEDIUM confidence)
- Training data: Discord, Element/Matrix, Briar, Mumble, TeamSpeak feature sets — mature products, minimal change risk
- Training data: Electron security model, contextBridge/ipcMain patterns — official docs patterns, stable
- Training data: Axum, tokio ecosystem patterns — well-established, low change risk
- Training data: IPFS/BitTorrent content-addressed storage patterns — foundational P2P knowledge
- Training data: Signal Protocol / Megolm design for group E2E encryption

### Tertiary (LOW confidence — validate during implementation)
- Training data: Keet and Revolt current feature sets — active development, likely evolved since training cutoff
- Training data: WebRTC mesh scaling limits — empirically measured in various open-source projects; validate against current Electron 40 + Chromium 132 WebRTC behavior
- Training data: sodium-native 5.x Electron rebuild behavior — verify against current @electron/rebuild 4.0.3

---
*Research completed: 2026-02-22*
*Ready for roadmap: yes*
