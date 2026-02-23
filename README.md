# U.N.I.T.E.D.

**Unified Network for Independent, Trusted, Encrypted Dialogue**

A self-hosted Discord alternative where voice is peer-to-peer and all chat content (messages, images, video) is distributed across users via a torrent-inspired seeding architecture with predictive prefetching.

> **Status: Early Development** — Project planning complete, implementation starting.

## Why UNITED?

- **Data sovereignty.** No third party ever touches your content. Your data lives on your machines, governed by your rules.
- **Cost distribution.** Each user contributes a configurable storage buffer to seed content. The community funds its own infrastructure by participating in it. The coordination server runs on hardware as modest as a Raspberry Pi.
- **P2P without the UX tradeoff.** Aggressive multi-layer caching and predictive prefetching make the P2P architecture invisible. Channel switches are instant. Messages arrive in real-time.

## Architecture

```
Thin Coordination Server (Rust)
  → Auth, signaling, content index, message ordering
  → Fallback super-seeder for content availability

Thick Client (Electron + React)
  → P2P engine (libp2p gossipsub + Kademlia DHT)
  → Encrypted block store (content-addressed, AES-256-GCM)
  → 5-layer cache cascade (memory → local → peers → DHT → server)
  → WebRTC peer-to-peer voice
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Server | Rust (tokio, axum) |
| Client | Electron + React |
| P2P Layer | libp2p (gossipsub, Kademlia DHT) |
| Database | SQLite |
| Encryption | libsodium (AES-256-GCM, X25519, Ed25519, Argon2id) |
| Voice | WebRTC (peer-to-peer) |
| Transport | WebSocket (server) + WebRTC DataChannels (P2P) |

## License

UNITED is licensed under the [GNU Affero General Public License v3.0](LICENSE).

This means: if you modify UNITED and make it available over a network, you must release your source code under AGPL-3.0. The code stays free forever.
