# Phase 6: Content Distribution - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Content-addressed block store with P2P resolution, tiered retention, encrypted local storage, and server super-seeder fallback. All content is stored as SHA-256 hashed blocks. Content resolves through a 5-layer cache cascade (memory → local store → hot peers → DHT/swarm → server fallback). Small content (<50KB) is inlined with gossip; larger content is referenced and pulled on demand. Media attachments declare dimensions upfront for zero-reflow layout.

Phase 7 (Media and Prefetching) handles file uploads, inline media rendering, blurhash, seeding indicators, and predictive prefetching. This phase builds the underlying block pipeline that Phase 7 consumes.

</domain>

<decisions>
## Implementation Decisions

### Storage budget & eviction
- Default storage budget: 5 GB on fresh install
- User-configurable via a settings slider in the app (range e.g. 1-50 GB), showing current usage vs. budget
- Silent LRU eviction — no notifications, no popups. When budget is full, oldest/least-used blocks in lower tiers are quietly evicted. Content re-fetches from peers/server if needed later.
- P1 tier (never evict) includes: messages the user authored AND DMs received by the user. DMs are protected because in E2E encryption, the sender and recipient are the only ones who can decrypt — evicting a received DM risks permanent loss.
- Warm tier TTL is user-configurable alongside the storage slider (e.g. 3-30 days)
- When budget and TTL conflict: budget wins. TTL is best-effort, labeled "Keep content for X days (space permitting)". Disk budget is the hard limit.

### Content availability states
- While fetching from peers: shimmer placeholder at exact content dimensions (consistent with Phase 1 loading pattern)
- Progressive timeout for peer resolution:
  - 0-3 seconds: shimmer placeholder
  - 3-15 seconds: switch to "Fetching from network..." text within the placeholder
  - After 15 seconds: show "Content unavailable" error at original content dimensions with a centered icon (broken image for media, generic for other content) and a "Retry" button
- Unavailable state preserves original dimensions — zero reflow per APP-04
- Retry button triggers a full 5-layer cascade retry (same code path as initial fetch, same progressive timeout). L0-L2 checks are essentially free and catch the case where a peer reconnected since the first attempt.

### Server retention scope
- Server retention TTL: 30 days by default, configurable by admin in `united.toml`
- Server acts as super-seeder for the configured retention window. After TTL expires, blocks are purged. Content only lives on peers who still have it.
- Server stores channel content blocks encrypted at rest using content-derived keys (HKDF from SHA-256 content hash). Prevents casual disk browsing without requiring key distribution infrastructure. Anyone who knows the content hash (i.e., authorized peers who received the gossip reference) can derive the decryption key.
- DM blocks are stored with full E2E encryption (X25519 per Phase 5 design) — a stronger guarantee than content-derived keys.

### Inline vs. deferred boundary
- **Message text + thumbnails under 50KB:** Inlined with gossip messages for instant rendering
- **Link previews:** Sender's client fetches OG metadata (title, description, thumbnail) at compose time and includes it in the gossip payload if total stays under 50KB. All recipients get instant link previews without N-fetch fan-out to the external URL.
- **Images over 50KB:** Gossip message includes block reference (hash + dimensions) plus a micro-thumbnail (~100px JPEG, <5KB). Recipients see a blurry preview instantly while the full image loads from peers.
- **Non-image files (PDFs, documents, archives) over 50KB:** Metadata only inlined — filename, size, MIME type. Renders a clean file attachment card immediately with name + size + type icon + download trigger. No thumbnails for non-image files.

### Claude's Discretion
- Block chunking strategy for large files (fixed-size chunks, content-defined chunking, etc.)
- Exact HKDF parameters for content-derived encryption keys
- Memory cache (L0) sizing and eviction policy
- LRU eviction implementation details (tracking access times, cleanup scheduling)
- Exact micro-thumbnail generation parameters (quality, dimensions)
- File type icon set for attachment cards
- Argon2id parameters for local block store encryption key derivation

</decisions>

<specifics>
## Specific Ideas

- Progressive timeout pattern (shimmer → status text → unavailable) gives users continuous feedback about what's happening — avoid dead-feeling gray rectangles during P2P resolution
- The settings slider for storage budget should show a visual usage bar that makes it clear how much of the budget is consumed
- TTL slider labeled "Keep content for X days (space permitting)" — transparent that budget is the hard limit
- Micro-thumbnails for images bridge the gap between "message arrives" and "full image loads from peers" — especially important when fetches take several seconds via DHT

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-content-distribution*
*Context gathered: 2026-02-25*
