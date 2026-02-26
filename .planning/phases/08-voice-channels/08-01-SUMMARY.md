---
phase: 08-voice-channels
plan: 01
subsystem: voice
tags: [webrtc, protobuf, turn, hmac-sha1, dashmap, signaling, ice]

# Dependency graph
requires:
  - phase: 03-p2p-networking
    provides: "libp2p swarm, peer directory, WS connection registry"
  - phase: 01-foundation
    provides: "WS actor pattern, protobuf envelope, DashMap state pattern"
provides:
  - "Voice protobuf schemas (join/leave, SDP/ICE relay, state, speaking)"
  - "In-memory voice channel state manager (DashMap)"
  - "WS signaling relay for SDP offer/answer and ICE candidates"
  - "TURN credential generation (HMAC-SHA1 time-limited)"
  - "Voice disconnect cleanup on WS close"
  - "REST endpoint for voice participant hydration"
  - "Migration 8: max_participants column on channels"
  - "TurnConfig in united.toml"
affects: [08-voice-channels]

# Tech tracking
tech-stack:
  added: [hmac 0.12, sha1 0.10]
  patterns: [voice state DashMap, signaling relay via send_to_user, TURN HMAC-SHA1 credentials]

key-files:
  created:
    - shared/proto/voice.proto
    - server/src/voice/mod.rs
    - server/src/voice/state.rs
    - server/src/voice/signaling.rs
    - server/src/voice/turn.rs
  modified:
    - shared/proto/ws.proto
    - server/build.rs
    - server/Cargo.toml
    - server/src/proto/mod.rs
    - server/src/lib.rs
    - server/src/db/migrations.rs
    - server/src/config.rs
    - server/src/state.rs
    - server/src/main.rs
    - server/src/ws/protocol.rs
    - server/src/ws/actor.rs
    - server/src/routes.rs

key-decisions:
  - "Voice state uses DashMap (consistent with challenges, presence patterns)"
  - "TURN credentials use HMAC-SHA1 (standard coturn shared secret mechanism)"
  - "Auto-disconnect from previous voice channel on join (per CONTEXT.md)"
  - "Server removes user from voice immediately on WS close (15s timeout is client-side)"
  - "SDP/ICE relay adds sender_user_id field so target knows who sent it"
  - "WS Envelope voice fields allocated at 180-189"

patterns-established:
  - "Voice signaling relay: server relays SDP/ICE without inspecting content"
  - "Voice state cleanup on disconnect: leave_all_channels + broadcast leave events"
  - "TURN credential generation: timestamp:username with HMAC-SHA1"

requirements-completed: [VOICE-01]

# Metrics
duration: 8min
completed: 2026-02-26
---

# Phase 8 Plan 01: Voice Signaling Infrastructure Summary

**Server-side voice signaling backbone with protobuf schemas, DashMap state management, SDP/ICE relay via WS, and HMAC-SHA1 TURN credential generation**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26T22:56:16Z
- **Completed:** 2026-02-26T23:04:55Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Voice protobuf schemas define all 12 message types for join/leave, SDP/ICE signaling, state updates, and speaking events
- In-memory voice state tracks participants per channel with join/leave/disconnect cleanup and capacity enforcement
- SDP offer/answer and ICE candidate relay via existing WS connection with sender_user_id injection
- TURN credential generation using HMAC-SHA1 shared secret with configurable TTL
- Abrupt disconnect cleanup broadcasts VoiceLeaveEvent for all voice channels the user was in
- REST endpoint for voice participant hydration on reconnect

## Task Commits

Each task was committed atomically:

1. **Task 1: Voice protobuf schemas and server voice module** - `c88f223` (feat)
2. **Task 2: Migration 8, config extension, WS dispatch, route wiring** - `4d8b285` (feat)

## Files Created/Modified
- `shared/proto/voice.proto` - Voice channel protobuf messages (12 message types)
- `shared/proto/ws.proto` - WS Envelope extended with voice fields 180-189
- `server/src/voice/mod.rs` - Voice module re-exports
- `server/src/voice/state.rs` - DashMap-based voice channel state (join, leave, update, cleanup)
- `server/src/voice/signaling.rs` - SDP/ICE relay handlers, join/leave with broadcast
- `server/src/voice/turn.rs` - HMAC-SHA1 TURN credential generation, ICE server list builder
- `server/src/db/migrations.rs` - Migration 8: max_participants column on channels
- `server/src/config.rs` - TurnConfig struct, config template [turn] section
- `server/src/state.rs` - voice_state and turn_config added to AppState
- `server/src/main.rs` - VoiceState initialization, turn config passthrough
- `server/src/ws/protocol.rs` - 7 voice payload dispatch arms
- `server/src/ws/actor.rs` - Voice disconnect cleanup on WS close
- `server/src/routes.rs` - GET /api/voice/{channel_id}/participants endpoint
- `server/Cargo.toml` - hmac 0.12, sha1 0.10 dependencies
- `server/build.rs` - voice.proto added to prost-build
- `server/src/proto/mod.rs` - united.voice module and re-export
- `server/src/lib.rs` - pub mod voice registration

## Decisions Made
- Voice state uses DashMap consistent with challenges and presence patterns (lock-free concurrent access)
- TURN credentials use HMAC-SHA1 with timestamp:username format (standard coturn shared secret mechanism per RFC 5389)
- Auto-disconnect from previous voice channel on join to prevent being in multiple voice channels simultaneously (per CONTEXT.md)
- Server removes user from voice state immediately on WS close; the 15-second timeout referenced in CONTEXT.md is client-side reconnection behavior
- SDP/ICE relay messages inject sender_user_id so the target peer knows who sent the offer/answer/candidate
- WS Envelope voice fields allocated at 180-189 (within the 180-199 range reserved for Phase 8)
- max_participants is nullable INTEGER on channels (NULL for text channels, application-enforced default 8 for voice)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. TURN relay is disabled by default in the config template and can be enabled when a coturn server is deployed.

## Next Phase Readiness
- Voice signaling infrastructure complete, ready for client-side WebRTC implementation (Plan 02)
- TURN config available but disabled by default (coturn Docker sidecar deployment is Plan 03)
- All 7 voice WS payload types dispatch to handlers
- REST participant endpoint available for reconnect state hydration

## Self-Check: PASSED

All created files verified on disk. Both task commits (c88f223, 4d8b285) verified in git log.

---
*Phase: 08-voice-channels*
*Completed: 2026-02-26*
