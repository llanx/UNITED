# UNITED — Unified Network for Independent, Trusted, Encrypted Dialogue

## What This Is

A self-hosted Discord alternative where voice is peer-to-peer via WebRTC and all chat content (messages, images, video, files) is distributed across users via a torrent-inspired seeding architecture with McMaster-Carr-style predictive prefetching. The coordination server is intentionally thin — handling only auth, signaling, and content indexing — while the actual content is stored and distributed peer-to-peer across participating peers, each contributing a configurable storage buffer. Targets general audiences seeking data sovereignty without sacrificing the polished experience of centralized platforms.

## Core Value

Users communicate in real-time with full data sovereignty — no third party ever touches their content, and the community funds its own infrastructure by participating in it.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**P2P Chat Core:**
- [ ] Text channels with real-time gossip-based message delivery (<100ms)
- [ ] Voice channels using WebRTC peer-to-peer (no media server)
- [ ] Image/video/file sharing as content-addressed chunks across the swarm
- [ ] Threads within channels for focused conversations
- [ ] Direct messages with end-to-end encryption (X25519 key exchange)
- [ ] Group DMs with encrypted blobs for offline delivery
- [ ] Reactions and embeds (link previews, rich content)
- [ ] User presence and typing indicators via lightweight gossip

**P2P Distribution Layer:**
- [ ] Content-addressed block storage (SHA-256 hashed, fixed-size blocks)
- [ ] Gossip-based message propagation to channel peers
- [ ] Multi-layer cache cascade (L0 in-memory → L1 local SQLite/blocks → L2 hot peers → L3 DHT/swarm → L4 server fallback)
- [ ] McMaster-Carr-style predictive prefetching (hover, scroll-ahead, app launch)
- [ ] App shell architecture (UI loads once, channel switches are DOM swaps)
- [ ] Parallel peer fetching (first-responder-wins, byte-range splitting)
- [ ] Inline critical content (<50KB message+thumbnail gossiped immediately)
- [ ] Fixed layout with blurhash placeholders (zero reflow)
- [ ] Configurable storage buffer (N GB per user)
- [ ] Tiered content retention (P1 own/pinned → P2 hot 24h → P3 warm 2-7d → P4 altruistic seeding)

**Server & Trust:**
- [ ] Thin coordination server (auth, signaling, content index, message ordering)
- [ ] Server as fallback super-seeder (encrypted block store)
- [ ] Volunteer super-seeders (opt-in always-on nodes with larger storage, cosmetic rewards)
- [ ] Server-admin moderation tools (kick, ban, delete messages) — no platform-level moderation
- [ ] User-pinnable content (persist beyond 7-day TTL)

**Discord Parity:**
- [ ] Discord-compatible bot API (subset — gateway events, message CRUD, embeds)
- [ ] Server discovery and invite links (tokens, peer bootstrapping)
- [ ] Notification system (mentions, DM alerts, unread indicators via gossip)
- [ ] Roles and permissions managed by coordination server, enforced by peers

**Security:**
- [ ] Channel messages signed by author (Ed25519), cleartext in transit over encrypted transport, encrypted at rest (AES-256-GCM)
- [ ] DMs end-to-end encrypted (per-conversation X25519 keys)
- [ ] Local block store encrypted with user-derived key (Argon2id KDF)
- [ ] Strict CSP, content sanitization, contextIsolation enabled, nodeIntegration disabled in renderer

### Out of Scope

- Mobile clients — desktop-only at launch; mobile P2P has severe OS restrictions (battery, background limits)
- Server federation — each coordination server is an isolated island for v1
- OAuth/social login — email/password sufficient; adds dependency on external providers
- Platform-level content moderation — sovereignty model delegates moderation to server admins
- SFU for large voice channels — WebRTC mesh for v1; SFU deferred until scale demands it (20+ participants)

## Context

**Motivation (three converging forces):**

1. **Data sovereignty.** Centralized platforms (Discord, Slack) own user data, govern it under their ToS, and can moderate, mine, or lose it. A self-hosted platform where content lives on users' machines eliminates third-party control.

2. **Cost distribution.** Hosting media-heavy chat is expensive. By distributing storage and bandwidth across participating users, the central server can run on hardware as modest as a Raspberry Pi. The community funds its own infrastructure by participating.

3. **Technical ambition.** The intersection of P2P content distribution, real-time chat, predictive prefetching, and swarm replication is a compelling engineering challenge. Techniques from BitTorrent, IPFS, and McMaster-Carr's caching philosophy haven't been combined for chat before.

**Inspiration & Prior Art:**
- **Keet** (Holepunch) — P2P chat on Hypercore/Hyperswarm, proves append-only-log-per-channel works
- **McMaster-Carr** — predictive prefetching, multi-layer caching, app shell architecture, zero-reflow layout
- **Matrix/Element** — federated chat with server replication (stores full copies, not P2P distributed)
- **BitTorrent** — content-addressed pieces, rarest-first selection, swarm replication
- **IPFS/libp2p** — content-addressed storage, gossipsub, DHT peer discovery
- **Briar** — P2P encrypted messaging over Tor
- **RetroShare** — friend-to-friend encrypted network with chat/forums/file sharing

**Encryption Model:**
- Channels: cleartext-in-transit (over TLS/DTLS), encrypted-at-rest per peer
- DMs: end-to-end encrypted (only participants hold keys)
- Stolen hardware yields only encrypted blobs
- Coordination server cannot read DMs

## Constraints

- **Tech Stack (Server):** Rust — single binary deployment, minimal resources, excellent async I/O (tokio). Must run on Raspberry Pi 4 / cheap VPS.
- **Tech Stack (Client):** Electron + React — proven for desktop chat apps, native WebRTC, consistent rendering. contextIsolation enabled, nodeIntegration disabled.
- **Tech Stack (P2P Layer):** libp2p — gossipsub for message propagation, Kademlia DHT for peer/content discovery, rust-libp2p (server) + js-libp2p (client). Battle-tested at scale.
- **Tech Stack (Database):** SQLite — embedded, zero-config, fast. Message index, metadata, search, peer cache.
- **Tech Stack (Block Store):** Flat files, content-addressed (SHA-256 hash as filename, 2-char hex subdirectories). AES-256-GCM encrypted.
- **Tech Stack (Crypto):** libsodium (sodium-native for Node.js) — AES-256-GCM, X25519, Ed25519, Argon2id.
- **Tech Stack (Voice):** WebRTC native in Chromium — ICE/STUN/TURN signaled through coordination server.
- **Tech Stack (Transport):** WebSocket (server comms) + WebRTC DataChannels (peer-to-peer gossip and block transfer).
- **Deployment:** Docker container or standalone binary for server. Electron app for clients.
- **Target Audience:** General audience — must be polished and easy to set up, not just for power users.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| libp2p over Hypercore/custom WebRTC | gossipsub maps to gossip propagation, Kademlia DHT built-in, Rust + JS implementations, battle-tested at IPFS scale | — Pending |
| React over Svelte/Solid | Largest ecosystem for chat-like UIs, most component libraries, easiest to hire for. Bundle size irrelevant in Electron | — Pending |
| Server-admin moderation (not platform-level) | Sovereignty model — server owner is responsible for their community. No central authority inspects content. | — Pending |
| Desktop-only v1 (no mobile) | Mobile P2P has severe OS restrictions. Better to nail desktop experience first. | — Pending |
| No server federation in v1 | Each server is an isolated community. Federation adds enormous complexity (see Matrix). | — Pending |

## Open Questions

- **Voice channel scaling:** WebRTC P2P mesh works for 2-10 people but creates O(n^2) connections. At what point is an SFU needed? Could a peer volunteer as SFU like super-seeders?
- **Bot API scope:** "Discord-compatible" is enormous surface area. Which subset is realistic for v1? Gateway events + message CRUD + embeds?
- **NAT traversal reliability:** How often do peers need TURN relay vs. direct hole-punch? If most need TURN, the server becomes a bandwidth bottleneck.
- **Identity/account recovery:** User credentials derive the storage encryption key. Forgot password = lost data. Is there a recovery mechanism that doesn't compromise encryption?
- **Content pinning economics:** Pinned content bypasses 7-day TTL. What's the pin quota before storage budget overflows?

---
*Last updated: 2026-02-22 after initialization*
