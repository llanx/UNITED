---
phase: 03-p2p-networking
plan: 01
subsystem: p2p, networking, database
tags: [libp2p, gossipsub, relay, autonat, noise, ed25519, protobuf, circuit-relay-v2, peer-directory]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: axum server, SQLite, auth, WebSocket protocol, proto infra
  - phase: 02-server-management
    provides: channels CRUD, categories, roles, broadcast_to_all
provides:
  - libp2p Swarm running alongside axum in shared tokio runtime
  - Gossipsub pub/sub with chat-tuned parameters (D=4, D_lo=3, D_hi=8)
  - Circuit Relay v2 with chat-tuned limits (30min circuits, 10MB data)
  - AutoNAT and DCUtR for NAT traversal
  - Server identity keypair persistence (p2p_identity.key)
  - Peer directory (DashMap-backed, concurrent)
  - GossipEnvelope protobuf with Ed25519 signing/verification
  - Messages table with server-assigned sequence numbers
  - WS handlers for PeerDirectoryRequest and RegisterPeerIdRequest
  - GET /api/p2p/info endpoint
  - SwarmCommand/SwarmEvent channel architecture for axum-swarm communication
  - Auto gossipsub subscribe/unsubscribe on channel create/delete
affects: [03-p2p-networking plans 02-03, 04-messaging, client P2P plans]

# Tech tracking
tech-stack:
  added: [libp2p 0.56 (gossipsub, relay, autonat, noise, identify, dcutr, websocket, tokio, yamux, tcp, dns, ping, macros)]
  patterns: [shared tokio runtime, mpsc command/event channels, PeerDirectory with DashMap, GossipEnvelope protobuf signing]

key-files:
  created:
    - server/src/p2p/mod.rs
    - server/src/p2p/config.rs
    - server/src/p2p/identity.rs
    - server/src/p2p/behaviour.rs
    - server/src/p2p/swarm.rs
    - server/src/p2p/directory.rs
    - server/src/p2p/messages.rs
    - shared/proto/p2p.proto
  modified:
    - server/Cargo.toml
    - server/src/main.rs
    - server/src/state.rs
    - server/src/config.rs
    - server/src/lib.rs
    - server/src/routes.rs
    - server/src/ws/protocol.rs
    - server/src/channels/crud.rs
    - server/src/db/migrations.rs
    - server/src/db/models.rs
    - server/src/proto/mod.rs
    - server/build.rs
    - shared/proto/ws.proto

key-decisions:
  - "Shared tokio runtime for axum and libp2p Swarm (no isolation overhead)"
  - "Topic namespace prefix: first 16 chars of server PeerId / channel UUID"
  - "Gossipsub mesh D=4, D_lo=3, D_hi=8 (chat-tuned, not blockchain defaults)"
  - "Circuit Relay v2 limits: 30min duration, 10MB data (up from 2min/128KB defaults)"
  - "Server identity keypair stored as 32-byte Ed25519 seed in data_dir"
  - "gossipsub_max_transmit_size = 64 KiB (accommodates text + metadata)"
  - "Conservative peer scoring thresholds to avoid premature eviction"
  - "Separate port for libp2p WS (default 1985) from axum HTTP (1984)"

patterns-established:
  - "SwarmCommand/SwarmEvent mpsc channels for axum-to-swarm communication"
  - "PeerDirectory: DashMap-backed concurrent peer tracking with UNITED identity mapping"
  - "GossipEnvelope: protobuf envelope with Ed25519 signature over fields 3-7"
  - "Topic naming: {server_peer_id_prefix}/{channel_uuid}"
  - "Messages table with server_sequence for authoritative ordering"
  - "spawn_blocking for DB writes in gossipsub event consumer"

requirements-completed: []

# Metrics
duration: 23min
completed: 2026-02-26
---

# Phase 3 Plan 01: Server libp2p Node Summary

**rust-libp2p 0.56 Swarm with gossipsub, Circuit Relay v2, AutoNAT, peer directory, GossipEnvelope signing, and message persistence running alongside axum in shared tokio runtime**

## Performance

- **Duration:** 23 min
- **Started:** 2026-02-26T01:01:55Z
- **Completed:** 2026-02-26T01:25:22Z
- **Tasks:** 2
- **Files modified:** 27 (7 created, 12 modified, 6 test files updated, Cargo.lock)

## Accomplishments

- Server runs a full libp2p Swarm (gossipsub + relay + autonat + identify + dcutr + ping) in the same tokio runtime as axum
- Every gossipsub message is protobuf-encoded with Ed25519 signature verification and persisted to SQLite with server-assigned sequence numbers
- Peer directory tracks online peers, their UNITED identity, multiaddresses, channel subscriptions, and NAT type
- Channel create/delete automatically subscribes/unsubscribes gossipsub topics
- P2P config exposed in united.toml with sensible chat-tuned defaults for all gossipsub and relay parameters
- All 42 existing tests pass with the new AppState fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Server libp2p node** - `e6eec1f` (feat)
   Config, identity bridge, NetworkBehaviour, Swarm event loop, PeerDirectory, AppState integration
2. **Task 2: Gossipsub messaging** - `e74ef91` (feat)
   p2p.proto, GossipEnvelope encode/verify/persist, WS handlers, /api/p2p/info, auto topic subscribe

## Files Created/Modified

### Created
- `server/src/p2p/mod.rs` - Module declarations, re-exports
- `server/src/p2p/config.rs` - P2pConfig struct with chat-tuned defaults
- `server/src/p2p/identity.rs` - Server Ed25519 keypair load/generate/persist
- `server/src/p2p/behaviour.rs` - UnitedBehaviour (gossipsub + relay + autonat + identify + dcutr + ping)
- `server/src/p2p/swarm.rs` - SwarmBuilder, event loop, command handlers
- `server/src/p2p/directory.rs` - PeerDirectory with DashMap-backed concurrent tracking
- `server/src/p2p/messages.rs` - GossipEnvelope encode/decode/verify/persist
- `shared/proto/p2p.proto` - GossipEnvelope, MessageType, PeerDirectoryRequest/Response, PeerInfo, RegisterPeerId

### Modified
- `server/Cargo.toml` - Added libp2p 0.56 with 13 features
- `server/src/main.rs` - Wire Swarm, event consumer, startup topic subscriptions
- `server/src/state.rs` - Added swarm_cmd_tx, peer_directory, server_peer_id, libp2p_port
- `server/src/config.rs` - Added P2pConfig with generate_config_template() [p2p] section
- `server/src/lib.rs` - Added p2p module
- `server/src/routes.rs` - Added GET /api/p2p/info endpoint
- `server/src/ws/protocol.rs` - WS handlers for PeerDirectoryRequest, RegisterPeerIdRequest
- `server/src/channels/crud.rs` - Auto subscribe/unsubscribe gossipsub on channel create/delete
- `server/src/db/migrations.rs` - Migration 3: messages table with server_sequence
- `server/src/db/models.rs` - Message model
- `server/src/proto/mod.rs` - Added p2p proto module
- `server/build.rs` - Added p2p.proto to compilation
- `shared/proto/ws.proto` - Added P2P payload variants (fields 110-113)

## Decisions Made

1. **Shared tokio runtime** (not isolated): Both axum and libp2p Swarm run in the same `#[tokio::main]` runtime. Communication via mpsc unbounded channels. Rationale: both are async/tokio, isolation adds complexity with no benefit.

2. **Topic namespace: `{peer_id_prefix}/{channel_uuid}`**: First 16 chars of server PeerId as prefix, forward-compatible for multi-server future without adding full server ID overhead.

3. **Gossipsub parameters**: D=4 (not default 6), D_lo=3, D_hi=8. Chat workloads benefit from lower amplification factor. mesh_outbound_min=2 for eclipse resistance.

4. **Relay limits tuned for chat**: 30min circuits (up from 2min default), 10MB data (up from 128KB). Without these, users behind strict NATs would disconnect every 2 minutes.

5. **Conservative peer scoring**: Low penalty weights to avoid premature peer eviction during initial deployment. Can be tightened based on real-world data.

6. **Separate port for libp2p** (1985 vs 1984): Simpler than multiplexing. Both configurable in united.toml.

7. **Ed25519 signature on GossipEnvelope**: Double signing -- gossipsub signs at mesh level (MessageAuthenticity::Signed), UNITED signs the inner envelope. Inner signature survives storage and is verifiable by any peer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `macros` feature to libp2p dependency**
- **Found during:** Task 1 (compilation)
- **Issue:** `#[derive(NetworkBehaviour)]` proc macro requires `libp2p/macros` feature, which is not enabled by any of the protocol features we specified
- **Fix:** Added `"macros"` to libp2p features list in Cargo.toml
- **Files modified:** server/Cargo.toml
- **Verification:** Compilation succeeds, derive macro generates UnitedBehaviourEvent type
- **Committed in:** e6eec1f (Task 1 commit)

**2. [Rule 3 - Blocking] Updated 6 test files with new AppState fields**
- **Found during:** Task 1 (test compilation)
- **Issue:** All integration tests construct AppState directly. Adding swarm_cmd_tx, peer_directory, server_peer_id, libp2p_port broke all test compilation
- **Fix:** Added mock P2P fields (unbounded channel tx, empty PeerDirectory, placeholder peer ID) to all 6 test files' AppState construction
- **Files modified:** server/tests/{auth,ws,channels,roles,moderation,invite}_test.rs
- **Verification:** All 42 tests pass
- **Committed in:** e6eec1f (Task 1 commit)

**3. [Rule 1 - Bug] Fixed gossipsub `unsubscribe()` return type mismatch**
- **Found during:** Task 1 (compilation)
- **Issue:** `gossipsub::Behaviour::unsubscribe()` returns `bool` in libp2p 0.56, not `Result`. Research code examples showed `Result` pattern (stale).
- **Fix:** Changed `match` with `Ok(true)/Ok(false)/Err(e)` to `if/else` with `bool`
- **Files modified:** server/src/p2p/swarm.rs
- **Verification:** Compiles successfully
- **Committed in:** e6eec1f (Task 1 commit)

**4. [Rule 1 - Bug] Used `gossipsub::Behaviour::new()` instead of non-existent `new_with_metrics()`**
- **Found during:** Task 1 (compilation)
- **Issue:** Research showed `new_with_metrics()` constructor which does not exist in libp2p 0.56
- **Fix:** Used `gossipsub::Behaviour::new()` which is the actual constructor
- **Files modified:** server/src/p2p/behaviour.rs
- **Verification:** Compiles and constructs gossipsub Behaviour correctly
- **Committed in:** e6eec1f (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs)
**Impact on plan:** All fixes necessary for compilation. No scope creep. Research examples were slightly stale for some API details.

## Issues Encountered

- **Relay Config struct literal**: `relay::Config` contains `Vec<Box<dyn RateLimiter>>` fields that prevent using struct literal syntax with `..Default::default()`. Solved by constructing from `Default::default()` and overriding individual fields.
- **Ed25519 Signer trait not in scope**: `ed25519_dalek::SigningKey::sign()` requires `Signer` trait import. Fixed with explicit `use ed25519_dalek::Signer`.
- **rusqlite u64 FromSql**: SQLite integers map to i64, not u64. Used i64 for query result and cast to u64 on return.

## User Setup Required

None - no external service configuration required. P2P config has sensible defaults in united.toml.

## Next Phase Readiness

- Server libp2p node is complete: gossipsub, relay, autonat, identify, dcutr, ping all wired
- Plan 03-02 (Client libp2p node) can connect to server on port 1985 using the peer ID from /api/p2p/info
- Plan 03-03 (Dev panel) has the IPC data pipeline foundation via PeerDirectory and SwarmCommand/SwarmEvent
- All 42 existing tests continue to pass

---
*Phase: 03-p2p-networking*
*Completed: 2026-02-26*
