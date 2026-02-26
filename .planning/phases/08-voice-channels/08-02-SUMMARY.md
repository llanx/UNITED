---
phase: 08-voice-channels
plan: 02
subsystem: voice
tags: [webrtc, web-audio, rtcpeerconnection, analysernode, gainnode, uiohook-napi, ptt, zustand, ipc]

# Dependency graph
requires:
  - phase: 08-voice-channels
    provides: "Voice protobuf schemas, WS signaling relay, TURN credentials, voice state manager"
  - phase: 01-foundation
    provides: "WS client, IPC bridge pattern, Zustand slice pattern, preload bridge"
  - phase: 04-real-time-chat
    provides: "WS event forwarding pattern (chat-events.ts), protobuf envelope decode"
provides:
  - "VoiceManager: full-mesh WebRTC connection lifecycle with ICE queueing"
  - "AudioPipeline: Web Audio API routing with per-user volume, VAD, deafen"
  - "SignalingClient: IPC-backed voice WS message send/receive"
  - "voice-events.ts: protobuf envelope decoder for 8 voice event types"
  - "PTT module: uiohook-napi global keyboard hook with keydown/keyup"
  - "VoiceSlice: Zustand state for participants, mute, deafen, mode, quality"
  - "useVoice hook: VoiceManager/AudioPipeline/SignalingClient lifecycle"
  - "Voice IPC handlers: protobuf WS forwarding for all voice messages"
  - "Preload bridge: voice.* namespace + onVoiceEvent + onPttState"
  - "ipc-bridge types: VoiceParticipant, VoiceEvent, VoiceMode, ConnectionQuality"
affects: [08-voice-channels]

# Tech tracking
tech-stack:
  added: [uiohook-napi]
  patterns: [full-mesh WebRTC with lexicographic offer/answer, Web Audio pipeline with per-peer GainNode/AnalyserNode, protobuf WS signaling relay via IPC, global keyboard hook PTT]

key-files:
  created:
    - client/src/renderer/src/voice/VoiceManager.ts
    - client/src/renderer/src/voice/AudioPipeline.ts
    - client/src/renderer/src/voice/SignalingClient.ts
    - client/src/main/ws/voice-events.ts
    - client/src/main/ipc/voice.ts
    - client/src/main/voice/ptt.ts
    - client/src/renderer/src/stores/voice.ts
    - client/src/renderer/src/hooks/useVoice.ts
  modified:
    - client/src/main/ipc/channels.ts
    - client/src/main/index.ts
    - client/src/preload/index.ts
    - client/src/renderer/src/stores/index.ts
    - shared/types/ipc-bridge.ts
    - client/package.json

key-decisions:
  - "Lexicographic user_id comparison for offer/answer role prevents duplicate WebRTC connections"
  - "ICE candidate queueing until setRemoteDescription avoids race condition (Pitfall 3)"
  - "Opus max bitrate set to 40kbps after connection established via sender.setParameters"
  - "15s disconnect timeout before removing peer from participant list (per CONTEXT.md)"
  - "Default PTT key: backtick/grave (UiohookKey.Backquote) -- top-left keyboard, common PTT default"
  - "Voice settings persisted to localStorage (mode, sensitivity, devices, volumes)"
  - "Deafen implies mute per CONTEXT.md: toggling deafen on also mutes, unmuting also undeafens"
  - "Per-user volume 0-200% via GainNode (gain.value = volume/100)"
  - "Voice WS messages encoded as protobuf binary via create() + toBinary() in IPC handlers"
  - "PTT key state broadcast from main process to all renderer windows via IPC push"

patterns-established:
  - "Voice signaling: renderer -> IPC -> main -> protobuf encode -> WS binary"
  - "Voice event forwarding: WS binary -> main fromBinary -> IPC push -> renderer signaling client"
  - "Audio routing: MediaStreamSource -> GainNode -> AnalyserNode -> masterGain -> destination"
  - "Speaking detection: 50ms setInterval polling AnalyserNode RMS for local and remote peers"
  - "Stats polling: 2s interval polling RTCPeerConnection.getStats() for quality metrics"
  - "Global hotkey: uiohook-napi keydown/keyup with pttActive flag to prevent repeat keydown events"

requirements-completed: [VOICE-01, VOICE-02, VOICE-03, VOICE-04]

# Metrics
duration: 8min
completed: 2026-02-26
---

# Phase 8 Plan 02: Voice Client Engine Summary

**Full-mesh WebRTC voice engine with Web Audio pipeline, PTT via uiohook-napi, Zustand voice state, and protobuf WS signaling bridge**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26T23:09:48Z
- **Completed:** 2026-02-26T23:18:44Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- VoiceManager handles full-mesh WebRTC lifecycle with lexicographic offer/answer roles, ICE candidate queueing, Opus 40kbps bitrate, and 15s disconnect timeout with auto-reconnect
- AudioPipeline routes all audio through Web Audio API with per-user GainNode (0-200%), AnalyserNode for VAD speaking detection, master gain for deafen, and output device selection
- SignalingClient wraps all voice IPC calls for WS message send/receive with typed event callbacks
- Push-to-talk via uiohook-napi global keyboard hook with keydown/keyup tracking (default: backtick key)
- VoiceSlice stores all voice state in Zustand with localStorage persistence for settings
- useVoice hook manages VoiceManager/AudioPipeline/SignalingClient lifecycle and WS event wiring
- Complete IPC bridge: 11 voice channel constants, 2 push events, preload voice.* namespace, type definitions

## Task Commits

Each task was committed atomically:

1. **Task 1: Voice engine (VoiceManager, AudioPipeline, SignalingClient) and WS event handling** - `6914c43` (feat)
2. **Task 2: Voice IPC, PTT, Zustand store, hooks, and preload bridge** - `d08e62b` (feat)

## Files Created/Modified
- `client/src/renderer/src/voice/VoiceManager.ts` - Full-mesh WebRTC connection manager with ICE queueing, Opus bitrate, stats, speaking detection
- `client/src/renderer/src/voice/AudioPipeline.ts` - Web Audio API routing: mic capture, per-user volume, VAD, deafen, output device
- `client/src/renderer/src/voice/SignalingClient.ts` - IPC-backed send/receive for all voice WS message types
- `client/src/main/ws/voice-events.ts` - Protobuf envelope decoder forwarding 8 voice event types to renderer
- `client/src/main/ipc/voice.ts` - Voice IPC handlers: protobuf WS forwarding, PTT control, mic permission
- `client/src/main/voice/ptt.ts` - Global keyboard hook for push-to-talk via uiohook-napi
- `client/src/renderer/src/stores/voice.ts` - VoiceSlice: participants, mute/deafen, mode, quality, volumes
- `client/src/renderer/src/hooks/useVoice.ts` - VoiceManager/AudioPipeline lifecycle and WS event wiring
- `client/src/main/ipc/channels.ts` - Added 11 voice IPC constants + 2 push event constants
- `client/src/main/index.ts` - Registered voice handlers and voice event listener
- `client/src/preload/index.ts` - Added voice.* namespace + onVoiceEvent + onPttState
- `client/src/renderer/src/stores/index.ts` - Added VoiceSlice to root store
- `shared/types/ipc-bridge.ts` - Voice types and UnitedAPI voice section
- `client/package.json` - Added uiohook-napi dependency

## Decisions Made
- Lexicographic user_id comparison determines offer/answer role (smaller ID sends offer) -- prevents duplicate WebRTC connections
- ICE candidates queued in pendingCandidates Map per peer until setRemoteDescription succeeds -- avoids Pitfall 3 race condition
- Default PTT key is backtick/grave (UiohookKey.Backquote) -- top-left keyboard, rarely used in typing, common PTT default
- Voice settings persisted to localStorage instead of SQLite -- lightweight, renderer-only, no IPC round-trip needed
- Deafen implies mute per CONTEXT.md -- toggling deafen on forces mute, unmuting forces undeafen
- Voice WS messages encoded as protobuf binary via create(Schema) + toBinary in main process IPC handlers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. uiohook-napi installs pre-built native binaries.

## Next Phase Readiness
- Voice client engine complete, ready for UI implementation (Plan 03)
- All WebRTC connection management, audio routing, and state management in place
- VoiceSlice provides all state needed for voice UI: participants, speaking, mute/deafen, quality
- useVoice hook manages the complete lifecycle -- UI just needs to call joinVoiceChannel/leaveVoiceChannel

## Self-Check: PASSED

All created files verified on disk. Both task commits (6914c43, d08e62b) verified in git log.

---
*Phase: 08-voice-channels*
*Completed: 2026-02-26*
