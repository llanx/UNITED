# Parallel Development Guide

**Created:** 2026-02-22
**Developers:** matts (Developer A), benzybones (Developer B)
**Strategy:** Hybrid — server/client split within phases, feature parallelism in later phases

## Developer Assignments

| Developer | Primary Ownership | Language | Codebase |
|-----------|-------------------|----------|----------|
| **matts** (Dev A) | Rust coordination server | Rust | `server/` |
| **benzybones** (Dev B) | Electron/React client | TypeScript | `client/` |

Both developers jointly own `shared/` (protobuf schemas, type definitions).

During Phases 5-8, each developer owns **both server and client code** for their assigned feature.

---

## Parallel Execution Timeline

```
         matts (Dev A)                    benzybones (Dev B)              Milestone
         ────────────                     ──────────────────              ─────────
Phase 1  Server foundation (Rust)     ║   Client foundation (Electron)   M1: Auth E2E
Phase 2  Server management (server)   ║   Server management (client)     M2: Channels E2E
Phase 3  P2P networking (server)      ║   P2P networking (client)        M3: Peers connect
Phase 4  Real-time chat (server)      ║   Real-time chat (client)        M4: Chat works
         ─── FORK: feature parallelism ──────────────────────────────
Phase 5  Direct Messages (full stack) ║   Phase 6: Content Dist (full)   M5: DMs + Blocks
Phase 8  Voice Channels (full stack)  ║   Phase 7: Media/Prefetch (full) M6: All features
         ─── MERGE ──────────────────────────────────────────────────
         Integration testing + polish (both)                              M7: v1 release
```

**Why this works:**
- Phases 1-4 are sequential dependencies but server/client work within each phase is independent
- Phase 5 and Phase 6 both depend on Phase 4 but NOT each other
- Phase 8 depends only on Phase 3 (not Phase 7)
- Phase 7 depends on Phase 6 (benzybones' own prior work)

---

## Monorepo Structure

```
UNITED/
├── server/                    # Rust coordination server (matts primary)
│   ├── Cargo.toml
│   └── src/
├── client/                    # Electron + React (benzybones primary)
│   ├── package.json
│   └── src/
│       ├── main/              # Electron main process
│       ├── preload/           # contextBridge
│       └── renderer/          # React app
├── shared/                    # Jointly owned — changes require mutual review
│   ├── proto/                 # Protobuf definitions (.proto files)
│   │   ├── auth.proto
│   │   ├── channel.proto
│   │   ├── message.proto
│   │   ├── signaling.proto
│   │   ├── content.proto
│   │   ├── presence.proto
│   │   └── voice.proto
│   └── types/                 # TypeScript API types
│       ├── api.ts             # REST endpoint types
│       ├── ws-protocol.ts     # WebSocket message union
│       └── ipc-bridge.ts      # Electron IPC channel definitions
├── .planning/                 # Planning docs (existing)
└── tests/
    └── integration/           # Cross-boundary integration tests
```

Both `prost` (Rust) and `@bufbuild/protobuf` (TypeScript) code-generate from the same `.proto` files in `shared/proto/`, ensuring byte-level serialization compatibility.

---

## Git Workflow

### Branching Strategy

```
main                          (protected, always buildable, merges via PR)
│
├── shared/contracts           (schema changes — both devs contribute, both review)
│
├── server/phase-1             (matts: server-side Phase 1)
├── client/phase-1             (benzybones: client-side Phase 1)
│
├── server/phase-2             (matts: server-side Phase 2)
├── client/phase-2             (benzybones: client-side Phase 2)
│   ... (repeat for Phases 3-4)
│
├── feature/dm                 (matts: Phase 5 full stack)
├── feature/content-dist       (benzybones: Phase 6 full stack)
│
├── feature/voice              (matts: Phase 8 full stack)
├── feature/media              (benzybones: Phase 7 full stack)
│
└── integration/milestone-N    (temporary: merge both branches for integration testing)
```

### Rules

1. **`main` is always buildable.** All changes via PR with review from the other developer.
2. **Contract changes go to `shared/contracts` first.** Both developers pull this before starting phase work. Contract PRs require ACK from both.
3. **Phase branches merge at milestones.** Both branches merge to `main` via PRs at each milestone after integration testing passes.
4. **No force-pushes to `main`.** Ever.

### Commit Convention

```
feat(server/auth): implement Ed25519 challenge-response verification
feat(client/ipc): add typed contextBridge API for auth
fix(shared/proto): correct MessageEnvelope field ordering
test(integration/m1): add auth end-to-end test
```

### Conflict Zones

Only three areas where both developers touch files:
- `shared/` — managed via contract branch, conflicts resolved in joint review
- Root config files (`.gitignore`, CI) — coordinate in sync meetings
- `tests/integration/` — both contribute, review each other's tests

---

## Shared Contracts Per Phase

Before starting parallel work on each phase, both developers must agree on the contracts below. Define these on the `shared/contracts` branch before branching into phase work.

### Phase 1: Foundation

| Contract | Contents |
|----------|----------|
| `auth.proto` | ChallengeRequest, ChallengeResponse, VerifyRequest, VerifyResponse, RefreshRequest, JWT claims structure |
| REST API | `POST /api/auth/challenge`, `POST /api/auth/verify`, `POST /api/auth/refresh`, `POST /api/auth/recover`, `GET /api/server/info` |
| WebSocket | Handshake: `ws://host/ws?token=JWT`, base message envelope: `{ type, payload, request_id? }` |
| `ipc-bridge.ts` | Initial `window.united` API surface (identity, auth stubs, server connection) |
| SQLite schema | `users` table (id, public_key, fingerprint, display_name, avatar_hash, encrypted_blob, created_at) |

### Phase 2: Server Management

| Contract | Contents |
|----------|----------|
| `channel.proto` | Channel, Category, Role, Permission types, CRUD request/response messages |
| REST API | Channel CRUD, role management, invite link endpoints |
| WS events | `channel:created`, `channel:updated`, `channel:deleted`, `member:joined`, `member:left`, `role:assigned` |
| Permission bitfield | Which bit = which permission (send_messages, manage_channels, kick, ban, admin) |
| Invite format | Token format, expiry encoding, usage count |

### Phase 3: P2P Networking

| Contract | Contents |
|----------|----------|
| `signaling.proto` | SDPOffer, SDPAnswer, ICECandidate, PeerAnnounce messages |
| WS signaling | How SDP/ICE relay works through the server |
| Gossipsub topics | `/united/<server-id>/channel/<channel-id>`, `/united/<server-id>/presence`, `/united/<server-id>/typing` |
| Custom protocols | `/united/block-transfer/1.0.0`, `/united/channel-sync/1.0.0` |
| Bootstrap | Server multiaddr format: `/dns4/host/tcp/port/ws` |

### Phase 4: Real-Time Chat

| Contract | Contents |
|----------|----------|
| `message.proto` | MessageEnvelope (id, author_id, channel_id, content, lamport_ts, server_seq, causal_deps, signature, inline_attachments, block_refs) |
| `presence.proto` | Presence heartbeat, typing indicator format |
| Server confirm | `{ msg_id, server_seq, channel_id }` |
| History API | `GET /api/channels/{id}/messages?before=seq&limit=N` |
| Reaction format | Reaction add/remove event structure |

### Phase 5: Direct Messages (matts — full stack)

| Contract | Contents |
|----------|----------|
| DM topic | `/united/dm/<sorted-user-id-pair-hash>` |
| Prekey bundle | `{ identity_key, signed_prekey, one_time_prekeys[] }` |
| Prekey API | `GET /api/users/{id}/prekeys`, `POST /api/prekeys/upload`, `GET /api/dm/offline` |
| Encrypted blob | Server-stored offline DM format |

### Phase 6: Content Distribution (benzybones — full stack)

| Contract | Contents |
|----------|----------|
| `content.proto` | BlockRequest, BlockResponse, ManifestBlock, ContentIndex messages |
| Block transfer | libp2p request-response protocol over `/united/block-transfer/1.0.0` |
| Server fallback | `GET /api/blocks/{hash}`, `PUT /api/blocks/{hash}` |
| Content index | `GET /api/content/providers/{hash}` |
| Hash algorithm | BLAKE3 — both Rust and JS must produce identical hashes |

### Phase 8: Voice (matts — full stack)

| Contract | Contents |
|----------|----------|
| `voice.proto` | VoiceJoin, VoiceLeave, VoiceParticipants, VoiceSpeaking messages |
| WS signaling | Server tracks participants, relays SDP/ICE for voice PeerConnections |

---

## Integration Milestones

### M1: Auth End-to-End (after Phase 1)

**Verifies:** User can open Electron app, create account on Rust server, log in, receive JWT, see "connected" in UI. IPC bridge works with typed request-response.

**Integration test:**
1. Client sends registration to server → server responds with user created
2. Client logs in → server returns JWT
3. Client opens WebSocket with JWT → server authenticates and holds connection
4. App shell loads instantly from cache on second launch

**Sync:** Review IPC bridge types, WebSocket message format, JWT handling. Fix serialization mismatches.

### M2: Channels End-to-End (after Phase 2)

**Verifies:** Logged-in user sees channel list, creates channels, manages roles, generates invites, second user joins via invite.

**Integration test:**
1. Admin creates channel via client UI → server persists
2. Admin generates invite link → second client joins via invite
3. Both clients see updated channel list with new channel and new member

**Sync:** Review permission enforcement, invite flow, role assignment.

### M3: Peers Connect (after Phase 3)

**Verifies:** Two Electron clients on different networks discover each other via coordination server, establish WebRTC DataChannel, exchange gossipsub messages.

**Integration test:**
1. Client A publishes test message to gossipsub topic
2. Client B on different network receives it
3. Server relays for NAT-blocked peers
4. Test with simulated symmetric NAT

**Sync:** Most critical milestone. Review signaling flow, NAT traversal, gossipsub tuning. Both devs pair-program during this integration.

### M4: Chat Works (after Phase 4)

**Verifies:** Users send text messages in channels, appear in real-time on other clients, correct server-assigned ordering. Messages persist and survive restart.

**Integration test:**
1. Five concurrent senders on 3 peers → all converge to identical order within 2s
2. Messages survive app restart
3. Unread indicators work across channel switches
4. Typing indicators and presence show correctly

**Sync:** Review message ordering reconciliation, signature verification, React rendering performance.

### M5: DMs + Blocks (after Phases 5 & 6)

**Verifies (matts):** Encrypted DMs work, offline delivery works, prekey system functions.
**Verifies (benzybones):** Files upload, chunk into blocks, distribute to peers, fetch via cache cascade. Images render inline with blurhash.

**Integration tests:**
- User A sends DM to offline User B → B comes online → DM delivered and decrypted
- User A uploads image → User B fetches via cache cascade (peer first, server fallback)
- DM with attachment (encrypted content block in DM context)

**Sync:** Cross-feature integration. Verify DM attachments work with block pipeline. Review block storage format compatibility.

### M6: All Features (after Phases 7 & 8)

**Verifies (matts):** Voice channels with 2-8 participants, mute/deafen/speaking indicators.
**Verifies (benzybones):** Media renders inline, upload flow complete, prefetching works.

**Integration tests:**
- Voice channel with 4 participants on different networks
- File sharing in voice channel context
- Media attachments in DMs
- Prefetch on channel hover

**Sync:** Final integration review. Cross-feature testing plan for v1.

### M7: v1 Release

All features integrated, E2E tested, memory profiled (<400MB RSS after 8h), NAT traversal verified, packaging pipeline complete (Windows, macOS, Linux).

---

## Developer Assignments: Detailed Breakdown

### Phase 1: Foundation

**Day 0 — Joint work (both developers):**
- Define `auth.proto`, REST API surface, WebSocket handshake protocol
- Define `ipc-bridge.ts` initial surface
- Define JWT claims structure, initial SQLite schemas
- Set up monorepo structure, CI, `.proto` code generation

**matts — Server:**
- Rust project scaffolding (Cargo.toml with pinned deps from STACK.md)
- Config system (TOML + env vars, clap CLI)
- SQLite setup with rusqlite (users table, server_settings table)
- Auth module: registration (Argon2id), login, JWT issuance/validation
- Axum router with auth middleware extractor
- WebSocket upgrade handler with JWT auth
- Actor-per-connection pattern (reader/writer tokio tasks with mpsc)
- WebSocket protocol: base message envelope dispatch
- Server info endpoint, health check
- Docker container build

**benzybones — Client:**
- Electron project scaffolding (electron-vite, TypeScript config)
- Native module rebuild pipeline (`@electron/rebuild` for sodium-native, better-sqlite3, node-datachannel)
- Electron main process: BrowserWindow with strict security (contextIsolation, CSP)
- Preload script: contextBridge API surface (stubs for all domains)
- IPC handler framework (typed invoke/handle + push events)
- Server connection module: WebSocket client with auto-reconnect + exponential backoff
- Auth client: login/register UI, JWT storage (Electron safeStorage)
- Local SQLite setup with better-sqlite3 (initial schema)
- React app shell: instant load from cache, SPA routing via pushState
- Virtualized list scaffolding (@tanstack/react-virtual skeleton)
- Local HTTP content server skeleton (127.0.0.1, random port)
- Zustand store setup (auth, channels, messages, presence, voice slices)

### Phase 2: Server Management

**matts — Server:**
- Channel/category CRUD endpoints
- Role system: create role, assign permissions (bitfield), assign to user
- Permission checking middleware
- Invite link generation (random token, optional expiry, usage count)
- Invite redemption endpoint
- Kick/ban endpoints with WebSocket broadcast
- Ban persistence and enforcement

**benzybones — Client:**
- Channel list sidebar (categories, channels, unread badges placeholder)
- Channel creation/editing/deletion UI (permission-gated)
- Role management UI (admin panel)
- Invite link generation and sharing UI
- Join-via-invite flow
- Member list component
- Permission-aware UI (hide admin controls)
- WebSocket event handlers for channel/member/role changes

### Phase 3: P2P Networking

**matts — Server:**
- rust-libp2p node (WebSocket transport, noise, yamux)
- Server as gossipsub router
- Server as Kademlia DHT bootstrap node
- Server as Circuit Relay v2 node
- SDP/ICE relay via WebSocket
- AutoNAT service
- Peer registry: track connected peers, multiaddrs, NAT status
- Server-side gossipsub message validation

**benzybones — Client:**
- js-libp2p node in main process (WebRTC + WebSocket transports)
- Gossipsub config (D=3-4 for chat, peer scoring, flood publish)
- Topic subscription management
- Gossipsub publish/receive pipeline
- NAT traversal: AutoNAT, DCUtR, Circuit Relay v2 via server
- Kademlia DHT bootstrapping
- Connection persistence across navigation (APP-02)
- IPC bridge for P2P status

### Phase 4: Real-Time Chat

**matts — Server:**
- Message ordering: monotonic server_seq per channel
- Message receipt via gossipsub → assign server_seq → broadcast confirmation
- Message history endpoint (paginated)
- Message persistence in server SQLite
- Presence tracking (heartbeat, online/offline/away)
- Typing indicator relay
- @mention detection, notification event generation
- User profile endpoints
- Ed25519 signature validation

**benzybones — Client:**
- Message envelope creation: UUIDv7, Lamport clock, Ed25519 signing
- Gossipsub publish + receive pipeline
- Optimistic UI: display immediately, reconcile on server_seq
- Virtualized message list with markdown, reactions, @mentions
- Message input: composition area, @mention autocomplete, emoji picker
- Typing indicators via gossipsub
- Presence system: heartbeats, aggregate
- Unread tracking per channel (local SQLite)
- Desktop notifications for @mentions
- User profile display
- Message history loading (scroll-back → server REST)
- Signature verification on received messages

### Phase 5: Direct Messages (matts — full stack)

**Server:**
- Prekey bundle storage: `POST /api/prekeys/upload`, `GET /api/users/{id}/prekeys`
- Offline DM blob storage and retrieval
- DM delivery status tracking
- Prekey depletion notifications

**Client:**
- X25519 key exchange (sodium-native)
- Prekey system: generate 100 one-time prekeys, upload, replenish when low
- Per-conversation key management (sender ratchet, session storage)
- DM encryption/decryption pipeline
- DM gossipsub topic subscription
- Offline message retrieval on login
- DM conversation list UI
- Encryption indicator UI

### Phase 6: Content Distribution (benzybones — full stack)

**Server:**
- Content index: hash-to-peer mapping, provider tracking
- Fallback encrypted block store (flat files, content-addressed)
- Block upload/download endpoints
- Replication factor monitoring
- LRU eviction with configurable quota

**Client:**
- Content-addressed block store (256KB chunks, 2-char hex prefix dirs, XChaCha20 at-rest)
- File chunking pipeline: split → manifest → compute hashes
- Cache cascade (L0 memory LRU → L1 SQLite+files → L2 hot peers parallel → L3 DHT → L4 server)
- Parallel peer fetching (first-responder-wins)
- Block integrity verification
- Eager replication: push to 3 peers + server on upload
- Tiered retention (P1 own/P2 hot 24h/P3 warm 2-7d/P4 altruistic)
- Configurable storage buffer UI
- Seeding indicators
- Local HTTP content server integration

### Phase 7: Media and Prefetching (benzybones — full stack)

- File upload UI (drag-and-drop, progress)
- Blurhash generation on upload
- Inline image/video rendering with blurhash placeholders
- Attachment component (images, video, documents)
- Prefetch engine: hover-prefetch, scroll-ahead, app-launch prefetch
- Storage buffer configuration UI
- Seeding indicator dashboard

### Phase 8: Voice Channels (matts — full stack)

**Server:**
- Voice channel participant tracking (join/leave state machine)
- Voice signaling relay via WebSocket (SDP/ICE for voice)
- Participant list broadcast

**Client:**
- Voice manager: state machine (join/leave/reconnect)
- Separate RTCPeerConnection per participant (NOT libp2p-managed)
- SDP/ICE exchange via server WebSocket
- Audio pipeline: getUserMedia → AudioContext → addTrack per PC
- Remote audio: receive tracks → mix → speakers
- Mute/deafen controls
- Voice activity detection → speaking indicators
- Push-to-talk option
- Voice channel UI (participant list, controls)
- Hard cap at 10-12 participants

---

## Risks and Mitigations

### 1. Contract Divergence (HIGH likelihood, MEDIUM impact)

Server and client implement subtly different interpretations of shared schemas.

**Mitigations:**
- Generate types from `.proto` files — never hand-write matching types
- Shared integration test suite exercises proto serialization round-trip (Rust prost encode → JS @bufbuild/protobuf decode, and vice versa)
- Contract PRs require review from both developers

### 2. Phase 3 Integration Is Hardest (HIGH likelihood, HIGH impact)

Getting Rust libp2p + JS libp2p to interoperate via WebSocket + gossipsub + relay is the most complex integration point. NAT traversal adds non-determinism.

**Mitigations:**
- Allocate extra time for Phase 3 (it's the longest phase)
- Start simple: Rust WS server + JS WS client, plain message exchange. Layer gossipsub/relay incrementally.
- Both developers pair-program during Phase 3 integration testing
- Build a P2P test harness simulating NAT, packet loss, peer churn

### 3. Phase 6 Is Heavier Than Phase 5 (MEDIUM likelihood, MEDIUM impact)

Content Distribution (5-layer cache cascade, block store, chunking, replication, retention) is significantly more work than DMs.

**Mitigations:**
- matts finishes DM server work first, then helps with Phase 6 server-side (content index, fallback block store)
- Phase 6 can be split: core block store + cache cascade first, replication/retention/seeding second

### 4. Native Module Rebuild Breaks (MEDIUM likelihood, HIGH impact)

sodium-native, better-sqlite3, or node-datachannel fail to rebuild against Electron 40.

**Mitigations:**
- Test `@electron/rebuild` for all three on day 0, before any client code
- Fallbacks: libsodium-wrappers (WASM) for sodium-native, sql.js (WASM) for better-sqlite3
- If node-datachannel fails, fall back to WebSocket-only transport temporarily

### 5. Developer Blocked Waiting (MEDIUM likelihood, LOW impact)

One developer finishes their side of a phase faster than the other.

**Mitigations:**
- Whoever finishes first writes integration tests, docs, or helps the other
- matts can start Phase 8 voice signaling early (depends only on Phase 3)
- benzybones can start Phase 6 block store design early during Phase 4

### 6. Protobuf Schema Evolution (HIGH likelihood, LOW impact)

Mid-phase contract change needed after both devs have written code against the old schema.

**Mitigations:**
- Use protobuf's additive field evolution (never remove/renumber fields, only add optional)
- Version protocol IDs: `/united/block-transfer/1.0.0` → `/united/block-transfer/1.1.0`
- Schema changes go through `shared/contracts` branch with mutual review

---

## Communication Protocol

### Daily
- Async standup (Discord/Slack): what I did, what I'm doing, blockers
- Escalate blockers involving the other dev's code immediately

### At Each Phase Boundary
- Sync meeting: review progress, demo working features, identify integration issues
- Contract review: any needed changes to shared proto/types before next phase

### At Each Milestone (M1-M7)
- Joint integration session: both devs run integration test suite together, debug failures
- Post-milestone retro: what worked, what to change

### Tooling
- Both developers use Claude Opus 4.6. Each Claude instance should be given the shared contract definitions and awareness of the other dev's API surface.
- CI runs on every PR: `cargo test` for server, `npm test` for client, integration tests for merged code

---

*Guide created: 2026-02-22*
*Referenced documents: ROADMAP.md, REQUIREMENTS.md, ARCHITECTURE.md, STACK.md*
