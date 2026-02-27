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
- [x] **Phase 5: Direct Messages** - End-to-end encrypted DMs with offline delivery and encryption indicators (completed 2026-02-26)
- [x] **Phase 6: Content Distribution** - Content-addressed block store, 5-layer cache cascade, tiered retention, and server fallback (completed 2026-02-26)
- [x] **Phase 7: Media and Prefetching** - File/image/video sharing, inline rendering, blurhash placeholders, and predictive prefetching (completed 2026-02-26)
- [x] **Phase 8: Voice Channels** - WebRTC peer-to-peer voice with mute/deafen, speaking indicators, and push-to-talk
- [x] **Phase 9: Milestone Gap Closure** - Fix integration breaks (invite validation, voice identity), verify Electron security (SEC-08), and clean up traceability
- [ ] **Phase 10: Fix Media Attachment Wiring** - Parse block_refs in REST history and WS live paths so media attachments render in messages
- [ ] **Phase 11: Phase 1 Formal Verification** - Create missing Phase 1 VERIFICATION.md for 6 orphaned requirements (SEC-01, SEC-02, SEC-09, SEC-10, SEC-11, SRVR-07)

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
**Plans**: 4

Plans:
- [x] 05-01: Server DM infrastructure — protobuf schemas, migration 5, REST endpoints, offline delivery, targeted WS push
- [x] 05-02: Client DM data layer — crypto module, IPC handlers, Zustand store, hooks, preload bridge
- [x] 05-03: DM UI — conversation list, chat view, encryption indicators
- [x] 05-04: Gap closure — fix WS DM push events (regenerate protobuf types, rewrite dm-events.ts to use fromBinary)

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
**Plans**: 5 plans

Plans:
- [x] 06-01-PLAN.md — Server block store: protobuf schemas, migration 6, HKDF crypto, REST endpoints, retention purge
- [x] 06-02-PLAN.md — Client block store: types, crypto, file store, L0 cache, tiers, eviction, IPC bridge
- [x] 06-03-PLAN.md — Block exchange protocol and 5-layer cache cascade with parallel peer fetch
- [x] 06-04-PLAN.md — Gossip inline/deferred content, micro-thumbnails, content loading UI, storage settings
- [x] 06-05-PLAN.md — Gap closure: wire resolveBlock cascade to renderer via preload bridge

### Phase 7: Media and Prefetching
**Goal**: Users can share and view rich media seamlessly, with the P2P distribution invisible behind fast loading and predictive prefetching
**Depends on**: Phase 6
**Requirements**: MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, P2P-04, P2P-07, P2P-08
**Success Criteria** (what must be TRUE):
  1. User can upload and share files (images, video, documents) in channels and DMs, with media chunked into content-addressed blocks and distributed across the peer swarm
  2. Images and videos render inline within messages — not as download links — with blurhash placeholders at exact aspect ratio shown while loading from peers
  3. User can configure their local storage buffer size and see seeding/contribution indicators showing upload/download stats and blocks seeded
  4. App prefetches content predictively: hovering the channel list begins pulling recent messages, scrolling near the bottom prefetches the next batch, and app launch pre-fetches top active channels
**Plans**: 3 plans

Plans:
- [x] 07-01-PLAN.md — Upload infrastructure: protobuf extensions, server migration, blurhash encoding, video thumbnails, blocking send with progress (Wave 1)
- [x] 07-02-PLAN.md — Media rendering UI: inline images/videos, adaptive grid, lightbox, composer attachments, drag-drop/paste (Wave 2, depends on 07-01)
- [x] 07-03-PLAN.md — Seeding stats dashboard and predictive prefetching: channel hover, scroll position, app launch (Wave 2, depends on 07-01)

### Phase 8: Voice Channels
**Goal**: Users can join voice channels and talk to each other with peer-to-peer audio that feels as responsive as centralized alternatives
**Depends on**: Phase 3
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04
**Success Criteria** (what must be TRUE):
  1. User can join a voice channel and communicate with 2-8 simultaneous participants via WebRTC peer-to-peer audio with no media server
  2. User can mute their microphone and deafen all incoming audio with immediate effect
  3. User can see a visual indicator showing which participant is currently speaking
  4. User can use push-to-talk as an alternative to voice activity detection
**Plans**: 3 plans

Plans:
- [x] 08-01: Server voice signaling infrastructure — protobuf schemas, voice state, WS signaling relay, TURN credentials, migration 8 (Wave 1)
- [x] 08-02: Client voice engine — WebRTC VoiceManager, AudioPipeline, PTT via uiohook-napi, Zustand VoiceSlice, IPC bridge (Wave 2, depends on 08-01)
- [x] 08-03: Voice UI and deployment — VoiceBar, sidebar participants with speaking indicators, VoiceSettings, docker-compose with coturn (Wave 3, depends on 08-02)

### Phase 9: Milestone Gap Closure
**Goal**: Close all gaps identified by the v1.0 milestone audit — fix integration breaks, verify Electron security hardening, and update stale traceability
**Depends on**: Phase 8
**Requirements**: SEC-08, APP-01, SRVR-09 (fix), VOICE-01 (fix), VOICE-03 (fix)
**Gap Closure:** Closes gaps from v1.0-MILESTONE-AUDIT.md
**Success Criteria** (what must be TRUE):
  1. User can enter an invite code, see it validated as valid, and join the server successfully (invite route fixed)
  2. Voice channel correctly identifies the local user — self-participant is excluded from WebRTC peer connections and speaking detection shows the right user
  3. Electron renderer runs with strict CSP enforced, contextIsolation enabled, and nodeIntegration disabled (verified, not just assumed)
  4. Channel switches are instant DOM swaps with no full page reload (verified as architectural truth of React SPA)
  5. REQUIREMENTS.md traceability table has no stale entries — SEC-12 reflects Phase 2 Complete
**Plans**: 4 plans (1 wave, all independent)

Plans:
- [x] 09-01-PLAN.md — Fix invite validation: add GET /api/invites/{code} server handler (Wave 1, full-stack)
- [x] 09-02-PLAN.md — Fix voice localUserId: add localUserId to store, use user DB UUID in useVoice.ts (Wave 1, client)
- [x] 09-03-PLAN.md — Verify SEC-08: audit Electron security config, add comment, mark REQUIREMENTS.md complete (Wave 1, client + docs)
- [x] 09-04-PLAN.md — Verify APP-01: confirm SPA behavior, mark REQUIREMENTS.md complete (Wave 1, docs)

### Phase 10: Fix Media Attachment Wiring
**Goal:** Media attachments render correctly in channel messages — both from history (REST) and live delivery (WebSocket)
**Depends on**: Phase 7
**Requirements:** MEDIA-01 (fix), MEDIA-02 (fix), MEDIA-03 (fix), MEDIA-04 (fix)
**Gap Closure:** Closes integration and flow gaps from v1.0-MILESTONE-AUDIT.md
**Success Criteria** (what must be TRUE):
  1. Messages loaded from REST history have `block_refs` populated as a typed `BlockRefData[]` array (not a raw JSON string)
  2. Messages received via WebSocket live delivery have `block_refs` populated from the protobuf `repeated BlockRef` field
  3. InlineImage, InlineVideo, ImageGrid, and AttachmentCard components render media when `block_refs` data is present

Plans:
- [ ] 10-01-PLAN.md — Fix block_refs parsing in REST history IPC handler and WS chat-events handler (Wave 1, client)

### Phase 11: Phase 1 Formal Verification
**Goal:** Create Phase 1 VERIFICATION.md to formally verify 6 orphaned requirements that have implementations but no phase-level verification evidence
**Depends on**: Phase 1
**Requirements:** SEC-01, SEC-02, SEC-09, SEC-10, SEC-11, SRVR-07
**Gap Closure:** Closes orphaned requirement gaps from v1.0-MILESTONE-AUDIT.md
**Success Criteria** (what must be TRUE):
  1. Phase 1 VERIFICATION.md exists with evidence for all 6 requirements
  2. Each requirement has code-level evidence (file paths, line numbers) confirming implementation
  3. All 56 v1 requirements have formal verification evidence in at least one VERIFICATION.md

Plans:
- [ ] 11-01-PLAN.md — Audit Phase 1 implementations and create VERIFICATION.md (Wave 1, docs)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

Note: Phase 8 (Voice) depends on Phase 3, not Phase 7. Phases 9-11 are gap closure from milestone audits.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 6/6 | Complete | 2026-02-24 |
| 2. Server Management | 8/8 | Complete | 2026-02-25 |
| 3. P2P Networking | 4/4 | Complete | 2026-02-26 |
| 4. Real-Time Chat | 6/6 | Complete | 2026-02-26 |
| 5. Direct Messages | 4/4 | Complete | 2026-02-26 |
| 6. Content Distribution | 5/5 | Complete | 2026-02-26 |
| 7. Media and Prefetching | 3/3 | Complete | 2026-02-26 |
| 8. Voice Channels | 3/3 | Complete | 2026-02-26 |
| 9. Milestone Gap Closure | 4/4 | Complete | 2026-02-27 |
| 10. Fix Media Attachment Wiring | 0/1 | Pending | — |
| 11. Phase 1 Formal Verification | 0/1 | Pending | — |
