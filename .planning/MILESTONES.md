# Milestones

## v1.0 MVP (Shipped: 2026-02-27)

**Delivered:** Self-hosted Discord alternative with P2P content distribution, E2E encrypted DMs, WebRTC voice, and full data sovereignty.

**Phases completed:** 12 phases, 47 plans
**Requirements:** 56/56 v1 requirements satisfied
**Code:** ~42,000 LOC (TypeScript + Rust), 243 source files, 14 protobuf schemas
**Timeline:** 5 days (2026-02-22 to 2026-02-27), 270 commits
**Git range:** `6666c97` (docs: initialize project) to `0ce11c5` (docs(phase-12): complete phase execution and verification)

**Key accomplishments:**
1. Electron + React + Rust monorepo with cross-language protobuf contracts and typed IPC bridge
2. Channel/category CRUD, roles with permission bitflags, moderation (kick/ban), and invite-based onboarding
3. libp2p gossipsub mesh with NAT traversal, Circuit Relay v2, and persistent peer connections
4. Real-time text chat with virtualized rendering, markdown, reactions, @mentions, presence, and desktop notifications
5. End-to-end encrypted DMs with X25519 key exchange, offline delivery queue, and encryption indicators
6. Content-addressed block store with 5-layer cache cascade, tiered retention, and P2P distribution
7. Media upload/sharing with blurhash placeholders, inline rendering, lightbox, and predictive prefetching
8. WebRTC peer-to-peer voice with mute/deafen, speaking indicators, push-to-talk, and TURN relay

**Tech debt carried forward:**
- SRVR-07: Icon upload not implemented (name/description/registration_mode CRUD works)
- SEC-03: REST message path sends empty signature bytes (gossip path signs correctly)
- DM delete-for-self is ephemeral (lost on restart)
- No disk-based block verification on get_block (trusts metadata)
- Voice soft cap warning uses console.warn (should use toast)
- SEC-11 key rotation 72h cancellation has no client-side cancel UI
- 47 human verification items pending (all automated checks pass)

**Archives:**
- [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- [v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md)
- [v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md)

---

