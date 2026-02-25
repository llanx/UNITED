# Phase 3: P2P Networking - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a libp2p mesh so peers discover each other via the coordination server, connect over encrypted transports (even through NAT), and exchange messages over gossipsub topics. P2P connections persist across channel navigation. No chat UI — this is the networking foundation that Phase 4 builds on.

Requirements: P2P-02, SEC-06, APP-02

</domain>

<decisions>
## Implementation Decisions

### Developer Observability — Dev Panel
- Full debug panel with two sections: **Peers** (connected peer list with ID, connection type direct/relayed, latency, NAT type) and **Gossipsub** (subscribed topics, message count per topic, last received timestamp, delivery latency)
- Activated via **Ctrl+Shift+D** keyboard shortcut
- Renders as a **floating overlay** (draggable, does not affect main layout)
- **Live auto-refresh** via push events from main process (~1-2s updates). Zero overhead when panel is closed (no events sent to renderer)
- Includes **3 test actions**: send test message to a gossipsub topic, ping a specific peer (shows RTT), force reconnect to mesh
- **Evolves into user-facing feature**: Build a proper IPC data pipeline for P2P stats now. Dev panel consumes it with raw UI. In v2 (AP2P-02), a polished user-facing panel replaces the raw UI but uses the same data pipeline. Ships in all builds (hidden behind shortcut), not stripped from production
- The data pipeline is the investment — the dev panel UI is throwaway, the IPC channel is permanent

### Peer Discovery
- **Server as active directory**: Coordination server continuously tracks which peers are online (via existing WebSocket connections) and responds to "who's in this channel?" queries. Instant discovery — no DHT complexity
- Rationale: UNITED's server already tracks WebSocket connections. Peer list per channel is a simple query. DHT adds enormous complexity with minimal benefit at self-hosted community scale (5-100+ users)

### Connection Lifecycle
- **No hard connection limit**: Gossipsub mesh parameters (D=3-4 per topic) naturally cap per-client connections through mesh degree. No artificial ceiling on total connections
- Scalability to large communities is a priority — server admin should have controls for tuning P2P parameters (mesh degree, etc.)
- **Gossipsub v1.1 peer scoring** enabled: mesh self-optimizes by tracking which peers deliver messages quickly/reliably. High-quality peers get prioritized, slow/unreliable peers get pruned
- **Reconnection strategy — hybrid**: Auto-reconnect with exponential backoff (1s → 2s → 4s → max 30s) for gossipsub mesh peers (active message delivery pipeline). Lazy/on-demand reconnection for non-mesh peers. After ~2 min of failed reconnection, query server directory for a replacement peer

### Channel Subscription Model
- **Subscribe to ALL joined channels at startup**: Every joined channel gets a gossipsub topic subscription immediately. Switching channels is purely a UI operation — zero network activity
- Satisfies APP-02 (persistent connections) and APP-03 (all channels receive gossip simultaneously)
- With D=3-4 and natural peer overlap across channels, a user in 20 channels needs ~30-50 unique peer connections

### Server Downtime Resilience
- **Graceful degradation**: When the coordination server goes down, existing P2P connections and gossipsub mesh continue working. Messages flow via gossip with Lamport timestamp ordering
- No new peer discovery during downtime (server required for that), but established connections are unaffected
- **Ordering reconciliation on server return**: Clients submit unconfirmed messages to server for sequence number assignment. Server assigns final ordering based on Lamport timestamps + arrival order. Clients reorder if needed (rare for short downtimes)

### Claude's Recommendation
- **NAT traversal strategy** — Research and planner to determine: TURN relay infrastructure, Circuit Relay v2, AutoNAT classification. Pitfalls research recommends budgeting for 20-30% of connections needing relay
- **Gossipsub tuning parameters** — Research to determine exact values for: mesh degree (D=3-4 range), D_lo, D_hi, message batching window, per-topic bandwidth budgets. Pitfalls research warns against default D=6 for chat
- **WebRTC DataChannel configuration** — Claude to determine: SCTP parameters, DTLS settings, ICE candidate gathering strategy

</decisions>

<specifics>
## Specific Ideas

- Dev panel should feel like a real tool, not an afterthought — it's the primary way to verify Phase 3 works since there's no chat UI yet
- The IPC data pipeline for P2P stats is the key architectural investment — raw dev panel UI is secondary
- "An important purpose for the program is being able to host a large number of users, if there is a need for it" — no artificial limits on connections or peer count

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-p2p-networking*
*Context gathered: 2026-02-24*
