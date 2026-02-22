# Feature Research

**Domain:** P2P encrypted chat platform / self-hosted Discord alternative
**Researched:** 2026-02-22
**Confidence:** MEDIUM (training data analysis of 10 reference products; web verification unavailable)

**Reference Products Analyzed:**
- **Centralized polished:** Discord, Guilded
- **Self-hosted/federated:** Matrix/Element, Revolt
- **P2P-native:** Keet (Holepunch), Briar, RetroShare, Jami
- **Voice-first:** Mumble, TeamSpeak

**Confidence Note:** Feature sets of these products are well-established (most 5+ years old). While I could not verify against live product pages (web tools unavailable), these feature lists are stable and well-documented. Risk of inaccuracy is low for core features, moderate for very recent additions (last 6 months).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users migrating from Discord will assume exist. Missing any of these and the product feels broken, not "different."

#### Text Messaging Core

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Text channels** | Fundamental unit of organized communication. Every reference product has this. | MEDIUM | P2P adds gossip propagation complexity. Need channel-level topic subscription. |
| **Direct messages** | Private 1:1 conversation is non-negotiable. Discord, Element, Keet, Briar all have it. | MEDIUM | E2E encryption required for DMs per project spec. Key exchange adds complexity vs plaintext. |
| **Message history / scrollback** | Users expect to scroll back through past messages. Only Briar lacks this (by design). | HIGH | This is the hardest P2P problem. Content-addressed blocks must be fetchable from peers or server fallback. The cache cascade (L0-L4) directly serves this need. |
| **Markdown formatting** | Bold, italic, code blocks, lists. Discord set this expectation. Revolt, Element all support it. | LOW | Use existing markdown parser. Restrict to safe subset (no raw HTML). |
| **Link previews / embeds** | Clicking a YouTube/Twitter link should show a preview. Discord, Guilded, Revolt all do this. | MEDIUM | Requires server-side or client-side URL unfurling. Privacy concern: unfurling leaks IP. Proxy through coordination server or let client opt-in. |
| **Reactions (emoji)** | Quick responses without cluttering chat. Discord, Element, Revolt all have it. | LOW | Small metadata updates. Gossip as lightweight events attached to message hash. |
| **File uploads** | Sharing images, documents, archives. Every chat app supports this. | HIGH | Files become content-addressed blocks distributed across the swarm. Need upload progress, thumbnail generation, and the full P2P distribution pipeline. |
| **Image/video inline display** | Media should render inline, not as download links. Discord, Element, Keet do this. | MEDIUM | Requires progressive loading, blurhash placeholders (per project spec), and media type detection. |
| **Message editing** | Users make typos. Discord, Element, Revolt allow edits. | MEDIUM | In P2P context: edit is a new event referencing original message hash. Must propagate to all peers who have the original. |
| **Message deletion** | Users want to unsay things. Discord, Element, Revolt support this. | MEDIUM | Soft delete (tombstone event) propagated via gossip. Peers SHOULD delete local copy but cannot be forced (P2P limitation users must accept). |
| **Typing indicators** | Shows conversation is active. Discord, Element have this. | LOW | Lightweight gossip event. No persistence needed. Ephemeral. |
| **User presence (online/offline/away)** | Knowing who is available. Discord, Element, Revolt show this. | LOW | Gossip-based heartbeat. Coordination server tracks last-seen for offline users. |
| **Unread indicators** | Knowing which channels have new messages. Discord does this extremely well. | MEDIUM | Requires per-channel read-state tracking. Client stores last-read message ID. Server can assist with unread counts. |
| **Notifications** | Desktop notifications for mentions and DMs. Every chat platform has this. | LOW | Electron notification API. Requires mention parsing (@user, @role, @everyone). |
| **@mentions** | Tag users/roles to get their attention. Discord, Element, Revolt support this. | LOW | Parse @username in message content. Trigger notification for mentioned user. |
| **Search** | Finding old messages. Discord, Element have full-text search. | HIGH | Requires local SQLite full-text search index. P2P challenge: can only search messages you have locally. Server index can supplement. |
| **User profiles** | Display name, avatar, about me. Every platform has this. | LOW | Stored on coordination server. Distributed via gossip for offline scenarios. |

#### Voice/Video

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Voice channels** | Core Discord feature. Guilded, Mumble, TeamSpeak, Jami all have voice. | HIGH | WebRTC P2P mesh. Works for 2-8 users. Signaling through coordination server. |
| **Mute/deafen controls** | Basic voice channel controls. Every voice platform has this. | LOW | Local WebRTC track enable/disable. Broadcast state to peers. |
| **Voice activity indicator** | See who is talking. Discord, Mumble, TeamSpeak show this. | LOW | WebRTC audio level detection. Broadcast speaking state. |
| **Push-to-talk** | Alternative to voice activity detection. Mumble, TeamSpeak, Discord support it. | LOW | Key binding that enables/disables mic track. Client-side only. |

#### Server Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Invite links** | How users join a server. Discord, Revolt, Guilded all use invite links/codes. | MEDIUM | Coordination server generates tokens. Must bootstrap P2P peer discovery for new joiners. |
| **Roles** | Organize users into groups. Discord, Revolt, Guilded, Element all have roles. | MEDIUM | Coordination server manages role assignments. Peers enforce permissions locally. |
| **Basic permissions** | Control who can send messages, join voice, manage channels. | HIGH | Permission system must be enforced by coordination server AND peers. Complex interaction matrix (role x channel x permission). |
| **Channel categories** | Group related channels. Discord, Revolt, Guilded use categories. | LOW | Metadata structure. No P2P implications. |
| **Server settings** | Name, icon, description, default channels. Every platform has this. | LOW | Coordination server manages. |
| **Kick/ban** | Remove problematic users. Every community platform has moderation. | MEDIUM | Coordination server enforces. Must propagate ban to peers so they stop relaying that user's content. |

#### Security (for a P2P/encrypted platform)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **E2E encryption for DMs** | Users choosing a privacy-focused platform expect encrypted DMs. Element, Briar, Keet, Signal all have this. | HIGH | X25519 key exchange per project spec. Key management, session handling, multi-device support. |
| **Encryption indicator** | Visual indicator that a conversation is encrypted. Element shows a shield icon. Signal shows "encrypted." | LOW | UI element. Important for trust. |
| **Transport encryption** | All peer-to-peer and client-server communication encrypted in transit. | MEDIUM | TLS for WebSocket, DTLS for WebRTC. Standard but must be enforced everywhere. |

---

### Differentiators (Competitive Advantage)

Features where UNITED can stand apart from both Discord (centralized) and existing P2P solutions (rough UX).

#### P2P-Specific (UNITED's Core Innovation)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **True data sovereignty** | Users own their data. No third party stores, reads, or governs content. Discord/Slack own everything. | HIGH | This is the whole architecture, not a feature to add. The P2P distribution layer IS this differentiator. |
| **Configurable storage buffer** | Users choose how much disk they contribute (e.g., 2GB, 10GB, 50GB). No other chat app does this. | MEDIUM | Per project spec. Unique to torrent-inspired model. Users feel agency over their contribution. |
| **Seeding / contribution indicators** | Show users how much they're contributing to the swarm. Like BitTorrent upload/download ratios. | MEDIUM | Gamification of P2P contribution. Cosmetic rewards per project spec (badges, colors). Builds community ownership. |
| **Peer status dashboard** | See who is seeding, swarm health, content availability. RetroShare has something similar but crude. | MEDIUM | Transparency about P2P network health. No centralized platform offers this because they hide infrastructure. |
| **Predictive prefetching** | McMaster-Carr-style: content loads before you ask for it. Hover prefetch, scroll-ahead, app-launch prefetch. | HIGH | Key differentiator for UX. Makes P2P feel as fast as centralized. If done well, users won't even realize content is P2P. |
| **Volunteer super-seeders** | Users can opt-in to always-on nodes with larger storage, earning cosmetic rewards. | MEDIUM | Distributes the "server" role to community. Reduces coordination server load. Unique social contract. |
| **Content-addressed block storage** | Deduplication and integrity verification built into the protocol. | HIGH | Architecture-level feature. Same content shared by multiple channels/users stored once. Efficient. |
| **Server runs on minimal hardware** | Coordination server on Raspberry Pi. Discord needs massive infrastructure. | MEDIUM | Marketing differentiator. "Your community, your hardware, your rules." |

#### UX Polish (Competing with P2P's Reputation for Bad UX)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Blurhash placeholders** | Images show blurred preview instantly while loading from peers. No layout reflow. | LOW | Per project spec. Small effort, massive perceived performance improvement. |
| **App shell architecture** | UI loads once, channel switches are instant DOM swaps. No full-page reloads. | MEDIUM | Per project spec. SPA pattern. Makes P2P latency invisible for navigation. |
| **Parallel peer fetching** | Fetch from multiple peers simultaneously, first-responder-wins. Like BitTorrent piece selection. | HIGH | Core P2P performance feature. Dramatically reduces load time for popular content. |
| **Inline critical content** | Small messages (under 50KB) gossiped immediately with the message event. No separate fetch. | LOW | Per project spec. Eliminates round-trip for typical text messages and small thumbnails. |

#### Security Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Encrypted at-rest storage** | Even if someone steals your laptop, they get encrypted blobs. Not even Discord encrypts local cache. | MEDIUM | Per project spec (AES-256-GCM with Argon2id KDF). Differentiator vs every centralized platform. |
| **Message signing** | Every message cryptographically signed by author (Ed25519). Tamper-proof. | MEDIUM | Per project spec. Neither Discord nor Revolt does this. Proves authorship. |
| **No server can read DMs** | Coordination server literally cannot decrypt DM content. Unlike Discord where the company has access. | HIGH | Architecture-level. Requires proper E2E encryption implementation. Key differentiator for privacy-conscious users. |
| **Key verification (emoji/QR)** | Verify another user's identity out-of-band. Element has this. Briar has this. | MEDIUM | Important for high-security users. Can be deferred to v1.x but builds trust. |

#### Community Features

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Threads** | Focused conversations within a channel. Discord added threads. Element has threads. | HIGH | Separate message stream linked to parent message. Must propagate in P2P context. Adds complexity to gossip. |
| **Pinned messages** | Persist important content beyond TTL. In UNITED, pinning has storage implications (bypasses 7-day TTL). | MEDIUM | Per project spec. Dual purpose: organizational AND storage retention. Unique. |
| **Discord-compatible bot API** | Reuse existing Discord bot ecosystem. No other alternative has this. Revolt has its own bot API. | HIGH | Huge value if achieved. Enormous surface area to implement. Must be ruthlessly scoped to a subset. |

---

### Anti-Features (Deliberately NOT Building)

Features that seem appealing but would undermine UNITED's core values, add unsustainable complexity, or create architectural debt.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Platform-level content moderation** | Safety concerns, legal pressure, "think of the children" | Fundamentally incompatible with data sovereignty. If a central authority can moderate, they can censor. Server admins moderate their own communities. | Server-admin moderation tools (kick, ban, delete). Each server is sovereign. |
| **Server federation** (v1) | "I want to talk to users on other servers" like Matrix | Enormous complexity. Matrix spent years on federation and it still causes UX issues (room versions, state resolution). Federation doubles every protocol surface. | Each server is an isolated community for v1. Revisit only if overwhelming demand post-launch. |
| **Mobile clients** (v1) | "I want to chat on my phone" | Mobile OS severely restricts background P2P (iOS kills background connections, Android Doze throttles network). P2P chat on mobile is half-broken by OS design. Keet and Briar both struggle with this. | Desktop-only at launch. Mobile is a v2 consideration after desktop is solid. |
| **Nitro-style monetization / premium tiers** | Revenue, sustainability | UNITED is self-hosted. Who charges whom? Introduces perverse incentives. Encourages artificial feature gating. | Self-hosted = zero SaaS revenue model. Community funds infrastructure by participating (storage/bandwidth). |
| **Custom emoji uploads** (v1) | "Discord has custom emoji" | Each custom emoji is a media asset that must be distributed across the P2P swarm. Servers with 500 custom emoji = significant storage/bandwidth for every peer. | Support standard Unicode emoji at launch. Custom emoji as a v1.x feature with storage budget awareness. |
| **Sticker packs** | "Discord and Telegram have stickers" | Same P2P distribution problem as custom emoji but larger (stickers are bigger images). Low value relative to complexity. | Defer entirely. Not a differentiator for UNITED's target audience. |
| **GIF picker / Tenor/Giphy integration** | "I want to send GIFs easily" | Integrating with Tenor/Giphy sends search queries to third parties, undermining privacy. GIFs are large, expensive to distribute P2P. | Allow GIF file uploads (user provides the file). No third-party GIF service integration. |
| **Video channels / Go Live streaming** | "Discord has streaming" | P2P video streaming to many viewers is an unsolved problem at scale. WebRTC mesh for video creates enormous bandwidth. SFU required = centralization. | Voice channels only for v1. Screen sharing for 1:1 or small groups only (WebRTC mesh). |
| **OAuth / social login** | "Let me log in with Google/Discord" | Adds dependency on external providers. Undermines self-hosted independence. Privacy concern (OAuth providers track logins). | Email/password auth. Per project spec. Self-contained. |
| **Rich presence / activity status** | "Show what game I'm playing" | Requires deep OS integration, app detection, API partnerships with game platforms. Enormous effort for cosmetic feature. | Simple custom status text. |
| **Server boosting** | Discord's monetization mechanic where users pay for server perks | No central authority to collect payment. Self-hosted model means server admin controls resources. Creates pay-to-win dynamics. | Volunteer super-seeders contribute storage/bandwidth for cosmetic rewards (organic, not paid). |
| **Vanity URLs** | "discord.gg/mycoolserver" | Requires a central registry, DNS management, abuse prevention. Contradicts self-hosted model. | Invite links with readable tokens. Server discovery via coordination server. |
| **Automatic message translation** | "Translate this message to English" | Requires calling external translation APIs (Google, DeepL), sending message content to third parties. Privacy violation. | Users can paste into their own translation tool. No built-in integration that leaks content. |
| **AI features (summarization, chatbots)** | "Summarize this conversation" | Requires sending content to LLM APIs. Privacy violation. Local LLMs are too resource-intensive for a chat client. | Out of scope entirely. Users can use their own AI tools externally. |
| **Read receipts for channels** | "See who has read each message" | Enormous gossip overhead in busy channels. Privacy concern (surveillance of reading habits). Discord doesn't even do this for channels. | Unread indicators per-channel (you know YOU haven't read it). No per-message read receipts in channels. DM read receipts are acceptable (small scale). |
| **Stories / ephemeral content** | Copying Snapchat/Instagram | Wrong paradigm for community chat. Adds content type complexity. Not what Discord users expect. | Not applicable. |

---

## Feature Dependencies

```
[Auth & User System]
    +--requires--> [Coordination Server]
    +--enables--> [User Profiles]
    +--enables--> [Roles & Permissions]
    +--enables--> [Presence / Online Status]

[P2P Transport Layer (libp2p gossipsub + WebRTC DataChannels)]
    +--requires--> [Coordination Server (signaling)]
    +--enables--> [Text Message Delivery]
    +--enables--> [Block Transfer (files/media)]
    +--enables--> [Voice Channels (WebRTC)]

[Text Channels]
    +--requires--> [P2P Transport Layer]
    +--requires--> [Auth & User System]
    +--enables--> [Threads]
    +--enables--> [Reactions]
    +--enables--> [Message Editing/Deletion]
    +--enables--> [Pinned Messages]
    +--enables--> [Search]
    +--enables--> [Unread Indicators]
    +--enables--> [Notifications]

[Content-Addressed Block Storage]
    +--requires--> [P2P Transport Layer]
    +--enables--> [File Uploads]
    +--enables--> [Image/Video Inline Display]
    +--enables--> [Message History / Scrollback]
    +--enables--> [Predictive Prefetching]

[File Uploads]
    +--requires--> [Content-Addressed Block Storage]
    +--enables--> [Image/Video Inline Display]
    +--enhances--> [Link Previews (for uploaded media)]

[Direct Messages]
    +--requires--> [E2E Encryption (X25519)]
    +--requires--> [P2P Transport Layer]
    +--requires--> [Auth & User System]
    +--enables--> [Group DMs]

[E2E Encryption]
    +--requires--> [Auth & User System (key generation at signup)]
    +--enables--> [Direct Messages]
    +--enables--> [Group DMs]
    +--enhances--> [Key Verification]

[Voice Channels]
    +--requires--> [P2P Transport Layer (WebRTC)]
    +--requires--> [Auth & User System]
    +--requires--> [Roles & Permissions]
    +--enables--> [Screen Sharing (small group)]

[Invite Links]
    +--requires--> [Coordination Server]
    +--requires--> [Auth & User System]
    +--enables--> [Server Discovery]

[Roles & Permissions]
    +--requires--> [Auth & User System]
    +--requires--> [Coordination Server]
    +--enforced-by--> [Peers (local enforcement)]
    +--enables--> [Kick/Ban]
    +--enables--> [Channel-level permissions]

[Bot API]
    +--requires--> [Text Channels]
    +--requires--> [Auth & User System]
    +--requires--> [Coordination Server (gateway)]
    +--enhances--> [Message CRUD, Embeds, Reactions]

[Predictive Prefetching]
    +--requires--> [Content-Addressed Block Storage]
    +--requires--> [Cache Cascade (L0-L4)]
    +--enhances--> [Message History]
    +--enhances--> [Image/Video Display]
    +--enhances--> [Channel Switching]
```

### Dependency Notes

- **E2E Encryption requires Auth:** Key pairs generated at account creation. Identity tied to Ed25519 keypair. Cannot retrofit encryption onto a system designed without it.
- **Threads require Text Channels:** Threads are sub-conversations within channels. Must have channel infrastructure first.
- **File Uploads require Block Storage:** The entire P2P file distribution pipeline must exist before any file can be shared.
- **Bot API requires nearly everything:** Bots interact with messages, channels, users, permissions. Should be one of the last features built.
- **Predictive Prefetching requires Cache Cascade:** Prefetching is an optimization ON TOP of the basic content fetching pipeline. Build basic fetch first, optimize later.
- **Voice requires P2P Transport:** WebRTC signaling goes through coordination server, but audio flows peer-to-peer. Transport layer must be solid first.
- **Kick/Ban requires Roles & Permissions:** Moderation actions are permission-gated. Need the permission system before moderation tools.

---

## MVP Definition

### Launch With (v1.0)

Minimum viable product -- what's needed to validate that P2P chat can match centralized UX.

- [ ] **Text channels with real-time message delivery** -- the fundamental unit. If this doesn't work smoothly, nothing else matters.
- [ ] **Direct messages with E2E encryption** -- private conversation is non-negotiable. Encryption is the whole value prop.
- [ ] **Message history / scrollback via P2P block fetching** -- users must be able to see past messages. This validates the entire cache cascade architecture.
- [ ] **File/image sharing with inline display** -- chat without images feels broken. Validates P2P content distribution.
- [ ] **Markdown formatting** -- low effort, high polish.
- [ ] **Reactions** -- low effort, high engagement.
- [ ] **Typing indicators and presence** -- low effort, makes chat feel alive.
- [ ] **Voice channels (2-8 users)** -- major Discord feature. WebRTC mesh works at this scale.
- [ ] **Mute/deafen and voice activity indicator** -- basic voice controls.
- [ ] **User profiles (display name, avatar)** -- identity basics.
- [ ] **Roles with basic permissions** -- need at minimum: admin, moderator, member.
- [ ] **Invite links** -- how users join. Must bootstrap P2P peer discovery.
- [ ] **Kick/ban** -- server admins must be able to moderate.
- [ ] **Unread indicators and notifications** -- users need to know when they've been messaged.
- [ ] **@mentions** -- channel noise management.
- [ ] **Encryption indicators** -- visual proof of security.
- [ ] **Configurable storage buffer** -- users opt into contributing. Core to P2P social contract.
- [ ] **Seeding indicators** -- show contribution. Core to P2P transparency.
- [ ] **Blurhash placeholders** -- zero-reflow media loading.

### Add After Validation (v1.x)

Features to add once core P2P chat is working and users are engaged.

- [ ] **Threads** -- add when channel conversations become noisy and users request organization.
- [ ] **Message editing** -- add once message propagation is reliable and edit semantics are clear.
- [ ] **Message deletion** -- add alongside editing. Tombstone propagation.
- [ ] **Pinned messages** (with TTL bypass) -- add when content retention becomes a user concern.
- [ ] **Link previews / embeds** -- add with privacy-conscious proxy approach.
- [ ] **Search** -- add once local SQLite index is populated and users have enough history to search.
- [ ] **Channel categories** -- add when servers grow beyond 5-10 channels.
- [ ] **Key verification (emoji/QR)** -- add for security-conscious users.
- [ ] **Push-to-talk** -- add for voice users who request it.
- [ ] **Screen sharing** (1:1 / small group) -- add once voice is stable.
- [ ] **Predictive prefetching** -- add once basic fetching works and performance data identifies bottlenecks.
- [ ] **Volunteer super-seeders** -- add once organic P2P distribution is proven.
- [ ] **Group DMs** -- add once 1:1 DMs are solid.
- [ ] **Peer status dashboard** -- add once there are enough peers to make a dashboard meaningful.
- [ ] **DM read receipts** -- small scale, acceptable privacy tradeoff for DMs.
- [ ] **Custom emoji** (with storage budget) -- add when community requests it strongly enough.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Discord-compatible bot API** -- enormous surface area. Requires stable message/channel/permission APIs first. v2 at earliest.
- [ ] **Server discovery** -- finding servers beyond invite links. Requires cross-server coordination or a directory service.
- [ ] **Server federation** -- only if overwhelming demand. Enormous complexity.
- [ ] **Mobile client** -- only after desktop is mature. Mobile P2P has fundamental OS limitations.
- [ ] **Webhooks** -- useful for integrations but requires stable HTTP API surface.
- [ ] **Noise suppression** -- WebRTC has some built-in. Dedicated noise suppression (like Krisp) requires ML models. Defer.
- [ ] **Video calls** (1:1) -- once voice is bulletproof. Adds significant bandwidth to P2P.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Text channels | HIGH | MEDIUM | P1 |
| Direct messages (E2E encrypted) | HIGH | HIGH | P1 |
| Message history / scrollback | HIGH | HIGH | P1 |
| File/image sharing | HIGH | HIGH | P1 |
| Markdown formatting | MEDIUM | LOW | P1 |
| Reactions | MEDIUM | LOW | P1 |
| Typing indicators | MEDIUM | LOW | P1 |
| User presence | MEDIUM | LOW | P1 |
| Voice channels | HIGH | HIGH | P1 |
| Mute/deafen | HIGH | LOW | P1 |
| Voice activity indicator | MEDIUM | LOW | P1 |
| User profiles | MEDIUM | LOW | P1 |
| Roles & basic permissions | HIGH | HIGH | P1 |
| Invite links | HIGH | MEDIUM | P1 |
| Kick/ban | HIGH | MEDIUM | P1 |
| Unread indicators | HIGH | MEDIUM | P1 |
| Notifications | HIGH | LOW | P1 |
| @mentions | MEDIUM | LOW | P1 |
| Encryption indicators | MEDIUM | LOW | P1 |
| Configurable storage buffer | MEDIUM | MEDIUM | P1 |
| Seeding indicators | MEDIUM | MEDIUM | P1 |
| Blurhash placeholders | MEDIUM | LOW | P1 |
| Threads | HIGH | HIGH | P2 |
| Message editing | MEDIUM | MEDIUM | P2 |
| Message deletion | MEDIUM | MEDIUM | P2 |
| Pinned messages (TTL bypass) | MEDIUM | MEDIUM | P2 |
| Link previews / embeds | MEDIUM | MEDIUM | P2 |
| Search | HIGH | HIGH | P2 |
| Channel categories | LOW | LOW | P2 |
| Key verification | MEDIUM | MEDIUM | P2 |
| Push-to-talk | LOW | LOW | P2 |
| Screen sharing | MEDIUM | HIGH | P2 |
| Predictive prefetching | HIGH | HIGH | P2 |
| Super-seeders | MEDIUM | MEDIUM | P2 |
| Group DMs | MEDIUM | HIGH | P2 |
| Peer status dashboard | LOW | MEDIUM | P2 |
| Custom emoji | LOW | MEDIUM | P2 |
| Discord bot API (subset) | HIGH | HIGH | P3 |
| Server discovery | MEDIUM | HIGH | P3 |
| Webhooks | LOW | MEDIUM | P3 |
| Video calls | MEDIUM | HIGH | P3 |
| Noise suppression | LOW | HIGH | P3 |
| Server federation | LOW | HIGH | P3 |
| Mobile client | HIGH | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add after v1.0 validates
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

### Messaging Features

| Feature | Discord | Element/Matrix | Keet | Revolt | Briar | RetroShare | UNITED Approach |
|---------|---------|----------------|------|--------|-------|------------|-----------------|
| Text channels | Yes | Rooms | Rooms | Yes | No (DM only) | Forums/channels | Yes, gossip-propagated |
| Threads | Yes | Yes | No | No | No | Forum threads | v1.x, sub-gossip streams |
| DMs | Yes | Yes | Yes | Yes | Yes | Yes | Yes, E2E encrypted |
| Group DMs | Yes | Yes | Yes | Yes | Group chat | Yes | v1.x |
| Reactions | Yes | Yes | No | Yes | No | No | Yes, lightweight events |
| Message editing | Yes | Yes | No | Yes | No | No | v1.x |
| Message deletion | Yes | Yes (redaction) | No | Yes | Yes (local) | No | v1.x, tombstone events |
| Markdown | Yes | Yes | Limited | Yes | No | Limited | Yes, safe subset |
| Link previews | Yes | Yes | No | Yes | No | No | v1.x, privacy-proxy |
| Search | Yes | Yes (decrypted local) | No | Yes | No | Yes | v1.x, local SQLite FTS |
| Pinned messages | Yes | Yes | No | Yes | No | No | v1.x with TTL bypass |
| File sharing | Yes (25MB/100MB) | Yes | Yes | Yes (20MB) | No (tiny) | Yes (unlimited) | Yes, P2P distributed |
| Custom emoji | Yes (Nitro) | No | No | Yes | No | No | v1.x with storage budget |

### Voice/Video Features

| Feature | Discord | Element/Matrix | Keet | Revolt | Mumble | TeamSpeak | Jami | UNITED Approach |
|---------|---------|----------------|------|--------|--------|-----------|------|-----------------|
| Voice channels | Yes | 1:1 / group call | Yes (P2P) | Yes (Voso) | Yes | Yes | Yes (P2P) | Yes, WebRTC mesh |
| Video calls | Yes | Yes (Jitsi/native) | Yes (P2P) | No | No | No | Yes (P2P) | v2+ |
| Screen sharing | Yes | Yes | Yes | No | No | No | Yes | v1.x (small group) |
| Noise suppression | Yes (Krisp) | No | No | No | RNNoise | No | No | v2+ |
| Push-to-talk | Yes | No | No | No | Yes | Yes | No | v1.x |
| Server-side mixing | Yes (SFU) | SFU | No (P2P) | SFU | Murmur | Server | No (P2P) | No (P2P mesh, cap ~8) |
| Max voice users | 99 (stage) | ~20 | ~8 | Unknown | Hundreds | Hundreds | ~8 | 2-8 (mesh), SFU v2+ |

### Security Features

| Feature | Discord | Element/Matrix | Keet | Briar | RetroShare | UNITED Approach |
|---------|---------|----------------|------|-------|------------|-----------------|
| E2E encryption | No | Yes (Megolm) | Yes (Hypercore) | Yes (Bramble) | Yes (OpenSSL) | Yes (X25519/AES-256) |
| Encrypted at rest | No | Optional | Yes | Yes | Yes | Yes (AES-256-GCM) |
| Message signing | No | Yes | Yes (via append-only log) | Yes | Yes (PGP) | Yes (Ed25519) |
| Key verification | No | Yes (emoji) | No | Yes (QR) | Yes (PGP fingerprint) | v1.x (emoji/QR) |
| Server can read msgs | Yes (all) | Only unencrypted rooms | No server | N/A (P2P) | N/A (P2P) | Channel: yes (index). DMs: no. |
| Open source | No | Yes | Yes | Yes | Yes | Yes |
| Self-hosted | No | Yes | N/A (P2P) | N/A | N/A | Yes (thin server) |

### Server/Community Management

| Feature | Discord | Revolt | Guilded | Element | UNITED Approach |
|---------|---------|--------|---------|---------|-----------------|
| Roles | Yes (complex) | Yes | Yes | Power levels | Yes (simplified) |
| Permission overrides | Yes (per-channel) | Yes | Yes | Per-room | v1.x |
| Invite links | Yes | Yes | Yes | Yes | Yes |
| Server discovery | Yes | No | No | Room directory | v2+ |
| Bots | Yes (extensive API) | Yes (own API) | Yes | Yes (widgets/bots) | v2+ (Discord-compat subset) |
| Webhooks | Yes | Yes | Yes | Yes | v2+ |
| Audit log | Yes | No | Yes | Partial | v1.x |
| Verification levels | Yes | No | No | No | Not planned |
| Server templates | Yes | No | No | No | Not planned |

---

## Key Observations from Competitor Analysis

1. **Discord sets the UX bar.** Any Discord alternative lives or dies by how Discord-like the core messaging experience feels. Text channels, DMs, roles, voice -- these are table stakes because Discord normalized them.

2. **P2P products sacrifice features for architecture.** Keet, Briar, and RetroShare all have significantly fewer features than Discord. They prioritize the P2P/encryption architecture over feature parity. UNITED's challenge is to NOT make this tradeoff -- match Discord features while keeping P2P architecture.

3. **Threads are becoming expected but aren't yet universal.** Discord added threads. Element has threads. But Revolt, Keet, and most P2P products don't. Threads are on the border between table stakes and differentiator. For v1, they can be deferred, but v1.x should have them.

4. **Voice is a major differentiator among alternatives.** Revolt and Element have voice but it's often buggy/limited. Keet has P2P voice. If UNITED nails P2P voice for small groups, it immediately jumps ahead of most alternatives.

5. **Search is hard in encrypted/P2P systems.** Element can only search decrypted content locally. Keet has no search. This is a known pain point. UNITED's local SQLite FTS is the right approach, but users will notice they can only search content they have locally.

6. **Bot ecosystem is Discord's moat.** The Discord bot ecosystem (music bots, moderation bots, game bots) is a massive retention driver. A Discord-compatible bot API subset is extremely high value but equally high complexity. It should be a v2 goal, not a v1 blocker.

7. **Self-hosted alternatives (Revolt, Matrix) prove there's demand.** Revolt has significant community adoption. Matrix/Element is used by governments and enterprises. The market for self-hosted chat is real and growing.

8. **No product combines P2P + Discord UX.** Keet is closest but targets small groups, not servers/communities. RetroShare has communities but crude UX. UNITED occupies an empty niche if it can deliver.

---

## Sources

- Discord feature set: Training data (HIGH confidence -- extensively documented, stable features)
- Element/Matrix features: Training data (HIGH confidence -- open protocol, well-documented)
- Keet features: Training data (MEDIUM confidence -- newer product, features may have changed)
- Revolt features: Training data (MEDIUM confidence -- active development, features evolving)
- Briar features: Training data (HIGH confidence -- stable, security-focused, minimal feature set)
- RetroShare features: Training data (MEDIUM confidence -- long-lived but niche)
- Jami features: Training data (MEDIUM confidence -- active development by Savoir-faire Linux)
- Guilded features: Training data (MEDIUM confidence -- acquired by Roblox, direction may have shifted)
- Mumble features: Training data (HIGH confidence -- mature, stable, minimal changes)
- TeamSpeak features: Training data (HIGH confidence -- mature, stable, v5 rewrite may change things)

**Note:** Web search and fetch tools were unavailable during this research session. All findings are based on training data (knowledge cutoff ~mid 2025). Feature sets of mature products (Discord, Matrix, Mumble, TeamSpeak, Briar) are unlikely to have changed significantly. Newer/actively developed products (Keet, Revolt) may have added features not captured here. Recommend verifying Keet and Revolt feature sets against current product pages before finalizing requirements.

---
*Feature research for: P2P encrypted chat platform / self-hosted Discord alternative*
*Researched: 2026-02-22*
