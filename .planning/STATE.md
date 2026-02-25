# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Users communicate in real-time with full data sovereignty — no third party ever touches their content, and the community funds its own infrastructure by participating in it.
**Current focus:** Phase 2: Server Management

## Current Position

Phase: 2 of 8 (Server Management)
Plan: 0 of TBD in current phase
Status: Phase 1 complete, ready to execute Phase 2
Last activity: 2026-02-24 — Phase 1 fully complete (all 6 plans)

Progress: [██░░░░░░░░] 12%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration (GSD-tracked): 27 min
- Total execution time (GSD-tracked): 1.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan | Notes |
|-------|-------|-------|----------|-------|
| 01-foundation | 6/6 | — | — | Server track (01-01 to 01-03) GSD-tracked. Client track (01-04 to 01-06) executed manually by benzybones, reconciled retroactively. |

**Recent Trend:**
- GSD-tracked plans: 01-01 (19 min), 01-02 (16 min), 01-03 (45 min)
- Client plans (01-04, 01-05, 01-06): executed outside GSD by benzybones

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 8 phases derived from 52 v1 requirements following Foundation > Server > P2P > Chat > DMs > Content > Media > Voice dependency chain
- [Roadmap]: Voice (Phase 8) sequenced last despite only depending on Phase 3 — benefits from stable platform, architecturally independent
- [01-01]: Prost module hierarchy must match protobuf package paths (proto::united::{auth,identity,server,ws})
- [01-01]: Shared directory has own package.json for @bufbuild/protobuf type resolution
- [01-01]: Electron rebuild needs explicit --version flag (auto-detection uses system Node)
- [01-01]: Generated TypeScript protobuf files are gitignored (regenerated from buf generate)
- [01-02]: PeerIpKeyExtractor for rate limiting requires ConnectInfo<SocketAddr> on axum::serve
- [01-02]: DashMap for in-memory challenge store (60s expiry, periodic cleanup)
- [01-02]: JWT refresh tokens stored as SHA-256 hash, single-use rotation
- [01-02]: jsonwebtoken 10.3 requires explicit rust_crypto feature for CryptoProvider
- [01-02]: Setup token regenerated on restart if no users exist (hash-only storage)
- [01-03]: AES-256-GCM for TOTP secret encryption with server-generated 256-bit key (no Argon2id needed server-side)
- [01-03]: Actor-per-connection WebSocket pattern with mpsc split reader/writer
- [01-03]: WebSocket auth via ?token= query parameter (browsers cannot set custom WS headers)
- [01-03]: Dual-signature key rotation: old + new key both sign rotation payload
- [01-03]: 72-hour cancellation deadline stored as ISO 8601 timestamp (not duration)
- [01-03]: random_signing_key() helper avoids rand_core 0.6/0.9 version conflict in tests
- [Phase 2+]: Selective TDD — use TDD for REST API endpoints, auth/crypto flows, and DB queries (write integration tests against proto contracts first). Use test-after for WebSocket stateful code and UI components. Protobuf schemas are the contract, no tests needed.
- [01-06]: XChaCha20-Poly1305 for client-side encryption (not AES-256-GCM — more portable, no AES-NI dependency, 24-byte nonces)
- [01-06]: entropyToMnemonic from @scure/bip39 (NOT mnemonicToSeed which produces 512-bit PBKDF2 for HD wallets)
- [01-06]: 3-position mnemonic verification quiz before identity creation proceeds
- [01-06]: Severity-based error UX: 4001 silent refresh, 4002 redirect with explanation, 4003 full-screen ban
- [01-06]: QR code generated client-side via qrcode.react (removed qr_png from server response)
- [01-06]: Hex encoding for public keys and signatures (not base64)

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: rust-libp2p WebRTC is alpha — server must use WebSocket transport only
- [Research]: sodium-native, better-sqlite3, node-datachannel all need Electron native module rebuild pipeline from day one
- [Research]: libp2p 3.x has breaking changes between minor versions — pin at 3.1.3 and validate API before Phase 3
- [Research]: NAT traversal requires TURN relay for 20-30% of connections — budget as core infrastructure
- [Research]: Gossipsub D=6 default is too high for chat — must tune to D=3-4 for chat topics

## Session Continuity

Last session: 2026-02-24
Stopped at: Phase 1 fully reconciled. Ready to execute Phase 2.
Resume file: .planning/phases/02-server-management/02-CONTEXT.md
