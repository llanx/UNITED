# Requirements: UNITED

**Defined:** 2026-02-22
**Core Value:** Users communicate in real-time with full data sovereignty — no third party ever touches their content, and the community funds its own infrastructure by participating in it.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Text Messaging

- [x] **MSG-01**: User can send and receive text messages in channels with real-time delivery via gossip propagation (<100ms to connected peers)
- [x] **MSG-02**: User can view message history by scrolling back, fetching older messages from peers or server fallback
- [x] **MSG-03**: User can format messages with markdown (bold, italic, code blocks, lists, quotes)
- [x] **MSG-04**: User can react to messages with standard Unicode emoji
- [x] **MSG-05**: User can see typing indicators when another user is composing a message in the current channel
- [x] **MSG-06**: User can see online/offline/away status for other users
- [x] **MSG-07**: User can see unread indicators showing which channels have new messages since last visit
- [x] **MSG-08**: User can @mention specific users or roles to trigger notifications
- [x] **MSG-09**: User receives desktop notifications for mentions and DM messages

### Direct Messages

- [x] **DM-01**: User can send and receive end-to-end encrypted direct messages (X25519 key exchange, only participants hold decryption keys)
- [x] **DM-02**: User can receive DMs while offline via encrypted blobs stored on the coordination server for later delivery
- [x] **DM-03**: User can see DM conversations listed separately from channel messages

### Media

- [x] **MEDIA-01**: User can upload and share files (images, video, documents, archives) in channels and DMs
- [x] **MEDIA-02**: User can see images and videos rendered inline within messages (not as download links)
- [x] **MEDIA-03**: User sees blurhash placeholders at exact aspect ratio while media loads from peers (zero layout reflow)
- [x] **MEDIA-04**: Media is chunked into content-addressed blocks and distributed across the peer swarm

### Voice

- [x] **VOICE-01**: User can join voice channels and communicate with other users via WebRTC peer-to-peer audio (2-8 simultaneous participants)
- [x] **VOICE-02**: User can mute their microphone and deafen all incoming audio
- [x] **VOICE-03**: User can see a visual indicator showing which user is currently speaking
- [x] **VOICE-04**: User can use push-to-talk as an alternative to voice activity detection

### Server Management

- [x] **SRVR-01**: Server admin can create, rename, and delete text and voice channels
- [x] **SRVR-02**: Server admin can organize channels into categories
- [x] **SRVR-03**: Server admin can create and configure roles with specific permissions (send messages, manage channels, kick/ban, admin)
- [x] **SRVR-04**: Server admin can assign roles to users
- [x] **SRVR-05**: Server admin can kick users from the server
- [x] **SRVR-06**: Server admin can ban users from the server (propagated to peers to stop relaying banned user's content)
- [x] **SRVR-07**: Server admin can configure server settings (name, icon, description)
- [x] **SRVR-08**: Server admin can generate invite links with optional expiration
- [x] **SRVR-09**: New user can join a server via invite link, which bootstraps P2P peer discovery and begins content replication

### P2P Distribution

- [x] **P2P-01**: All content is stored as content-addressed blocks (SHA-256 hashed, fixed-size chunks for media)
- [x] **P2P-02**: New messages are propagated to channel peers via libp2p gossipsub protocol
- [x] **P2P-03**: Content is fetched through a 5-layer cache cascade: L0 in-memory → L1 local SQLite/block store → L2 hot peers (active connections) → L3 DHT/swarm discovery → L4 coordination server fallback
- [x] **P2P-04**: User can configure their local storage buffer size (N GB) for seeding server content to other peers
- [x] **P2P-05**: Content is managed in priority tiers: P1 own messages (never evict) → P2 hot 24h → P3 warm 2-7 day → P4 altruistic seeding, with 7-day default TTL and LRU eviction
- [x] **P2P-06**: Coordination server acts as a fallback super-seeder, maintaining an encrypted copy of content for availability when the peer swarm is thin
- [x] **P2P-07**: User can see seeding/contribution indicators showing how much they contribute to the swarm (upload/download stats, blocks seeded)
- [x] **P2P-08**: App prefetches content predictively: channel list hover begins pulling recent messages, scroll position at 70% prefetches next batch, app launch pre-fetches top active channels
- [x] **P2P-09**: Requests are sent to multiple peers in parallel (first-responder-wins) for low-latency content fetching
- [x] **P2P-10**: Message text + thumbnails (<50KB) are inlined with gossip messages for instant rendering; full-res media is deferred and pulled on demand

### Security

- [x] **SEC-01**: User creates an identity by generating an Ed25519 keypair protected by a passphrase (Argon2id-encrypted); a 24-word mnemonic backup is displayed at creation; no email or password is stored on any server
- [x] **SEC-02**: User authenticates to servers via Ed25519 challenge-response signature; server issues JWT tokens (15min access + 7-day refresh) after successful verification
- [x] **SEC-03**: All messages are signed by the author's Ed25519 private key; receiving peers verify signatures before displaying
- [x] **SEC-04**: All content written to the local block store is encrypted with AES-256-GCM using a key derived from the user's credentials via Argon2id
- [x] **SEC-05**: DMs use per-conversation keys negotiated via X25519 key exchange; coordination server stores only encrypted blobs
- [x] **SEC-06**: All peer-to-peer communication is encrypted in transit (TLS for WebSocket, DTLS for WebRTC)
- [x] **SEC-07**: User can see encryption indicators in the UI confirming that DMs are end-to-end encrypted and channel messages are signed
- [x] **SEC-08**: Electron renderer uses strict CSP, content sanitization, contextIsolation enabled, nodeIntegration disabled
- [x] **SEC-09**: User's encrypted identity blob is stored on every server they join, enabling recovery from any server with the correct passphrase
- [x] **SEC-10**: Servers ship with TOTP two-factor authentication enabled by default (RFC 6238 compatible, admin-configurable)
- [x] **SEC-11**: User can rotate their identity key via signed rotation records broadcast to all joined servers, with a 72-hour cancellation window
- [x] **SEC-12**: User can provision a new device by scanning a QR code from an existing device (direct encrypted key transfer, no server involvement)

### Client Application

- [x] **APP-01**: App shell loads once from local cache; channel switches are instant DOM swaps via pushState (no full page reload)
- [x] **APP-02**: All P2P connections persist across channel navigation
- [x] **APP-03**: All subscribed channels receive gossip simultaneously regardless of which channel is currently viewed
- [x] **APP-04**: All media attachments declare dimensions upfront; fixed layout with zero reflow during content loading
- [x] **APP-05**: User profiles display name, avatar, and custom status text

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Community Features

- **COMM-01**: User can create threads within channel messages for focused sub-conversations
- **COMM-02**: User can edit their own messages (propagated as edit events referencing original message hash)
- **COMM-03**: User can delete their own messages (soft delete via tombstone event; peers SHOULD delete but cannot be forced)
- **COMM-04**: User can pin messages to persist them in local store beyond 7-day TTL
- **COMM-05**: User can search message history via local SQLite full-text search index
- **COMM-06**: User can see link previews/embeds for shared URLs (privacy-aware: proxy through coordination server or opt-in client-side unfurling)

### Advanced Voice

- **AVOICE-01**: User can share their screen in 1:1 or small group voice channels
- **AVOICE-02**: Voice channels support noise suppression

### Advanced P2P

- **AP2P-01**: User can opt-in as a volunteer super-seeder (always-on node with larger storage allocation, earning cosmetic rewards)
- **AP2P-02**: User can see a peer status dashboard showing swarm health, connected peers, and content availability

### Advanced Social

- **ASOC-01**: User can create group DMs with end-to-end encryption for multiple participants
- **ASOC-02**: User can verify another user's identity out-of-band via emoji or QR code key verification
- **ASOC-03**: User can see DM read receipts

### Advanced Server

- **ASRV-01**: User can set channel-level permission overrides per role
- **ASRV-02**: Server supports custom emoji uploads with storage budget awareness
- **ASRV-03**: Server supports audit log for admin actions

### Bot Ecosystem

- **BOT-01**: Server supports a UNITED-native bot API (gateway events, message CRUD, embeds)
- **BOT-02**: Discord-compatible bot API shim for porting existing Discord bots
- **BOT-03**: Server supports webhooks for external integrations

### Platform Expansion

- **PLAT-01**: Server discovery beyond invite links (directory service)
- **PLAT-02**: Mobile client (iOS/Android)
- **PLAT-03**: 1:1 video calls via WebRTC

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Server federation | Enormous complexity (see Matrix). Each server is an isolated community. |
| Platform-level content moderation | Incompatible with data sovereignty. Server admins moderate their own communities. |
| OAuth / social login | Keypair-based identity eliminates need for external auth providers entirely. |
| Email/password registration | Replaced by Ed25519 keypair identity with passphrase-encrypted local storage. See IDENTITY-ARCHITECTURE.md. |
| Nitro-style monetization | Self-hosted model has no central entity to collect payment. |
| Sticker packs | Large media assets expensive to distribute P2P. Low value relative to complexity. |
| GIF picker / Tenor/Giphy integration | Sends search queries to third parties, undermining privacy. |
| Video channels / Go Live streaming | P2P video to many viewers is unsolved at scale. Would require SFU (centralization). |
| Rich presence / activity status | Deep OS integration, app detection, API partnerships. Enormous effort for cosmetic feature. |
| Server boosting | No central authority for payments. Creates pay-to-win dynamics. |
| Vanity URLs | Requires central registry. Contradicts self-hosted model. |
| Automatic message translation | Requires sending content to external APIs. Privacy violation. |
| AI features (summarization, chatbots) | Requires sending content to LLM APIs. Privacy violation. |
| Read receipts for channels | Enormous gossip overhead. Privacy concern (surveillance of reading habits). |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1: Foundation | Complete |
| SEC-02 | Phase 1: Foundation | Complete |
| SEC-08 | Phase 9: Milestone Gap Closure | Complete |
| SEC-09 | Phase 1: Foundation | Complete |
| SEC-10 | Phase 1: Foundation | Complete |
| SEC-11 | Phase 1: Foundation | Complete |
| SEC-12 | Phase 2: Server Management | Complete |
| APP-01 | Phase 9: Milestone Gap Closure | Complete |
| SRVR-07 | Phase 1: Foundation | Complete |
| SRVR-01 | Phase 2: Server Management | Complete |
| SRVR-02 | Phase 2: Server Management | Complete |
| SRVR-03 | Phase 2: Server Management | Complete |
| SRVR-04 | Phase 2: Server Management | Complete |
| SRVR-05 | Phase 2: Server Management | Complete |
| SRVR-06 | Phase 2: Server Management | Complete |
| SRVR-08 | Phase 2: Server Management | Complete |
| SRVR-09 | Phase 2: Server Management | Complete |
| P2P-02 | Phase 3: P2P Networking | Complete |
| SEC-06 | Phase 3: P2P Networking | Complete |
| APP-02 | Phase 3: P2P Networking | Complete |
| MSG-01 | Phase 4: Real-Time Chat | Complete |
| MSG-02 | Phase 4: Real-Time Chat | Complete |
| MSG-03 | Phase 4: Real-Time Chat | Complete |
| MSG-04 | Phase 4: Real-Time Chat | Complete |
| MSG-05 | Phase 4: Real-Time Chat | Complete |
| MSG-06 | Phase 4: Real-Time Chat | Complete |
| MSG-07 | Phase 4: Real-Time Chat | Complete |
| MSG-08 | Phase 4: Real-Time Chat | Complete |
| MSG-09 | Phase 4: Real-Time Chat | Complete |
| SEC-03 | Phase 4: Real-Time Chat | Complete |
| APP-03 | Phase 4: Real-Time Chat | Complete |
| APP-05 | Phase 4: Real-Time Chat | Complete |
| DM-01 | Phase 5: Direct Messages | Complete |
| DM-02 | Phase 5: Direct Messages | Complete |
| DM-03 | Phase 5: Direct Messages | Complete |
| SEC-05 | Phase 5: Direct Messages | Complete |
| SEC-07 | Phase 5: Direct Messages | Complete |
| P2P-01 | Phase 6: Content Distribution | Complete |
| P2P-03 | Phase 6: Content Distribution | Complete |
| P2P-05 | Phase 6: Content Distribution | Complete |
| P2P-06 | Phase 6: Content Distribution | Complete |
| P2P-09 | Phase 6: Content Distribution | Complete |
| P2P-10 | Phase 6: Content Distribution | Complete |
| SEC-04 | Phase 6: Content Distribution | Complete |
| APP-04 | Phase 6: Content Distribution | Complete |
| MEDIA-01 | Phase 7: Media and Prefetching | Complete |
| MEDIA-02 | Phase 7: Media and Prefetching | Complete |
| MEDIA-03 | Phase 7: Media and Prefetching | Complete |
| MEDIA-04 | Phase 7: Media and Prefetching | Complete |
| P2P-04 | Phase 7: Media and Prefetching | Complete |
| P2P-07 | Phase 7: Media and Prefetching | Complete |
| P2P-08 | Phase 7: Media and Prefetching | Complete |
| VOICE-01 | Phase 8: Voice Channels | Complete |
| VOICE-02 | Phase 8: Voice Channels | Complete |
| VOICE-03 | Phase 8: Voice Channels | Complete |
| VOICE-04 | Phase 8: Voice Channels | Complete |

**Coverage:**
- v1 requirements: 56 total
- Mapped to phases: 56
- Unmapped: 0

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-26 after Phase 9 gap closure (SEC-08 and APP-01 verified)*
