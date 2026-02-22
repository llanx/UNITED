# Pitfalls Research

**Domain:** P2P encrypted chat platform (self-hosted Discord alternative)
**Researched:** 2026-02-22
**Confidence:** MEDIUM (training data only -- WebSearch/WebFetch unavailable; however, pitfalls in P2P, distributed systems, cryptography, and Electron are well-documented in academic and engineering literature)

---

## Critical Pitfalls

These cause architectural rewrites, security breaches, or project abandonment if not addressed early.

### Pitfall 1: NAT Traversal Failure Cascade

**What goes wrong:**
Developers assume most peers can connect directly via ICE hole-punching. In reality, 10-15% of residential networks sit behind symmetric NATs (carrier-grade NAT / CGNAT) where hole-punching fails entirely. When two symmetric-NAT peers try to connect, both need TURN relay. The coordination server becomes a bandwidth bottleneck, negating the entire P2P architecture. The problem is worse than expected: CGNAT adoption is *increasing* as IPv4 exhaustion accelerates, especially in Asia, mobile hotspots, and university networks.

**Why it happens:**
Testing typically occurs on developer LANs or between machines on different home networks with full-cone NAT. Symmetric NAT failures only surface with real users behind ISPs that use CGNAT (T-Mobile, many Asian ISPs, campus networks). Developers see 95% success in testing and ship, then discover 30-40% of real connections need relay because the failure is pairwise: if *either* peer is symmetric NAT, the pair may need TURN.

**How to avoid:**
- Budget for TURN relay from day one. Treat it as core infrastructure, not fallback. Estimate 20-30% of peer connections will need relay in production.
- Use libp2p's AutoNAT service to classify each peer's NAT type at connection time. Peers behind symmetric NAT should preferentially connect to public/relay-capable peers.
- Implement libp2p Circuit Relay v2 (time-limited, traffic-limited relays) so that well-connected peers can volunteer as relay nodes, distributing TURN load.
- Consider deploying multiple TURN/relay servers geographically distributed, not a single coordination server doing relay duty.
- Cap per-relay bandwidth and implement relay admission control so one heavy user does not exhaust relay capacity.

**Warning signs:**
- Connection establishment times exceeding 5 seconds for some peers
- Certain users consistently unable to send/receive media
- TURN server bandwidth growing faster than user count
- Geographic clusters of connection failures (e.g., all users in a country with CGNAT)

**Phase to address:**
Phase 1 (P2P foundation). NAT traversal strategy must be baked into the connection layer from the start. Retrofitting relay infrastructure is extremely disruptive.

---

### Pitfall 2: Gossipsub Message Storm Amplification

**What goes wrong:**
Gossipsub amplifies every published message to D peers (default mesh degree = 6), who each forward to their D peers. In a channel with 1000 subscribers, a single message is transmitted approximately `D * log(N)` times across the network. With high message volume (active chat channels producing 10+ messages/second), bandwidth consumption per peer scales multiplicatively. Peers on residential connections (5-10 Mbps upload) saturate their upstream bandwidth, causing cascading disconnections that trigger mesh repair, which generates *more* control traffic, creating a death spiral.

**Why it happens:**
Gossipsub was designed for blockchain/IPFS where message rates are low (1-2 messages/second network-wide). Chat applications in active servers generate orders of magnitude more messages. Default gossipsub parameters (D=6, D_lo=4, D_hi=12) are tuned for these low-rate scenarios. Nobody tunes them for chat until the network is already on fire.

**How to avoid:**
- Reduce mesh degree aggressively for chat topics: D=3 or D=4 for text channels, D_lo=2, D_hi=6. Accept slightly higher latency for much lower bandwidth.
- Implement message batching: aggregate messages over 50-100ms windows and publish a single batch rather than individual messages. This dramatically reduces gossip overhead.
- Use gossipsub v1.1 peer scoring to penalize peers that forward duplicate or excessive traffic. Set `MessageDeliveriesWeight` to throttle flood publishers.
- For channels with >100 concurrent peers, consider a hierarchical gossip topology: split into sub-meshes with bridge peers, or use the coordination server as a fan-out point.
- Implement per-topic bandwidth budgets on each peer. If a channel exceeds its budget, gracefully degrade (batch more aggressively, prune mesh degree).
- Critically: inline only small messages (<50KB as specified). Large content (images, files) must be gossiped as CID references, with the actual blocks fetched on-demand.

**Warning signs:**
- Per-peer upload bandwidth exceeding 1 Mbps during normal chat activity
- Message delivery latency increasing over time (mesh congestion)
- Frequent GRAFT/PRUNE control messages in gossipsub logs
- Peers with residential connections disconnecting during activity spikes

**Phase to address:**
Phase 1/2 (gossip layer design). The gossipsub parameters and batching strategy must be established during initial P2P layer implementation. Changing gossip topology later requires network-wide upgrades.

---

### Pitfall 3: Message Ordering Illusion in Distributed Chat

**What goes wrong:**
Developers assume gossip-delivered messages arrive in the same order at all peers. They do not. Gossipsub provides best-effort delivery with no ordering guarantees. Two messages sent 50ms apart by different users may arrive in different orders at different peers. Without a total ordering mechanism, users in the same channel see different conversation flows, react to messages that other users have not seen yet, and threads become incoherent. The PROJECT.md specifies "message ordering" as a coordination server responsibility, but the design has messages propagating via gossip *before* server ordering confirmation, creating a consistency gap.

**Why it happens:**
In centralized chat (Discord, Slack), the server assigns monotonic IDs and all clients see the same order. P2P gossip has no central sequencer. Developers often implement "just use timestamps" ordering, which fails because: (a) client clocks drift, (b) two messages with the same timestamp need a tiebreaker, (c) a malicious or misconfigured client can send messages with arbitrary timestamps.

**How to avoid:**
- Use the coordination server as the authoritative ordering service (as PROJECT.md intends). Server assigns a monotonic sequence number per channel. Messages propagate via gossip for speed but are not considered "confirmed" until the server assigns their position.
- Implement optimistic display: show gossip-received messages immediately in a "pending" state, then reorder when server confirmation arrives. If reordering is needed, animate the shift rather than jumping (reduces disorientation).
- Use Lamport timestamps or vector clocks as a secondary ordering mechanism for when the server is temporarily unreachable. This provides causal ordering (if A causes B, A appears before B) even without total ordering.
- Never use wall-clock timestamps as the primary ordering key. Use them only for display ("2:34 PM") not for sequencing.
- Design the message store to handle out-of-order inserts from the start. Inserting a message between two existing messages must be efficient (do not use auto-increment row IDs as the ordering key).

**Warning signs:**
- Users reporting "I saw the reply before the question"
- Thread displays that differ between two peers viewing the same channel
- Message IDs that are not monotonic in the database
- Race conditions in reaction counts (reacting to a message that has not been ordered yet)

**Phase to address:**
Phase 1 (message data model) and Phase 2 (gossip integration). The message model must support server-assigned ordering from day one. Retrofitting ordering onto a timestamp-based model is a full rewrite.

---

### Pitfall 4: E2E Encryption Key Management Complexity Explosion

**What goes wrong:**
DM encryption with X25519 key exchange is straightforward for two parties. Group DMs and encrypted channels introduce a complexity explosion: adding a member requires re-encrypting the channel key for all participants, removing a member requires generating a *new* channel key and re-encrypting all *future* messages (forward secrecy), and key rotation for large groups (50+ members) produces O(N) key distribution messages per rotation. Developers either implement a naive scheme that does not handle member removal securely, or implement a correct scheme that makes group operations painfully slow.

**Why it happens:**
Matrix/Olm (Megolm) solved this with "sender ratchet" sessions: each sender has one ratchet, receivers only need to track sender ratchets. But even Megolm took years to get right and still has edge cases (key backup, cross-signing, device verification). Developers underestimate the state machine complexity: each peer must track key material for every conversation, handle missed key distribution messages, and deal with peers who were offline during key rotation.

**How to avoid:**
- For v1, limit E2E encryption to DMs and small group DMs (max 50 members). Do not E2E encrypt channels. Channel messages are signed (Ed25519) and encrypted at rest, which is the PROJECT.md design -- stick with this.
- Use a Megolm-like sender-ratchet scheme for group DMs rather than inventing a custom protocol. The sender generates a session key, ratchets it forward on each message, and distributes the initial key to each member via pairwise X25519.
- Implement key distribution as a separate, reliable delivery path through the coordination server (not via gossip). Key distribution messages must be durably stored and delivered in order.
- Handle member removal by creating a new sender session (new ratchet) and distributing to remaining members. Old messages remain readable with old keys; new messages use new keys.
- Do NOT attempt Double Ratchet (Signal protocol) for group chats. It requires pairwise ratchets for every pair of members, producing O(N^2) state. The sender-ratchet model is O(N).
- Build a key verification UX (safety numbers / key fingerprints) from the start. Without verification, users have no way to detect MITM attacks on key exchange.

**Warning signs:**
- Group DM creation time scaling linearly (or worse) with member count
- Users reporting "cannot decrypt message" errors after group membership changes
- Key material database growing unboundedly
- No plan for device verification or key backup in the design docs

**Phase to address:**
Phase 2 (encryption layer). Cryptographic protocol design must happen before any DM implementation. Changing crypto protocols after users have message history is extremely painful (must maintain backward-compatible decryption).

---

### Pitfall 5: Discord API Surface Area Trap

**What goes wrong:**
The project specifies "Discord-compatible bot API (subset -- gateway events, message CRUD, embeds)." In practice, every bot that a server admin wants to use touches a different subset of the API. A moderation bot needs audit logs, role management, and ban APIs. A music bot needs voice channel connection and audio streaming. A webhook bot needs webhook endpoints. The "subset" keeps growing until the project is spending 60% of development time on API compatibility instead of core P2P features. This is the single most likely scope trap for this project.

**Why it happens:**
Discord's API has ~200 endpoints, ~50 gateway events, and complex permission/intent systems. "Compatibility" is binary from a bot's perspective: either the bot works or it does not. There is no graceful degradation. Developers start with "just message CRUD" and discover that the first bot they want to support also needs `GUILD_MEMBER_UPDATE`, `MESSAGE_REACTION_ADD`, role checking, and rate limiting -- each one pulling in more surface area.

**How to avoid:**
- Define a UNITED-native bot API first. Design it for the P2P architecture (e.g., bots as peers, gossip-delivered events). Do not start with Discord compatibility.
- Offer a Discord API compatibility shim as a separate adapter layer, clearly marked as "best-effort, subset only." Document exactly which endpoints/events are supported.
- Pick 3-5 specific, popular bots (e.g., a moderation bot, a utility bot, a fun bot) and implement exactly the API surface they need. This is a tractable goal; "general Discord compatibility" is not.
- Implement a bot SDK for UNITED-native bots that is simple enough that bot developers prefer writing native bots over porting Discord bots.
- Defer the Discord compatibility shim to Phase 4+ at the earliest. Core P2P functionality must be solid first.

**Warning signs:**
- Sprint planning where more than 30% of tasks are "API compatibility"
- The compatibility API endpoint count exceeding 30 without the core chat features being complete
- Discussions about implementing Discord's permission/intent bitfield system
- Community requests for "just one more endpoint" becoming a pattern

**Phase to address:**
Phase 4+ (bot ecosystem). Must be explicitly deferred. If it creeps into earlier phases, it will consume the project. The UNITED-native bot API should come in Phase 3; Discord shim much later.

---

### Pitfall 6: Content Availability Collapse With Few Peers

**What goes wrong:**
The torrent-inspired content distribution model assumes a healthy swarm. In practice, a small UNITED server (5-20 users) may have 0-3 peers online at any given time. When the user who uploaded an image goes offline and no other peer has cached it, the content is simply unavailable. The 7-day TTL compounds this: content ages out of peer caches, and with no seeders, it vanishes permanently. Users experience a platform where old messages reference images/files that return "content not found" -- a deeply unsatisfying experience that feels broken, not decentralized.

**Why it happens:**
BitTorrent content availability works because popular torrents have hundreds of seeders. A 10-person chat server is the opposite extreme. Developers test with always-on dev machines and do not simulate realistic peer churn (users who open the app for 30 minutes, then close it for 8 hours).

**How to avoid:**
- The coordination server MUST be a reliable fallback super-seeder for all content, at least for small servers. The "thin server" aspiration is correct architecturally, but the server must store encrypted blocks as a liveness guarantee. Otherwise, the first user experience of "image not found" kills adoption.
- Implement eager replication: when content is uploaded, immediately push to at least 3 peers AND the server. Do not wait for demand-driven fetching.
- The super-seeder volunteer system is critical for medium servers (20-100 users). Implement it early, not as a nice-to-have.
- Pin popular/recent content automatically (not just user-initiated pins). Content referenced in the last 7 days with >N views should be auto-replicated to the server.
- Design the UI to never show a broken image or "content not found" for recent content (<30 days). If the content truly cannot be found, show a "requesting from network..." spinner with timeout, then "content unavailable -- [request re-seed]" button.
- Implement content health monitoring: track replication factor per block. Alert when blocks drop below minimum replication (e.g., 2 copies).

**Warning signs:**
- Content fetch latency exceeding 2 seconds for blocks that should be cached
- Block replication factor averaging below 2 in a server with <20 users
- Users uploading images that are unavailable the next day
- Server storage growing faster than expected (because it is the only reliable seeder)

**Phase to address:**
Phase 2 (content distribution layer). Content availability strategy must be proven with realistic peer churn before adding more features on top. This is the make-or-break UX problem for the entire P2P architecture.

---

### Pitfall 7: Electron Memory Leak via Unreleased References

**What goes wrong:**
Electron apps (especially chat apps with long-running sessions) accumulate memory through: (a) DOM nodes from rendered messages that are never removed from the document, (b) IPC listeners registered but never unregistered, (c) Node.js buffers from P2P block transfers that are referenced in closures, (d) React component state for channels the user is no longer viewing. Discord's Electron client famously consumes 500MB-1GB+ RAM. Without aggressive memory management, UNITED will too -- and UNITED has additional memory pressure from libp2p peer connections, gossipsub state, and the block cache.

**Why it happens:**
JavaScript's garbage collector cannot reclaim objects that are still referenced. In a chat app, the natural pattern is to keep all messages in memory for scrollback. Combined with React's tendency to hold state trees, IPC message queues, and P2P connection objects, memory grows monotonically. Developers do not notice because they restart the app frequently during development.

**How to avoid:**
- Implement message virtualization from day one. Only render messages visible in the viewport plus a small buffer (e.g., react-window or @tanstack/virtual). This caps DOM node count regardless of channel history size.
- Move all P2P networking (libp2p, block cache) into a separate process (Electron utility process or worker thread). This isolates P2P memory from renderer memory and allows independent garbage collection.
- Implement a memory budget for the in-memory block cache (L0 in the cache cascade). Use an LRU eviction policy with a configurable cap (default: 256MB). Monitor with `process.memoryUsage()`.
- Audit IPC listeners on every channel switch. Use a cleanup pattern (AbortController or explicit removeListener) for all event subscriptions.
- Run Chrome DevTools memory profiling weekly during development. Set a regression target: the app must not exceed 400MB RSS after 8 hours of continuous use.

**Warning signs:**
- RSS memory growth of >10MB/hour during normal use
- Renderer process memory exceeding 300MB
- UI jank (dropped frames) correlating with garbage collection pauses
- Users reporting "the app gets slow after a few hours"

**Phase to address:**
Phase 1 (application shell). The virtualization and process isolation architecture must be established in the initial app shell. Retrofitting virtualization onto a "render everything" chat view is a significant rewrite.

---

### Pitfall 8: DHT Bootstrap Cold-Start Death

**What goes wrong:**
Kademlia DHT requires bootstrap nodes to join the network. A new UNITED server has exactly one known node: the coordination server. If the coordination server is the only bootstrap node and it restarts (or is briefly unreachable), all peers lose their DHT routing table and cannot discover each other. Even when the server is available, the DHT routing table for a 10-peer network is nearly empty, making content discovery via DHT unreliable (queries often return no results because the keyspace is too sparse).

**Why it happens:**
DHT performance scales with network size. IPFS's DHT works because it has millions of nodes. A single UNITED server's DHT has 5-50 nodes. Kademlia's routing table structure (k-buckets organized by XOR distance) means that with 20 peers, most k-buckets are empty, and lookups frequently fail or time out. Developers test with a handful of nodes, see it "work" sometimes, and do not realize the failure rate is 30-50%.

**How to avoid:**
- Do NOT rely on DHT for core operations in small-to-medium servers. Use it only as a last resort (L3 in the cache cascade, as designed).
- The coordination server should maintain a full peer registry and content index. Peers query the server first for content location, then fall back to DHT only for rare or very old content.
- Implement a peer exchange (PEX) protocol: when two peers connect, they exchange their known peer lists. This builds connectivity without DHT.
- For DHT bootstrap, hardcode the coordination server as bootstrap AND have peers cache their last-known peer list to disk. On restart, bootstrap from both the server and cached peers.
- Set aggressive DHT query timeouts (2-3 seconds) and fall back to server-assisted discovery quickly. Do not let DHT queries block the UI.
- Consider skipping Kademlia DHT entirely for v1 and using the coordination server's content index + direct peer queries. Add DHT in a later phase when the network is larger.

**Warning signs:**
- DHT `findProviders` calls timing out more than 30% of the time
- Content discovery taking >3 seconds via DHT
- Peers unable to find each other after server restart
- DHT routing table size averaging <10 entries per peer

**Phase to address:**
Phase 1 (peer discovery). The discovery strategy must be server-assisted-first with DHT as enhancement, not DHT-first with server fallback. This is an architectural decision that affects every subsequent layer.

---

### Pitfall 9: Forward Secrecy Gaps in Offline Message Delivery

**What goes wrong:**
End-to-end encrypted DMs require both parties to exchange ephemeral keys for forward secrecy. When the recipient is offline, there is no one to complete the key exchange. Messages encrypted with a static key (or the last-known session key) do not have forward secrecy: compromising that key exposes ALL offline-delivered messages, not just one. The PROJECT.md mentions "encrypted blobs for offline delivery" but does not specify how forward secrecy is maintained. This is the exact gap that makes or breaks the security model.

**Why it happens:**
Signal solved this with "prekeys" -- the server stores a bundle of one-time ephemeral public keys uploaded by each user. Senders consume a prekey for each new session, ensuring forward secrecy even for offline recipients. But prekeys have their own pitfalls: they must be replenished (users who are offline for a long time run out), and if the server is malicious it can substitute its own prekeys (enabling MITM). Developers either skip prekeys (losing forward secrecy) or implement them incorrectly (creating MITM vulnerabilities).

**How to avoid:**
- Implement a prekey system. Each user uploads 100 one-time X25519 keypairs to the coordination server. Senders consume one prekey per new session, establishing forward-secret sessions even for offline recipients.
- Implement a "last resort" signed prekey (a semi-static key that is used when one-time prekeys are exhausted). This provides weaker forward secrecy (compromise exposes all messages until next key rotation) but is better than static keys.
- The server must notify users when their prekey supply is low (<20 remaining) so the client can upload more.
- Store offline messages as encrypted blobs on the coordination server, encrypted to the consumed prekey. Delete blobs after delivery confirmation.
- Implement "safety number" comparison so users can verify they are not being MITM'd via server-substituted prekeys.

**Warning signs:**
- No prekey count monitoring in the system
- Offline messages all encrypted with the same key
- No mechanism for users to verify each other's identity keys
- Security audit revealing that offline message compromise exposes more than one session

**Phase to address:**
Phase 2 (encryption protocol design). The prekey system must be designed alongside the DM encryption protocol. It cannot be added later without breaking backward compatibility with existing encrypted conversations.

---

### Pitfall 10: IPC Bridge as Architecture Bottleneck

**What goes wrong:**
Electron's security model (contextIsolation, no nodeIntegration) means all communication between the renderer (React UI) and the Node.js backend (libp2p, block store, SQLite) must cross the IPC bridge via `contextBridge`/`ipcRenderer`. In a chat app with P2P networking, this bridge carries: every incoming message, every block fetch result, every peer state change, every typing indicator, every presence update. The bridge becomes the central bottleneck. Serialization/deserialization overhead for large payloads (blocks, message batches) introduces latency. Synchronous IPC calls (`ipcRenderer.sendSync`) block the renderer.

**Why it happens:**
Developers start with simple IPC for a few operations and it works fine. As P2P features are added, the IPC message rate grows from 10/second to 1000/second. Each message is JSON-serialized crossing the bridge. Binary data (encrypted blocks) must be base64-encoded or transferred as ArrayBuffer, adding overhead. The architecture becomes "everything goes through IPC" and performance degrades gradually.

**How to avoid:**
- Never use `ipcRenderer.sendSync`. All IPC must be async.
- Batch IPC messages: collect message updates, presence changes, and block notifications into batches sent at 60Hz (every 16ms) rather than individually.
- Use `MessagePort` (Electron's `MessageChannelMain`) for high-throughput data streams (block transfers, message streams). MessagePort uses structured clone (transferable objects) which avoids JSON serialization overhead.
- Move libp2p into a utility process (`utilityProcess` in Electron) communicating with the main process via MessagePort, not the main process itself. The main process should handle only window management and IPC routing.
- Implement a shared memory buffer (SharedArrayBuffer) for the block cache if possible, avoiding IPC for block reads entirely.
- Profile IPC message rates in development. Set a ceiling of 500 IPC messages/second and batch everything above that threshold.

**Warning signs:**
- UI jank (dropped frames) when multiple channels are active
- IPC message rate exceeding 200/second as measured by Electron DevTools
- Main process CPU usage >30% (it should be near-idle; compute belongs in utility processes)
- Block transfers visibly slower through IPC than in direct Node.js benchmarks

**Phase to address:**
Phase 1 (application architecture). The process model (main, renderer, utility) and IPC patterns must be established in the app shell. Changing the process model later requires restructuring every IPC call site.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store messages in memory instead of SQLite during development | Faster iteration, no schema management | Lose all messages on restart; message ordering logic not tested against persistent store | Never in phases beyond prototype |
| Skip message virtualization ("render all messages") | Simpler initial chat UI | Memory grows unboundedly; must rewrite chat view later | Never -- virtualize from day one |
| Single-process Electron (everything in main process) | Simpler architecture, easier debugging | Main process blocks on crypto/libp2p; renderer freezes | Phase 1 prototype only, must split by Phase 2 |
| Hardcoded gossipsub parameters | Faster initial setup | Cannot tune per-channel; storms in active channels | Phase 1 only; parameterize before multi-channel |
| "Just use timestamps" for message ordering | No server dependency for ordering | Message order diverges across peers; impossible to fix once users have data | Never -- server-assigned ordering from day one |
| Skip TURN relay infrastructure | Avoid server bandwidth costs | 20-30% of peer connections fail silently | Never -- TURN is required infrastructure |
| Global encryption key for group DMs (no per-sender ratchet) | Simpler key management | Removing a member does not revoke access to future messages; security theater | Phase 1 prototype only; must fix before any real user data |
| Inline large media in gossip messages | Simpler content pipeline | Gossip bandwidth explodes; network becomes unusable in media-heavy channels | Never -- CID references for content >50KB |

## Integration Gotchas

Common mistakes when connecting components of this system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| js-libp2p in Electron renderer | Running libp2p in the renderer process, competing with UI for CPU/memory | Run libp2p in a utility process; expose a thin API to the renderer via MessagePort |
| SQLite via better-sqlite3 in Electron | Using synchronous better-sqlite3 calls on the main process thread, blocking IPC | Use better-sqlite3 in a worker thread, or use the async sqlite3 binding; never block the main thread with DB queries |
| WebRTC in Electron | Assuming Chromium's WebRTC stack handles all NAT traversal automatically | Chromium WebRTC still requires STUN/TURN server configuration; must provide ICE server list; must handle ICE failure gracefully |
| sodium-native in Electron | sodium-native native addon not matching Electron's Node.js ABI version | Use electron-rebuild for sodium-native; test on every Electron version bump; consider libsodium-wrappers (pure JS) as fallback |
| React state and gossip events | Updating React state on every gossip message (causes render per message) | Buffer gossip events in a queue; flush to React state at 60Hz via requestAnimationFrame; use immutable updates |
| Content-addressed blocks and SQLite index | Storing block metadata in SQLite but blocks as flat files; forgetting to handle the case where one exists without the other | Use SQLite transactions that write metadata and block files atomically (write file first, then insert row; delete row first, then delete file) |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full mesh WebRTC voice (every peer connects to every other peer) | CPU spikes, audio crackling, dropped connections | Limit to 10 peers per mesh; show "too many participants" beyond that; plan SFU for larger calls | >8 participants (O(n^2) connections) |
| Gossipsub with default parameters for active channels | Bandwidth saturation on residential connections, cascading disconnects | Reduce D to 3-4 for chat topics, batch messages, implement per-topic bandwidth budgets | >50 concurrent chatters or >5 msgs/sec |
| Loading entire channel message history into memory | Memory grows with channel age; 100K messages = 200MB+ in memory | Virtual scrolling + SQLite-backed pagination; keep only visible window + buffer in memory | >10K messages per channel |
| Single-threaded crypto operations (Ed25519 sign/verify on every message) | UI freezes during burst message delivery; signing blocks the send pipeline | Offload crypto to a worker thread or utility process; batch-verify signatures | >20 messages/second requiring verification |
| Fetching blocks sequentially from peers | Slow content loading; user sees spinner for seconds | Parallel fetch from multiple peers (first-responder-wins as designed); implement speculative prefetch | Any media-heavy channel |
| Unthrottled peer discovery / DHT queries | Network spam, peer connection churn, elevated CPU | Rate-limit discovery to 1 query/10s per topic; cache peer lists for 60s; use exponential backoff | >30 peers in a server |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Reusing X25519 ephemeral keys across sessions | Compromise of one session exposes all sessions using that key; destroys forward secrecy | Generate fresh ephemeral keypairs per session; use prekey bundles for offline sessions |
| Trusting peer-supplied message timestamps for ordering | Malicious peer can reorder conversation history, inject messages "in the past" | Use server-assigned sequence numbers as authoritative order; display peer timestamps as advisory only |
| No signature verification on gossiped messages | Impersonation attacks -- any peer can forge messages from any user | Verify Ed25519 signature on every message before display; drop unsigned/invalid messages; report forging peers |
| Storing encryption keys in Electron's localStorage | Electron's localStorage is a plain JSON file on disk; trivial to extract | Use OS keychain (keytar / Electron safeStorage API) for key material; encrypt local key store with user-derived key (Argon2id) |
| No rate limiting on gossip message publishing | A single peer can flood a channel, consuming all peers' bandwidth and storage | Implement gossipsub v1.1 peer scoring; rate-limit message acceptance per peer per topic; temporarily ban excessive publishers |
| Coordination server as trusted key distribution point without verification | Server can MITM key exchanges by substituting its own public keys | Implement out-of-band key verification (safety numbers); allow users to pin trusted keys; warn on key changes |
| Shipping Electron without CSP or with overly broad CSP | XSS in rendered message content can access Node.js APIs or IPC | Strict CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`; sanitize all user content with DOMPurify before render |
| Not validating block integrity on fetch | Corrupted or malicious blocks served by peers; cache poisoning | Verify SHA-256 hash of every fetched block matches the requested CID; reject mismatches; ban peers serving bad blocks |

## UX Pitfalls

Common user experience mistakes in P2P chat platforms.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing raw P2P connection state to users ("connecting to 3/7 peers...") | Users feel the platform is broken/slow; they do not care about peer counts | Hide P2P mechanics entirely. Show "connected" or "reconnecting..." only. Peer count in developer/settings panel, not in main UI |
| "No peers available" error when content cannot be fetched | Users think the platform is broken; they have no action to take | Show "loading..." with timeout, then "content unavailable -- this may become available when more members are online" with a retry button |
| Empty state on first server join (no messages, no peers) | New users think the platform is dead; churn immediately | Pre-seed with a welcome message from server admin; show onboarding content; display "Invite friends to get started" rather than empty channel |
| Visible message reordering after server confirmation | Disorienting -- messages jump around as ordering is confirmed | If reordering is needed, use a subtle animation. Better: delay display by 100-200ms to allow server ordering to arrive before render |
| Connection setup taking 3-5 seconds on app launch | Users compare to Discord (instant) and conclude UNITED is slow | App shell architecture (instant UI); show cached content from SQLite immediately; connect to peers in background; never block UI on peer connections |
| Showing encryption indicators on every message | Visual noise; users become blind to them | Show encryption status per conversation (lock icon in header), not per message. Show warnings only when encryption state changes |
| Requiring manual peer management (add peer IP, configure relay) | Only power users can set up; violates "general audience" target | Fully automatic peer discovery. Zero configuration. Invite links handle bootstrap. Settings panel for power users only |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Message delivery:** Often missing delivery confirmation -- verify that senders know when a message has been received by at least one peer and ordered by the server (read receipts, delivery ticks)
- [ ] **Offline message delivery:** Often missing durability -- verify that offline messages survive server restart (persist to disk, not just in-memory queue)
- [ ] **Group DM encryption:** Often missing key rotation on member removal -- verify that a removed member cannot decrypt messages sent after removal
- [ ] **File sharing:** Often missing resume-on-reconnect -- verify that a half-downloaded file resumes from where it left off when a peer reconnects (content-addressed chunks enable this if implemented)
- [ ] **Voice channels:** Often missing onaudioended handling -- verify that audio continues when a peer briefly disconnects and reconnects (ICE restart, not full renegotiation)
- [ ] **Block storage:** Often missing garbage collection -- verify that blocks with zero references (orphaned by deleted messages) are eventually cleaned up
- [ ] **Invite links:** Often missing expiry and rate limiting -- verify that invite tokens expire and cannot be brute-forced
- [ ] **Presence system:** Often missing "last seen" timeout -- verify that presence status changes to "offline" when a peer disconnects unexpectedly (crash, network loss) rather than remaining "online" indefinitely
- [ ] **Search:** Often missing search over encrypted content -- verify that local search indexes are built from decrypted content and encrypted at rest (cannot search server-side in E2E encrypted channels)
- [ ] **Moderation:** Often missing moderation for P2P-delivered content -- verify that a "delete message" command actually propagates block deletion to all peers who cached the content, not just removes it from the local UI

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Message ordering divergence across peers | MEDIUM | Implement server-side "rebase" -- server publishes canonical ordering; peers reconcile local state against it; UI smoothly reorders |
| Gossip bandwidth storm | LOW | Deploy parameter update via coordination server (reduce D, increase batch window); peers apply on next connection |
| Content availability collapse | HIGH | Backfill server super-seeder from any peer that has the content; requires crawling all peers and re-indexing; implement "health check" endpoint |
| Memory leak in Electron | MEDIUM | Add memory monitoring (process.memoryUsage) with auto-restart when threshold exceeded; fix leak; deploy update |
| Encryption key compromise (pre-shared key leaked) | HIGH | Rotate all group keys immediately; notify all members; re-encrypt forward; cannot recover past messages (forward secrecy means they are already exposed) |
| DHT bootstrap failure | LOW | Push updated bootstrap peer list via coordination server; peers cache and retry; manual override in settings |
| NAT traversal regression | MEDIUM | Deploy additional TURN servers; update ICE server configuration via coordination server; implement connection quality telemetry |
| Bot API scope creep consuming development time | MEDIUM | Freeze API surface; document supported endpoints; redirect requests to "UNITED-native bot" approach; publish migration guide |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| NAT traversal failure cascade | Phase 1 (P2P foundation) | Test with simulated symmetric NAT (iptables MASQUERADE); measure connection success rate; must exceed 95% with relay |
| Gossipsub message storm | Phase 1-2 (gossip layer) | Load test with 50+ simulated peers, 10 msgs/sec; measure per-peer bandwidth; must stay under 500Kbps upload |
| Message ordering divergence | Phase 1 (message model) | Run 5 concurrent senders on 10 peers; verify all peers converge to identical message order within 2 seconds |
| E2E encryption key management | Phase 2 (crypto protocol) | Add/remove group members; verify removed member cannot decrypt new messages; verify key distribution for offline members |
| Discord API scope creep | Phase 3+ (bot API) | Define API surface in a spec document before writing code; hard limit of 20 endpoints for v1; refuse scope additions without trade-off analysis |
| Content availability collapse | Phase 2 (content layer) | Simulate 80% peer churn (4 of 5 peers offline); verify all content <7 days old is still retrievable within 5 seconds |
| Electron memory leaks | Phase 1 (app shell) | Automated memory regression test: launch app, simulate 8 hours of chat activity, assert RSS <400MB |
| DHT cold start | Phase 1 (peer discovery) | Start a fresh server with 1 peer; verify peer can discover content indexed by server without DHT; verify DHT queries do not block UI |
| Forward secrecy gaps | Phase 2 (crypto protocol) | Send messages to offline recipient; verify each message uses a unique prekey; verify prekey replenishment |
| IPC bottleneck | Phase 1 (app architecture) | Benchmark IPC throughput: 1000 messages/second of 1KB payloads must complete without frame drops in renderer |
| Sybil attacks on content network | Phase 3 (security hardening) | Simulate attacker creating 50 fake peers; verify content integrity via hash verification; verify gossipsub scoring penalizes suspicious peers |
| Voice mesh scaling | Phase 2 (voice channels) | Test with 2, 5, 8, 12 participants; measure CPU and audio quality; enforce hard limit at the degradation point |

## Sources

- Training data knowledge of distributed systems, P2P networking, and cryptography (MEDIUM confidence -- well-established domain knowledge, but not verified against 2026-current sources due to WebSearch/WebFetch unavailability)
- libp2p gossipsub v1.1 specification (known from training, structure and parameters verified via protocol design knowledge)
- Signal Protocol / Megolm design patterns for E2E encryption in group messaging (well-documented in academic literature)
- Electron security and performance best practices (documented in Electron's official security checklist and performance guides)
- BitTorrent and IPFS content distribution mechanics (foundational P2P knowledge)
- Matrix/Element post-mortems on E2E encryption complexity (Megolm implementation challenges are well-documented)
- Keet/Holepunch design decisions for P2P chat (known from public announcements and architecture discussions)
- WebRTC NAT traversal behavior and TURN relay requirements (documented in IETF RFCs and WebRTC implementer experience)
- Discord API surface area analysis (Discord developer documentation and bot ecosystem patterns)

**Note on confidence:** WebSearch and WebFetch were unavailable during this research session. All findings are based on training data knowledge of well-established distributed systems and P2P networking principles. The pitfalls documented here are structural and architectural in nature -- they do not change rapidly. However, specific library versions, API changes, and ecosystem shifts since mid-2025 could not be verified. Recommend validating libp2p-specific claims (js-libp2p/rust-libp2p interop status, gossipsub defaults) against current documentation during phase-specific research.

---
*Pitfalls research for: UNITED -- P2P encrypted chat platform*
*Researched: 2026-02-22*
