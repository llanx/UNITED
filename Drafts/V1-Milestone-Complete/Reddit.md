# I built a self-hosted Discord alternative in ~4.5 hours of AI-assisted coding — here's how

**Subreddit:** r/selfhosted or r/rust or r/electronjs

---

I just hit v1.0 on **UNITED** (Unified Network for Independent, Trusted, Encrypted Dialogue) — a self-hosted Discord alternative where users own their data end-to-end. The entire codebase was built across 40 execution plans in ~4.5 hours of tracked AI-assisted development time.

## What it does

- **Real-time chat** with channels, categories, reactions, @mentions, unread tracking
- **E2E encrypted DMs** (X25519 + XChaCha20-Poly1305) — server never sees plaintext
- **Voice channels** via WebRTC with push-to-talk and per-user volume
- **P2P content distribution** — torrent-inspired block protocol with 5-layer cache cascade
- **Media** — image/video attachments with blurhash placeholders, adaptive grid, lightbox
- **Cryptographic identity** — Ed25519 keypairs (no email/password), BIP39 mnemonic recovery, TOTP 2FA, key rotation with 72-hour cancellation

## Stack

- **Server:** Rust (tokio + axum), SQLite, libp2p gossipsub
- **Client:** Electron + React, Zustand, Tailwind v4, libp2p, sodium-native
- **Protocol:** Protobuf over WebSocket, REST for CRUD operations

## The process

I used a structured planning framework (GSD) that breaks work into phases, researches each one, creates detailed execution plans, then hands them to AI agents. Each plan averages ~8 minutes of execution time. The full v1.0 milestone:

- 11 phases, 40 plans, 56 requirements
- All 56 requirements formally verified with code-level evidence
- Total tracked execution: ~4.5 hours
- Average plan: ~8 min (fastest: 1 min for small fixes, longest: 45 min for initial server scaffold)

The AI agents handle everything from protobuf schema design to Rust endpoint implementation to React component creation. Human involvement is primarily architectural decisions and verification.

## What's next

- Multi-client UAT testing (6 deferred items)
- Icon upload for server settings (noted as tech debt)
- Packaging and distribution
- v2.0 planning

Happy to answer questions about the architecture, the AI-assisted workflow, or self-hosting considerations.

---

*[GitHub: llanx/UNITED]*
