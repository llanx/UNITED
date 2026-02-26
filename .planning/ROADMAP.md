# Roadmap: U.N.I.T.E.D.

## Overview

UNITED delivers a self-hosted Discord alternative where all content is distributed peer-to-peer and voice is WebRTC mesh. The build order follows the system's dependency graph: a working Electron+Rust foundation first, then server structure, then the P2P networking mesh, then text chat on top of gossipsub, then encrypted DMs, then the content-addressed block pipeline for media distribution, then the user-facing media experience and prefetching, and finally voice channels. Each phase delivers a complete, verifiable capability that the next phase builds upon.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Electron app shell, Rust coordination server, authentication, IPC bridge, and build pipeline
- [x] **Phase 2: Server Management** - Channel/category CRUD, roles and permissions, moderation, and invite-based onboarding
- [x] **Phase 3: P2P Networking** - libp2p mesh with gossipsub, NAT traversal, encrypted transport, and persistent peer connections
- [x] **Phase 4: Real-Time Chat** - Complete text messaging pipeline with signing, formatting, reactions, presence, and notifications
- [ ] **Phase 5: Direct Messages** - End-to-end encrypted DMs with offline delivery and encryption indicators
- [ ] **Phase 6: Content Distribution** - Content-addressed block store, 5-layer cache cascade, tiered retention, and server fallback
- [ ] **Phase 7: Media and Prefetching** - File/image/video sharing, inline rendering, blurhash placeholders, and predictive prefetching
- [ ] **Phase 8: Voice Channels** - WebRTC peer-to-peer voice with mute/deafen, speaking indicators, and push-to-talk

## Phase Details

### Phase 1: Foundation
**Goal**: Users can create a self-sovereign identity, authenticate to a self-hosted coordination server, and see a working desktop application that loads instantly
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-08, SEC-09, SEC-10, SEC-11, APP-01, SRVR-07
**Identity Architecture**: See [IDENTITY-ARCHITECTURE.md](IDENTITY-ARCHITECTURE.md) for full design
**Success Criteria** (what must be TRUE):
  1. User can create an Ed25519 keypair identity protected by a passphrase, with a 24-word mnemonic backup displayed at creation
  2. User can authenticate to the coordination server via challenge-response signature and receive JWT session tokens
  3. User's encrypted identity blob is stored on the server, and a new device can recover the identity by providing the correct passphrase
  4. TOTP two-factor authentication is enabled by default and users can enroll via standard authenticator apps
  5. App shell loads from local cache and the UI appears instantly without a loading spinner on subsequent launches
  6. Server admin can set the server name, icon, and description and these appear in the client
  7. Electron renderer runs with contextIsolation enabled, nodeIntegration disabled, and strict CSP enforced
  8. IPC bridge between main process and renderer is operational with typed request-response and push event patterns
**Plans**: 6/6 completed

Plans:
- [x] 01-01: Shared contracts and monorepo scaffold (Wave 1, both devs)
- [x] 01-02: Server core — config, SQLite, challenge-response auth, JWT, settings (Wave 2, matts)
- [x] 01-03: Server advanced auth — TOTP, identity blobs, key rotation, WebSocket, Docker (Wave 3, matts)
- [x] 01-04: Client infrastructure — Electron security, IPC bridge, SQLite, WebSocket client (Wave 2, benzybones)
- [x] 01-05: Client UI — React app shell, Zustand stores, Discord-style layout, components (Wave 2, benzybones)
- [x] 01-06: Client identity creation, auth flows, TOTP, server settings (Wave 3, benzybones)

### Phase 2: Server Management
**Goal**: Server admins can fully structure their community with channels, categories, roles, and permissions, and new users can join via invite links
**Depends on**: Phase 1
**Requirements**: SRVR-01, SRVR-02, SRVR-03, SRVR-04, SRVR-05, SRVR-06, SRVR-08, SRVR-09, SEC-12
**Success Criteria** (what must be TRUE):
  1. Server admin can create, rename, and delete text and voice channels organized into named categories
  2. Server admin can create roles with specific permissions (send messages, manage channels, kick/ban, admin) and assign them to users
  3. Server admin can kick and ban users, with bans propagated so banned users cannot rejoin or have their content relayed
  4. Server admin can generate invite links with optional expiration, and new users can join via those links
  5. A newly joined user sees the channel list, category structure, and their assigned permissions immediately
**Plans**: 8 plans

Plans:
- [x] 02-01: Schema migration, permission bitflags, protobuf definitions, and route scaffold (Wave 1, server)
- [x] 02-02: Channel/category CRUD, starter template, reordering, and WS events (Wave 2, server, TDD)
- [x] 02-03: Roles CRUD, assignment, permission guard, and auto-assign @everyone (Wave 2, server, TDD)
- [x] 02-04: Moderation (kick/ban) and invites (generate, join, landing page) (Wave 3, server, TDD)
- [x] 02-05: SEC-12 device provisioning via QR code (Wave 1, client, independent)
- [x] 02-06: Client UI — channel sidebar with categories, admin management panels (Wave 3, client)
- [x] 02-07: Client onboarding — invite join flow, routing to #general, welcome overlay (Wave 3, client)
- [x] 02-08: Gap closure — member list endpoint and role assignment UI (Wave 1, full-stack)

### Phase 3: P2P Networking
**Goal**: Peers discover each other and exchange messages over encrypted connections through a libp2p mesh, with NAT traversal ensuring connectivity across network configurations
**Depends on**: Phase 2
**Requirements**: P2P-02, SEC-06, APP-02
**Success Criteria** (what must be TRUE):
  1. Two clients on different networks can discover each other via the coordination server and establish a direct or relayed connection
  2. Messages published to a gossipsub topic arrive at all subscribed peers within 100ms on a local network
  3. All peer-to-peer communication is encrypted in transit (TLS for WebSocket to server, DTLS for WebRTC DataChannels between peers)
  4. P2P connections persist when the user switches between channels — no reconnection or re-handshake occurs on navigation
**Plans**: 4 plans (3 complete, 1 gap closure)

Plans:
- [x] 03-01: Server libp2p node — gossipsub, relay, peer directory, message persistence (Wave 1, server)
- [x] 03-02: Client libp2p node — WebSocket + WebRTC transports, gossipsub, discovery (Wave 2, client)
- [x] 03-03: Dev panel — P2P stats IPC pipeline, floating overlay with peer/topic debug info (Wave 3, client)
- [x] 03-04: Gap closure — fix scheduleReconnect to dial disconnected remote peer (Wave 1, client)

### Phase 4: Real-Time Chat
**Goal**: Users can have real-time text conversations in channels with the full range of messaging features expected from a modern chat application
**Depends on**: Phase 3
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06, MSG-07, MSG-08, MSG-09, SEC-03, APP-03, APP-05
**Success Criteria** (what must be TRUE):
  1. User can send a text message and all connected peers in the channel see it appear in real-time with correct server-assigned ordering
  2. User can scroll back through message history, loading older messages from peers or server fallback, with messages rendered in a virtualized list
  3. User can format messages with markdown, react with emoji, and @mention users or roles — and recipients see these rendered correctly
  4. User can see who is online/offline/away, see typing indicators in the current channel, and see unread indicators on channels with new messages
  5. User receives desktop notifications for @mentions and can see other users' profiles (name, avatar, status) in the message list
**Plans**: 6 plans (5 complete, 1 gap closure)

Plans:
- [x] 04-01: Server chat infrastructure — proto schemas, DB migration, REST endpoints, WS broadcast (Wave 1, server)
- [x] 04-02: Client data layer — npm deps, IPC handlers, Zustand stores, WS event forwarding (Wave 1, client)
- [x] 04-03: Core chat UI — virtualized message list, markdown rendering, composer, hover toolbar (Wave 2, full-stack)
- [x] 04-04: Presence and member list — server presence tracking, member sidebar, profile popups (Wave 2, full-stack)
- [x] 04-05: Rich features — emoji reactions, @mention autocomplete, unread badges, desktop notifications (Wave 3, client)
- [x] 04-06: Gap closure — fix presence key mismatch and message ID consistency (Wave 1, full-stack)

### Phase 5: Direct Messages
**Goal**: Users can have private one-on-one conversations where only the participants can read the messages, even if the coordination server is compromised
**Depends on**: Phase 4
**Requirements**: DM-01, DM-02, DM-03, SEC-05, SEC-07
**Success Criteria** (what must be TRUE):
  1. User can send and receive direct messages that are end-to-end encrypted with X25519 key exchange — the server stores only encrypted blobs it cannot decrypt
  2. User can receive DMs sent while they were offline, delivered via encrypted blobs stored on the coordination server
  3. User can see DM conversations listed separately from channel messages in a dedicated DM section
  4. User can see encryption indicators in the UI confirming that DMs are end-to-end encrypted and channel messages are signed
**Plans**: 3

Plans:
- [x] 05-01: Server DM infrastructure — protobuf schemas, migration 5, REST endpoints, offline delivery, targeted WS push
- [x] 05-02: Client DM data layer — crypto module, IPC handlers, Zustand store, hooks, preload bridge
- [ ] 05-03: DM UI — conversation list, chat view, encryption indicators

### Phase 6: Content Distribution
**Goal**: Content is stored, replicated, and retrieved through a peer-to-peer block pipeline that makes the server optional for availability while keeping all local data encrypted at rest
**Depends on**: Phase 4
**Requirements**: P2P-01, P2P-03, P2P-05, P2P-06, P2P-09, P2P-10, SEC-04, APP-04
**Success Criteria** (what must be TRUE):
  1. All content is stored as content-addressed blocks (SHA-256 hashed) and the local block store is encrypted at rest with a user-derived AES-256-GCM key
  2. Content resolves through the 5-layer cache cascade: memory, local store, hot peers (parallel fetching), DHT/swarm, then server fallback — and the server maintains encrypted copies for availability
  3. Small content (<50KB messages and thumbnails) is inlined with gossip for instant rendering; larger content is referenced and pulled on demand
  4. Content is managed in priority tiers (own messages never evicted, hot/warm/altruistic tiers with 7-day default TTL and LRU eviction)
  5. Media attachments declare dimensions upfront and the layout is fixed — no reflow occurs while content loads from peers
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

### Phase 7: Media and Prefetching
**Goal**: Users can share and view rich media seamlessly, with the P2P distribution invisible behind fast loading and predictive prefetching
**Depends on**: Phase 6
**Requirements**: MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, P2P-04, P2P-07, P2P-08
**Success Criteria** (what must be TRUE):
  1. User can upload and share files (images, video, documents) in channels and DMs, with media chunked into content-addressed blocks and distributed across the peer swarm
  2. Images and videos render inline within messages — not as download links — with blurhash placeholders at exact aspect ratio shown while loading from peers
  3. User can configure their local storage buffer size and see seeding/contribution indicators showing upload/download stats and blocks seeded
  4. App prefetches content predictively: hovering the channel list begins pulling recent messages, scrolling near the bottom prefetches the next batch, and app launch pre-fetches top active channels
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD
- [ ] 07-03: TBD

### Phase 8: Voice Channels
**Goal**: Users can join voice channels and talk to each other with peer-to-peer audio that feels as responsive as centralized alternatives
**Depends on**: Phase 3
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04
**Success Criteria** (what must be TRUE):
  1. User can join a voice channel and communicate with 2-8 simultaneous participants via WebRTC peer-to-peer audio with no media server
  2. User can mute their microphone and deafen all incoming audio with immediate effect
  3. User can see a visual indicator showing which participant is currently speaking
  4. User can use push-to-talk as an alternative to voice activity detection
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

Note: Phase 8 (Voice) depends on Phase 3, not Phase 7. It could execute in parallel with Phases 5-7 if desired, but is sequenced last because voice is architecturally independent and benefits from a stable platform.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 6/6 | Complete | 2026-02-24 |
| 2. Server Management | 8/8 | Complete | 2026-02-25 |
| 3. P2P Networking | 4/4 | Complete | 2026-02-26 |
| 4. Real-Time Chat | 6/6 | Complete | 2026-02-26 |
| 5. Direct Messages | 2/3 | In Progress | - |
| 6. Content Distribution | 0/3 | Not started | - |
| 7. Media and Prefetching | 0/3 | Not started | - |
| 8. Voice Channels | 0/2 | Not started | - |
