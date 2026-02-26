---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-02-26T21:47:57.372Z"
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 36
  completed_plans: 36
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
last_updated: "2026-02-26T21:38:41.000Z"
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 36
  completed_plans: 36
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Users communicate in real-time with full data sovereignty — no third party ever touches their content, and the community funds its own infrastructure by participating in it.
**Current focus:** Phase 8: Voice Channels (in progress).

## Current Position

Phase: 8 of 8 (Voice Channels)
Plan: 1 of 3 in current phase
Status: Phase 8 in progress
Last activity: 2026-02-26 -- Completed 08-01-PLAN.md (voice signaling infrastructure)

Progress: [█████████░] 97%

## Performance Metrics

**Velocity:**
- Total plans completed: 31
- Average duration (GSD-tracked): 10 min
- Total execution time (GSD-tracked): 3.90 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan | Notes |
|-------|-------|-------|----------|-------|
| 01-foundation | 6/6 | — | — | Server track (01-01 to 01-03) GSD-tracked. Client track (01-04 to 01-06) executed manually by benzybones, reconciled retroactively. |
| 02-server-management | 8/8 | 37 min | 5 min | 02-01: schema, permissions, proto, broadcast; 02-02 to 02-04: server endpoints; 02-05: device provisioning; 02-06: channel/role UI; 02-07: invite join flow; 02-08: SRVR-04 gap closure |
| 03-p2p-networking | 4/4 | 46 min | 12 min | 03-01: server libp2p node with gossipsub, relay, peer directory, message persistence; 03-02: client libp2p node with gossipsub, peer discovery, IPC; 03-03: P2P dev panel with stats pipeline and floating overlay; 03-04: fix reconnect bug (gap closure) |
| 04-real-time-chat | 6/6 | 65 min | 11 min | 04-01: protobuf schemas, migration 4, REST endpoints, WS broadcast; 04-02: IPC handlers, Zustand stores, hooks, WS event forwarding; 04-03: ChatView, MessageGroup, MessageComposer, MarkdownContent; 04-04: presence tracking, MemberListSidebar, PresenceIndicator, UserProfilePopup; 04-05: emoji reactions, @mentions, unread badges, desktop notifications; 04-06: gap closure (presence pubkey, message ID consistency) |
| 05-direct-messages | 4/4 | 27 min | 7 min | 05-01: DM protobuf schemas, migration 5, 8 REST endpoints (keys, conversations, messages, offline), WS targeted push, background cleanup; 05-02: DM crypto module, IPC handlers, Zustand store, hooks, preload bridge; 05-03: DM UI (conversation list, chat view, composer, encryption indicators, server rail DM icon, profile popup Message button); 05-04: gap closure (DM WS protobuf decoding fix) |
| 06-content-distribution | 5/5 | 32 min | 6 min | 06-01: server block store, REST endpoints, WS events; 06-02: client block store, encryption, IPC; 06-03: block protocol, 5-layer cache cascade; 06-04: inline content UI, storage settings; 06-05: resolveBlock bridge wiring (gap closure) |
| 07-media-and-prefetching | 3/3 | 25 min | 8 min | 07-01: protobuf extensions, migration 7, upload size enforcement, media IPC with blurhash + video thumbnails; 07-02: inline media components, composer file attachment, adaptive image grid, lightbox; 07-03: network stats dashboard, status bar indicator, channel hover/scroll/launch prefetch |
| 08-voice-channels | 1/3 | 8 min | 8 min | 08-01: voice protobuf schemas, server voice module (state, signaling, TURN), migration 8, WS dispatch, REST endpoint |

**Recent Trend:**
- GSD-tracked plans: 01-01 (19 min), 01-02 (16 min), 01-03 (45 min), 02-01 (5 min), 02-05 (6 min), 02-06 (7 min), 02-07 (9 min), 02-08 (5 min), 03-01 (23 min), 03-02 (17 min), 03-03 (5 min), 03-04 (1 min), 04-01 (11 min), 04-02 (13 min), 04-03 (6 min), 04-04 (20 min), 04-05 (11 min), 04-06 (4 min), 05-01 (10 min), 05-02 (8 min), 05-03 (6 min), 05-04 (3 min), 06-01 (12 min), 06-02 (8 min), 06-03 (6 min), 06-04 (5 min), 06-05 (1 min), 07-01 (11 min), 07-02 (6 min), 07-03 (8 min), 08-01 (8 min)
- Client plans (01-04, 01-05, 01-06): executed outside GSD by benzybones

*Updated after each plan completion*
| Phase 05 P04 | 3min | 2 tasks | 1 files |
| Phase 06 P01 | 12min | 2 tasks | 23 files |
| Phase 06 P02 | 8min | 2 tasks | 16 files |
| Phase 06 P03 | 6min | 2 tasks | 6 files |
| Phase 06 P04 | 5min | 2 tasks | 10 files |
| Phase 06 P05 | 1min | 1 tasks | 3 files |
| Phase 07 P01 | 11min | 2 tasks | 25 files |
| Phase 07 P02 | 6min | 2 tasks | 12 files |
| Phase 07 P03 | 8min | 2 tasks | 17 files |
| Phase 08 P01 | 8min | 2 tasks | 17 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 8 phases derived from 52 v1 requirements following Foundation > Server > P2P > Chat > DMs > Content > Media > Voice dependency chain
- [Roadmap]: Voice (Phase 8) sequenced last despite only depending on Phase 3 — benefits from stable platform, architecturally independent
- [01-01]: Prost module hierarchy must match protobuf package paths (proto::united::{auth,identity,server,ws})
- [01-01]: Shared directory has own package.json for @bufbuild/protobuf type resolution
- [01-01]: Electron rebuild needs explicit --version flag (auto-detection uses system Node)
- [01-01]: Generated TypeScript protobuf files are gitignored (regenerated from buf generate)
- [01-02]: PeerIpKeyExtractor for rate limiting requires ConnectInfo<SocketAddr> on axum::serve
- [01-02]: DashMap for in-memory challenge store (60s expiry, periodic cleanup)
- [01-02]: JWT refresh tokens stored as SHA-256 hash, single-use rotation
- [01-02]: jsonwebtoken 10.3 requires explicit rust_crypto feature for CryptoProvider
- [01-02]: Setup token regenerated on restart if no users exist (hash-only storage)
- [01-03]: AES-256-GCM for TOTP secret encryption with server-generated 256-bit key (no Argon2id needed server-side)
- [01-03]: Actor-per-connection WebSocket pattern with mpsc split reader/writer
- [01-03]: WebSocket auth via ?token= query parameter (browsers cannot set custom WS headers)
- [01-03]: Dual-signature key rotation: old + new key both sign rotation payload
- [01-03]: 72-hour cancellation deadline stored as ISO 8601 timestamp (not duration)
- [01-03]: random_signing_key() helper avoids rand_core 0.6/0.9 version conflict in tests
- [Phase 2+]: Selective TDD — use TDD for REST API endpoints, auth/crypto flows, and DB queries (write integration tests against proto contracts first). Use test-after for WebSocket stateful code and UI components. Protobuf schemas are the contract, no tests needed.
- [01-06]: XChaCha20-Poly1305 for client-side encryption (not AES-256-GCM — more portable, no AES-NI dependency, 24-byte nonces)
- [01-06]: entropyToMnemonic from @scure/bip39 (NOT mnemonicToSeed which produces 512-bit PBKDF2 for HD wallets)
- [01-06]: 3-position mnemonic verification quiz before identity creation proceeds
- [01-06]: Severity-based error UX: 4001 silent refresh, 4002 redirect with explanation, 4003 full-screen ban
- [01-06]: QR code generated client-side via qrcode.react (removed qr_png from server response)
- [01-06]: Hex encoding for public keys and signatures (not base64)
- [02-01]: WS envelope field allocation: channels 50-59, roles 60-69, moderation 70-79, invites 80-89, overflow 100-105
- [02-01]: Protobuf packages follow existing convention: united.channels, united.roles, united.moderation, united.invite
- [02-01]: invite.proto imports channels.proto and roles.proto for JoinServerResponse (channel list + role list on join)
- [02-05]: Length-prefixed TCP wire protocol (4-byte uint32 BE) for device provisioning to avoid read/write deadlocks
- [02-05]: X25519 SPKI DER header (302a300506032b656e032100) for Node.js crypto key import/export
- [02-05]: Transfer full encrypted identity blob alongside raw session keys so receiving device stores same format
- [02-05]: Text input fallback for QR payload since Electron desktop lacks camera scanning
- [02-06]: CRUD store actions re-fetch full state after mutation (no optimistic updates) — acceptable for admin-frequency operations
- [02-06]: Admin gating uses isOwner flag — owner has all permissions implicitly per CONTEXT.md
- [02-06]: Permission bitfield: send_messages(1), manage_channels(2), kick_members(4), ban_members(8), admin(16)
- [02-06]: Right-click context menus for inline channel/category rename/delete (Discord pattern)
- [02-08]: MemberResponse returns role_ids array (not full role objects) — client joins with local role cache
- [02-08]: Owner members shown in UI but roles not editable — owner has all permissions implicitly
- [02-08]: Default @everyone role excluded from toggle badges — auto-assigned to all
- [03-01]: Shared tokio runtime for axum and libp2p Swarm (mpsc command/event channels for communication)
- [03-01]: Topic namespace: first 16 chars of server PeerId / channel UUID (multi-server future-proof)
- [03-01]: Gossipsub D=4, D_lo=3, D_hi=8 (chat-tuned, not blockchain defaults of D=6)
- [03-01]: Circuit Relay v2 limits: 30min duration, 10MB data (up from 2min/128KB defaults)
- [03-01]: Server libp2p identity stored as 32-byte Ed25519 seed at {data_dir}/p2p_identity.key
- [03-01]: Separate port for libp2p WS (default 1985) from axum HTTP (1984)
- [03-01]: GossipEnvelope has dual signing: gossipsub mesh-level + UNITED inner Ed25519 signature
- [03-01]: Conservative peer scoring thresholds (-100/-200/-300) to avoid premature eviction
- [03-02]: Identity bridge uses generateKeyPairFromSeed('Ed25519', 32-byte seed) from @libp2p/crypto/keys
- [03-02]: Gossipsub globalSignaturePolicy: StrictNoSign (UNITED GossipEnvelope has its own Ed25519 signatures)
- [03-02]: P2P IPC namespace pattern: window.united.p2p.{startMesh, stopMesh, sendTestMessage, pingPeer, ...}
- [03-02]: Auto-start P2P mesh on WS 'connected' event (no separate initialization step)
- [03-02]: Channel lifecycle hooks (setChannelIds, onChannelCreated, onChannelDeleted) wire REST CRUD to gossipsub topics
- [03-02]: 2-second stats push interval gated on dev panel open state
- [03-03]: Stats pipeline extracted into dedicated stats.ts module (clean separation from IPC handlers)
- [03-03]: DevPanel uses inline styles (dev tool, not polished UI) with drag support via document-level listeners
- [03-03]: MainContent refactored to renderPanel() + fragment so DevPanel overlay renders in all views
- [03-04]: No new dependencies for reconnect fix — peerIdFromString already transitive dep from @libp2p/peer-id
- [04-01]: REST as primary message creation path (simpler, more reliable for single-server)
- [04-01]: UUIDv7 for message IDs (time-ordered, string-compatible with existing patterns)
- [04-01]: Shared connection registry between gossip consumer and app state for WS broadcast
- [04-01]: Soft-delete for messages (deleted=1 flag, filtered in queries)
- [04-01]: INSERT OR IGNORE for reactions (UNIQUE constraint handles idempotency)
- [04-01]: GossipPersistResult struct returns optional ChatMessage for gossip-to-WS broadcast
- [04-01]: WS Envelope field allocation: chat events 120-126, history 130-131 (Phase 4 range 120-149)
- [04-02]: Per-channel message cap of 500 with oldest-end trimming on append, oldest-end trimming on history prepend
- [04-02]: Typing timeout 3s via window.setTimeout with auto-clear on unmount
- [04-02]: Idle detection via Electron powerMonitor.getSystemIdleTime() polled every 30s, threshold 15min
- [04-02]: Notification coalescing: 2s window per channel, skip if window focused on same channel
- [04-02]: WS event forwarding: separate module (chat-events.ts) decodes protobuf envelopes, switches on payload.case
- [04-02]: buf + protoc-gen-es installed as devDeps in shared/ for proto codegen
- [04-03]: Atom-one-dark highlight.js theme for code block syntax highlighting (dark-mode-first)
- [04-03]: Pubkey hash-derived HSL hue for avatar colors (deterministic, no server lookup)
- [04-03]: useVirtualizer count on message groups (not individual messages) for correct height measurement
- [04-03]: Stick-to-bottom threshold of 50px for auto-scroll detection
- [04-03]: Context menu rendered as fixed-position portal-style overlay via client coordinates
- [04-04]: Presence tracking via DashMap<String, PresenceInfo> on AppState — ephemeral, no DB persistence
- [04-04]: Presence snapshot sent on WS connect (no separate REST fetch needed)
- [04-04]: display_name field added to PresenceUpdate protobuf message (field 4)
- [04-04]: Multi-device presence: OFFLINE only broadcast when last connection closes (ConnectionRegistry check)
- [04-04]: Status grouping pattern: Online > Away > DND > Offline with alphabetical sort within groups
- [04-05]: @mention token format: @[display_name](user:id) or @[display_name](role:id) -- parsed before markdown
- [04-05]: Mention rendering: simple messages get inline React spans, complex markdown falls back to stripped text
- [04-05]: Desktop notifications triggered from renderer via IPC (renderer has member/role data for mention detection)
- [04-05]: Notification click sends 'navigate' ChatEvent back to renderer for channel switching
- [04-05]: EmojiPicker uses React.lazy with Suspense fallback for ~2.5MB emoji-picker-react code splitting
- [04-05]: Channel unread state: compare lastReadSequence to latest server_sequence per channel in messages store
- [04-06]: MemberResponse includes pubkey field via lower(hex(public_key)) — bridges REST member data to pubkey-keyed presence store
- [04-06]: Message IDs use last_insert_rowid() instead of UUIDv7 — consistent integer IDs across create, broadcast, and history
- [04-06]: UserProfilePopup displays pubkey instead of UUID — UNITED identity-first
- [05-01]: WS Envelope DM field allocation: 150-157 (Phase 5 range 150-169)
- [05-01]: Normalized participant order (lexicographic Ed25519 hex pubkeys) prevents duplicate DM conversations
- [05-01]: DM events sent via send_to_user (targeted), not broadcast_to_all -- private by design
- [05-01]: base64 encoding for encrypted blob payloads in REST responses (space-efficient for large binary data)
- [05-01]: Offline queue entries purged after 30 days; dm_messages persist indefinitely (conversation history)
- [05-01]: UPSERT pattern for X25519 key publication handles key rotation seamlessly
- [05-02→05-04]: DM WS events use protobuf Envelope format (corrected from JSON -- server sends protobuf binary, dm-events.ts now uses fromBinary like chat-events.ts)
- [05-02]: Desktop notifications for DMs show sender name only, never message content (E2E privacy)
- [05-02]: DM message window cap of 200 (lower than channel 500) reflecting lower DM volume
- [05-02]: Per-message decryption failure returns '[Unable to decrypt]' with decryptionFailed flag (graceful degradation)
- [05-02]: Shared secret cache keyed by conversation_id with secure zeroing via sodium_memzero
- [05-03]: DM view toggle orthogonal to activePanel -- dmView boolean swaps sidebar and main content independently
- [05-03]: Sidebar swap handled at Main.tsx parent level for clean conditional rendering
- [05-03]: DmComposer polls peer key status every 10s when key unavailable via setInterval
- [05-03]: EncryptionIndicator component replaces inline SVG in MessageRow for consistent indicator pattern
- [Phase 05]: Protobuf types are gitignored -- buf generate is a build step, not a committed artifact (reaffirming 01-01 decision)
- [06-01]: HKDF salt b'united-content-derived-key-v1' and info b'united-server-block-encryption' for content-derived key domain separation
- [06-01]: Block files stored at {data_dir}/blocks/{hex_hash} -- flat directory on server (client uses 2-char prefix subdirs)
- [06-01]: X-Block-Hash and X-Channel-Id custom headers for block upload metadata (not multipart)
- [06-01]: INSERT OR IGNORE for block metadata enables idempotent re-uploads
- [06-01]: WS Envelope Phase 6 block events at fields 160-162; DM range corrected to 150-159
- [06-01]: data_dir, block_retention_days, block_cleanup_interval_secs added to AppState for block storage config
- [06-02]: Version-tagged ciphertext (0x01=AES-GCM, 0x02=XChaCha20) enables algorithm detection on block decrypt
- [06-02]: 2-char hash prefix subdirectories for filesystem performance on block storage
- [06-02]: Block store key derived with same Argon2id params as identity but separate dedicated salt
- [06-02]: DM block persistence is fire-and-forget (wrapped in try/catch, non-blocking)
- [06-02]: Block data transferred as base64 strings across IPC boundary (renderer cannot access Buffer natively)
- [06-03]: Server GET /api/blocks/:hash returns plaintext (server decrypts before sending) -- no client-side HKDF decryption needed for L4 cascade
- [06-03]: L3 peer directory reuses WS-based discoverAndConnectPeers from Phase 3 rather than separate DHT (v1 design)
- [06-03]: AbortController cancels remaining peer requests after first Promise.any success in fetchFromHotPeers
- [06-03]: Block protocol uses length-prefixed stream (LP) wire format: LP(hash_utf8) request, LP(data) response
- [06-04]: 50KB inline threshold enforced on raw content before protobuf encoding (per research Pitfall 3)
- [06-04]: 60KB envelope size guard as safety margin below 64KB gossipsub max_transmit_size
- [06-04]: Progressive timeout: 3s shimmer, 3-15s fetching text, 15s+ unavailable with retry
- [06-04]: Thumbnail generation failure falls back to metadata-only block reference (graceful degradation)
- [06-04]: Block store config hydrated from IPC on app startup for settings persistence
- [06-05]: No new patterns -- gap closure wires existing infrastructure through the preload bridge
- [07-01]: Blurhash encoding at 32x32 with 4x3 components for ~30 byte strings
- [07-01]: Video thumbnail extracted at 1-second mark via ffmpeg to avoid black first frames
- [07-01]: block_refs carried as JSON string in REST (block_refs_json), proto repeated field for WS
- [07-01]: DefaultBodyLimit layer on PUT /api/blocks route for axum-level enforcement alongside handler check
- [07-01]: Blocking send pattern: files processed sequentially, all blocks uploaded before message published
- [07-02]: Deferred video loading: video block resolution only triggers on user click (Research Pitfall 7)
- [07-02]: Dual placeholder strategy: micro-thumbnail inline, blurhash in lightbox
- [07-02]: Drag-and-drop zone wraps entire ChatView for larger drop target, files passed via props
- [07-02]: Grid cells use micro-thumbnails with blur for compact preview; full-res deferred to lightbox
- [07-03]: Rolling 10s window for upload/download speed calculation (prune old entries on read)
- [07-03]: 5s push interval for stats from main to renderer (gated on window.isDestroyed check)
- [07-03]: Status bar off by default, persisted to localStorage (per CONTEXT.md)
- [07-03]: prefetchedChannels Set prevents redundant fetches within session
- [07-03]: App launch prefetch reads last-viewed channel from localStorage
- [07-03]: 70% scroll prefetch uses 2s time-based debounce (not scroll-event count)
- [07-03]: Module-level flag prevents double execution of app launch prefetch in React Strict Mode
- [08-01]: Voice state uses DashMap (consistent with challenges, presence patterns)
- [08-01]: TURN credentials use HMAC-SHA1 with timestamp:username (standard coturn shared secret mechanism)
- [08-01]: Auto-disconnect from previous voice channel on join (per CONTEXT.md)
- [08-01]: Server removes user from voice immediately on WS close (15s timeout is client-side)
- [08-01]: SDP/ICE relay adds sender_user_id field so target knows who sent it
- [08-01]: WS Envelope voice fields allocated at 180-189 (Phase 8 range 180-199)
- [08-01]: max_participants nullable INTEGER on channels (NULL for text, app-enforced default 8 for voice)

### Pending Todos

- [ ] [Phase 2 UAT] Real-time WS channel event propagation — two clients, admin creates channel, second client sees it
- [ ] [Phase 2 UAT] Non-admin panel access prevention — non-owner user should not see admin management panels
- [ ] [Phase 2 UAT] Invite join flow navigates to #general — full invite code → join → channel sidebar
- [ ] [Phase 2 UAT] Welcome overlay per-server dismissal — first join shows overlay, reconnect does not
- [ ] [Phase 2 UAT] Ban notice full-screen block — WS close 4003 triggers red overlay, no auto-reconnect
- [ ] [Phase 2 UAT] SEC-12 two-device round-trip — two Electron instances, QR payload transfer

### Blockers/Concerns

- [Research]: rust-libp2p WebRTC is alpha — server must use WebSocket transport only
- [Research]: sodium-native, better-sqlite3, node-datachannel all need Electron native module rebuild pipeline from day one
- [Research]: libp2p 3.x has breaking changes between minor versions — pin at 3.1.3 and validate API before Phase 3
- [Research]: NAT traversal requires TURN relay for 20-30% of connections — budget as core infrastructure
- [Research]: Gossipsub D=6 default is too high for chat — must tune to D=3-4 for chat topics

## Session Continuity

Last session: 2026-02-26
Stopped at: Completed 08-01-PLAN.md (voice signaling infrastructure)
Resume file: .planning/phases/08-voice-channels/08-02-PLAN.md
