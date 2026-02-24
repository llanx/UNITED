# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Users communicate in real-time with full data sovereignty — no third party ever touches their content, and the community funds its own infrastructure by participating in it.
**Current focus:** Phase 1: Foundation

## Current Position

Phase: 1 of 8 (Foundation)
Plan: 3 of 6 in current phase
Status: Executing plans
Last activity: 2026-02-24 — Plan 01-03 (Server Advanced Auth) complete

Progress: [██░░░░░░░░] 5%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 27 min
- Total execution time: 1.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3/6 | 80 min | 27 min |

**Recent Trend:**
- Last 5 plans: 01-01 (19 min), 01-02 (16 min), 01-03 (45 min)
- Trend: Increasing (01-03 larger scope — TOTP + blobs + rotation + WS + Docker + tests)

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
Stopped at: Completed 01-03-PLAN.md (Server Advanced Auth)
Resume file: .planning/phases/01-foundation/01-03-SUMMARY.md
