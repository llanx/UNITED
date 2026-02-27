# UNITED — Unified Network for Independent, Trusted, Encrypted Dialogue

## What This Is

A self-hosted Discord alternative with peer-to-peer content distribution, WebRTC voice, and end-to-end encrypted DMs. The coordination server handles only auth, signaling, and content indexing while all chat content (messages, images, video, files) is stored and distributed across participating peers via a torrent-inspired seeding architecture with predictive prefetching. Desktop app (Electron + React) connects to a Rust coordination server with a full-featured chat experience: channels, categories, roles, moderation, invite-based onboarding, media sharing with inline rendering, and voice channels.

## Core Value

Users communicate in real-time with full data sovereignty — no third party ever touches their content, and the community funds its own infrastructure by participating in it.

## Requirements

### Validated

**v1.0 MVP — shipped 2026-02-27:**

*Text Messaging:*
- ✓ Real-time gossip-based message delivery — v1.0
- ✓ Message history with scroll-back and server fallback — v1.0
- ✓ Markdown formatting (bold, italic, code, quotes) — v1.0
- ✓ Emoji reactions — v1.0
- ✓ Typing indicators — v1.0
- ✓ Online/offline/away presence — v1.0
- ✓ Unread channel indicators — v1.0
- ✓ @mention notifications — v1.0
- ✓ Desktop notifications for mentions and DMs — v1.0

*Direct Messages:*
- ✓ E2E encrypted DMs with X25519 key exchange — v1.0
- ✓ Offline DM delivery via encrypted server blobs — v1.0
- ✓ Separate DM conversation list — v1.0

*Media:*
- ✓ File upload/sharing (images, video, documents) — v1.0
- ✓ Inline media rendering with blurhash placeholders — v1.0
- ✓ Zero-reflow layout with upfront dimensions — v1.0
- ✓ Content-addressed block distribution across swarm — v1.0

*Voice:*
- ✓ WebRTC P2P voice (2-8 participants) — v1.0
- ✓ Mute/deafen — v1.0
- ✓ Speaking indicators — v1.0
- ✓ Push-to-talk — v1.0

*Server Management:*
- ✓ Channel/category CRUD — v1.0
- ✓ Roles with permission bitflags — v1.0
- ✓ Kick/ban moderation — v1.0
- ✓ Invite links with expiration — v1.0
- ✓ Server settings (name, description) — v1.0 (icon upload deferred)

*P2P Distribution:*
- ✓ Content-addressed block storage (SHA-256) — v1.0
- ✓ Gossipsub message propagation — v1.0
- ✓ 5-layer cache cascade (memory → local → peers → DHT → server) — v1.0
- ✓ Predictive prefetching (hover, scroll, app launch) — v1.0
- ✓ Parallel peer fetching (first-responder-wins) — v1.0
- ✓ Inline critical content (<50KB gossiped immediately) — v1.0
- ✓ Tiered retention with LRU eviction — v1.0
- ✓ Configurable storage buffer — v1.0
- ✓ Seeding/contribution stats dashboard — v1.0

*Security:*
- ✓ Ed25519 keypair identity with BIP39 mnemonic — v1.0
- ✓ Challenge-response auth with JWT sessions — v1.0
- ✓ Message signing (Ed25519) — v1.0
- ✓ AES-256-GCM at-rest encryption — v1.0
- ✓ X25519 DM encryption — v1.0
- ✓ Encrypted P2P transport (TLS/DTLS) — v1.0
- ✓ Encryption indicators in UI — v1.0
- ✓ Strict CSP, contextIsolation, nodeIntegration disabled — v1.0
- ✓ Identity blob recovery from any joined server — v1.0
- ✓ TOTP 2FA enabled by default — v1.0
- ✓ Key rotation with 72h cancellation — v1.0
- ✓ Device provisioning via QR code — v1.0

*Client App:*
- ✓ App shell with instant channel switching — v1.0
- ✓ Persistent P2P connections across navigation — v1.0
- ✓ Simultaneous channel gossip subscriptions — v1.0
- ✓ Fixed layout with zero reflow — v1.0
- ✓ User profiles (name, avatar, status) — v1.0

### Active

*v2 candidates (not yet scoped):*
- [ ] Threads within channel messages
- [ ] Message edit/delete propagation
- [ ] Pinned messages (persist beyond TTL)
- [ ] Full-text search via SQLite FTS
- [ ] Link preview embeds
- [ ] Screen sharing in voice channels
- [ ] Voice noise suppression
- [ ] Group DMs (multi-party E2E)
- [ ] Server icon upload
- [ ] Bot API (gateway events, message CRUD)
- [ ] Server discovery directory
- [ ] Channel-level permission overrides
- [ ] Audit log for admin actions

### Out of Scope

- Mobile clients — desktop-only; mobile P2P has severe OS restrictions (battery, background limits). PWA not viable for P2P.
- Server federation — each coordination server is an isolated island. Federation adds enormous complexity (see Matrix).
- OAuth/social login — keypair-based identity eliminates need for external auth providers entirely.
- Email/password registration — replaced by Ed25519 keypair identity with passphrase-encrypted local storage.
- Platform-level content moderation — sovereignty model delegates moderation to server admins.
- SFU for large voice — WebRTC mesh works for 2-8; SFU deferred until demand for 20+ participants.
- Video channels / Go Live streaming — P2P video to many viewers is unsolved at scale.
- Rich presence / activity status — deep OS integration for cosmetic feature, low value.
- Automatic message translation — requires sending content to external APIs, privacy violation.
- AI features — requires sending content to LLM APIs, privacy violation.

## Context

**Shipped v1.0 MVP** with ~42,000 LOC across TypeScript (17k TS + 12k TSX) and Rust (13k), 243 source files, 14 protobuf schemas, 270 commits over 5 days.

**Tech stack:** Electron 40 + React 19 + Zustand 5 (client), Rust + tokio + axum + SQLite (server), js-libp2p + rust-libp2p (P2P mesh), sodium-native (crypto), WebRTC (voice).

**Architecture:**
- Server: single Rust binary on port 1984 (HTTP) + 1985 (libp2p WS). SQLite + flat block files. Docker deployment with coturn sidecar for TURN.
- Client: Electron with contextBridge IPC, Zustand slice composition (14 stores), HashRouter, Discord-style triple-column layout.
- P2P: gossipsub D=4 for chat, custom block exchange protocol over libp2p streams, Circuit Relay v2 for NAT traversal.

**Known tech debt (9 items):** Icon upload, REST message signing, ephemeral DM delete, block verification on read, toast for voice cap, key rotation cancel UI, dead code (ws/protocol.ts stubs, useAuth.ts export). See MILESTONES.md for full list.

**Human verification backlog:** 47 items across all phases (multi-client testing, real-time feature round-trips). All automated checks pass.

## Constraints

- **Server:** Rust (tokio/axum), SQLite, single binary. Must run on Raspberry Pi 4 / cheap VPS.
- **Client:** Electron + React, contextIsolation enabled, nodeIntegration disabled.
- **P2P:** libp2p — gossipsub + Kademlia DHT. rust-libp2p (server) + js-libp2p (client).
- **Database:** SQLite — embedded, zero-config.
- **Block Store:** Flat files, content-addressed (SHA-256, 2-char hex subdirs), AES-256-GCM encrypted.
- **Crypto:** libsodium (sodium-native) — XChaCha20-Poly1305 (client at-rest), AES-256-GCM (server blocks), X25519, Ed25519, Argon2id.
- **Voice:** WebRTC native in Chromium, ICE/STUN/TURN via coordination server.
- **Transport:** WebSocket (server comms) + WebRTC DataChannels (peer-to-peer).
- **Deployment:** Docker container or standalone binary for server. Electron app for clients.
- **Target Audience:** General audience — polished UX, not just for power users.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| libp2p over Hypercore/custom WebRTC | gossipsub maps to chat, Kademlia DHT built-in, Rust + JS implementations | ✓ Good — gossipsub D=4 tuning works well for chat |
| React over Svelte/Solid | Largest ecosystem, component libraries, bundle size irrelevant in Electron | ✓ Good — React 19 + Zustand 5 very productive |
| Server-admin moderation (not platform-level) | Sovereignty model — server owner moderates their community | ✓ Good — clean separation of concerns |
| Desktop-only v1 (no mobile) | Mobile P2P has severe OS restrictions | ✓ Good — focused scope, complete feature set |
| No server federation in v1 | Enormous complexity (see Matrix) | ✓ Good — kept scope achievable |
| REST as primary message path | Simpler than gossip-first for single-server | ✓ Good — reliable, gossip for propagation |
| Ed25519 keypair identity (no email/password) | True data sovereignty, no server-stored credentials | ✓ Good — challenge-response auth works cleanly |
| XChaCha20-Poly1305 for client encryption | More portable than AES-GCM, no AES-NI dependency | ✓ Good — 24-byte nonces, no hardware requirements |
| Protobuf for all wire formats | Cross-language type safety, compact binary | ✓ Good — prost + @bufbuild/protobuf seamless |
| Actor-per-connection WebSocket | Each connection gets isolated state, clean cleanup | ✓ Good — DashMap-backed shared state works well |
| Zustand slice composition (14 stores) | Granular reactivity, no Redux boilerplate | ✓ Good — hydration from SQLite works cleanly |
| Gossipsub D=4 (not default D=6) | Chat has lower propagation needs than blockchain | ✓ Good — reduced connection overhead |
| Circuit Relay v2 for NAT traversal | Built into libp2p, server-hosted relay node | ⚠️ Revisit — needs real-world NAT testing |
| 7-day default TTL with LRU eviction | Balance storage vs. availability | — Pending real-world usage data |

## Open Questions

- **Voice channel scaling:** WebRTC mesh creates O(n^2) connections. SFU needed at ~10+ participants?
- **NAT traversal reliability:** How often do peers need TURN relay vs. direct hole-punch in practice?
- **Content pinning economics:** Pin quota vs. storage budget overflow?
- **Bot API scope:** Which subset is realistic for v2? Gateway events + message CRUD + embeds?
- ~~**Identity/account recovery:**~~ **RESOLVED** — Three-tier recovery: BIP39 mnemonic, encrypted blob on servers, device-to-device QR.

---
*Last updated: 2026-02-27 after v1.0 milestone*
