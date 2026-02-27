# UNITED

**Unified Network for Independent, Trust-Based, Encrypted Dialogue**

A self-hosted, peer-to-peer Discord alternative. Chat content is distributed across users via a torrent-inspired seeding architecture, voice is peer-to-peer WebRTC, and direct messages are end-to-end encrypted. The coordination server runs on hardware as modest as a Raspberry Pi.

> **Status: v1.0** — All core features implemented. Not yet battle-tested in production.

<!-- Screenshot: main chat view with channels, messages, and voice bar -->

## Why UNITED?

- **Data sovereignty.** No third party ever touches your content. Your data lives on your machines, governed by your rules.
- **Cost distribution.** Each user contributes a configurable storage buffer (1–50 GB) to seed content. The community funds its own infrastructure by participating in it.
- **P2P without the UX tradeoff.** A 5-layer cache cascade (memory → local blocks → peers → DHT → server) and predictive prefetching make the P2P architecture invisible. Channel switches are instant. Messages arrive in real-time.

## Features

### Identity & Authentication
No passwords, no email. Identity is an Ed25519 keypair generated locally on your device. You authenticate by proving you hold the private key — your credentials never leave your machine.

- Challenge-response login (server issues challenge, client signs it)
- 24-word BIP39 mnemonic for recovery
- TOTP two-factor authentication (Google Authenticator / Authy compatible)
- Key rotation with 72-hour cancellation window
- Encrypted identity backup on every server you join

### Real-time Chat
- Text channels with server-assigned message ordering
- Markdown rendering with syntax highlighting
- Emoji reactions, @mentions with autocomplete, reply threading
- Typing indicators and presence status
- Unread badges and mention counts
- Virtualized message list for large histories

### Direct Messages
- End-to-end encrypted (X25519 ECDH key exchange)
- Server stores only opaque encrypted blobs — cannot read DM content
- Offline delivery queue (messages arrive when you reconnect)

### Voice Channels
- Peer-to-peer WebRTC audio (no server media processing)
- Push-to-talk or voice activity detection
- Per-user volume control (0–200%)
- Mute, deafen, speaking indicators
- TURN relay via coturn sidecar for NAT traversal

### Content Distribution
- Torrent-inspired content-addressed block store
- Users seed content they've seen — popular content gets faster
- 5-layer fetch cascade: memory → local → peers → DHT → server fallback
- File attachments up to 100 MB with inline image/video rendering
- Adaptive image grids, blurhash placeholders, click-to-expand lightbox
- Predictive prefetching on channel hover

### Server Management
- Roles with granular permissions (send messages, manage channels, kick, ban, admin)
- Channels and categories with drag-to-reorder
- Invite links with optional expiry and usage limits
- Kick, ban/unban with reasons
- Server settings (name, icon, description, registration mode)
- First-boot setup token — first user becomes server owner

## Architecture

```
Coordination Server (Rust)
  ├─ Auth, signaling, content index, message ordering
  ├─ Fallback super-seeder for content availability
  ├─ libp2p node (gossipsub relay, circuit relay, DCuTR)
  └─ SQLite database (8 migrations)

Desktop Client (Electron + React)
  ├─ P2P engine (js-libp2p: gossipsub + Kademlia DHT)
  ├─ Encrypted block store (content-addressed, AES-256-GCM)
  ├─ 5-layer cache cascade
  ├─ WebRTC voice engine (full-mesh, Opus 40 kbps)
  └─ 15 Zustand state slices
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Server | Rust (tokio, axum) |
| Client | Electron 40 + React 19 |
| P2P Layer | libp2p (gossipsub, Kademlia DHT) |
| Database | SQLite |
| Crypto | Ed25519, X25519, AES-256-GCM, Argon2id, HKDF |
| Voice | WebRTC (peer-to-peer, Opus) |
| Transport | WebSocket (server ↔ client) + WebRTC DataChannels (client ↔ client) |
| Serialization | Protocol Buffers (14 schemas) |

## Quick Start

### Docker (recommended)

```bash
# Clone and configure
git clone https://github.com/llanx/UNITED.git
cd UNITED

# Generate a TURN secret for voice channels
openssl rand -hex 32
# Set this secret in both turnserver.conf (static-auth-secret)
# and united.toml ([turn] shared_secret)

# Start server + TURN relay
docker-compose up
```

The server will print a **setup token** to the console on first boot. The first user to register with this token becomes the server owner.

### From Source

**Server** (requires Rust toolchain + protobuf compiler):
```bash
cd server
cargo build --release
./target/release/united-server --generate-config > ../united.toml
./target/release/united-server
```

**Client** (requires Node.js):
```bash
cd client
npm install
npm run rebuild   # rebuilds native modules for Electron
npm run dev       # development mode with hot reload
```

The server listens on port **1984** (HTTP + WebSocket) and **1985** (libp2p).

## Configuration

The server is configured via `united.toml` with layered precedence: **defaults < TOML < environment variables < CLI flags**.

Generate a template: `united-server --generate-config`

Key settings:
- `port` — server port (default: 1984)
- `registration_mode` — `"open"` or `"invite-only"`
- `[p2p]` — gossipsub tuning, relay limits
- `[blocks]` — content retention (default: 30 days), max upload size
- `[turn]` — TURN server host, port, shared secret for voice NAT traversal

Environment variables use the `UNITED_` prefix (e.g., `UNITED_PORT=1984`).

## Security Model

- **No passwords on the wire.** Authentication is challenge-response: the server never sees your private key or passphrase.
- **DMs are end-to-end encrypted.** X25519 key exchange, server stores only ciphertext.
- **Messages are Ed25519 signed.** Authorship is cryptographically verifiable.
- **Content at rest is encrypted.** Blocks use HKDF-derived keys (AES-256-GCM).
- **TOTP secrets are encrypted** in the database with a server-side key.
- **Docker runs as non-root** with a dedicated `united` user.

## Philosophy

UNITED is opinionated. These are deliberate choices, not missing features:

- **No platform-level moderation.** Server admins moderate their own communities. There is no central authority.
- **No federation** (v1). Each server is sovereign. Federation introduces complexity that undermines the P2P model.
- **No mobile client** (v1). Background P2P on iOS/Android is too restricted to deliver the full experience.
- **No OAuth or social login.** Keypair identity eliminates the need for third-party auth providers.
- **No visible reputation scores.** They always get gamed. Trust emerges from participation and shared context.
- **AGPL-3.0 forever.** If you modify UNITED and run it over a network, you must release your source code.

## License

UNITED is licensed under the [GNU Affero General Public License v3.0](LICENSE).

The code stays free forever.
