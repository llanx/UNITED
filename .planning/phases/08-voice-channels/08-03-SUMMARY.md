---
phase: 08-voice-channels
plan: 03
subsystem: voice
tags: [react, webrtc, voice-ui, coturn, docker-compose, turn, vad, ptt, zustand]

# Dependency graph
requires:
  - phase: 08-voice-channels
    provides: "Voice protobuf schemas, WS signaling relay, TURN credentials, voice state manager, VoiceManager, AudioPipeline, SignalingClient, VoiceSlice, useVoice hook"
  - phase: 01-foundation
    provides: "WS client, IPC bridge pattern, Zustand slice pattern, preload bridge"
  - phase: 02-server-management
    provides: "ChannelList, ChannelSidebar, MainContent, channel CRUD, context menu pattern"
provides:
  - "VoiceBar: persistent bottom-left voice controls (mute, deafen, disconnect, quality icon)"
  - "VoiceParticipant: sidebar participant entry with speaking glow and per-user volume"
  - "VoiceSettings: full voice settings panel (device selection, VAD, PTT, mic test)"
  - "Voice channel click-to-join in ChannelList without changing active text channel"
  - "docker-compose.yml with united-server and coturn TURN relay sidecar"
  - "turnserver.conf template for coturn shared-secret auth"
affects: [08-voice-channels]

# Tech tracking
tech-stack:
  added: []
  patterns: [voice channel click-to-join without activeChannelId change, VoiceBar between channel list and user panel, speaking glow via CSS box-shadow transition, per-user volume context menu, coturn sidecar via docker-compose]

key-files:
  created:
    - client/src/renderer/src/components/VoiceBar.tsx
    - client/src/renderer/src/components/VoiceParticipant.tsx
    - client/src/renderer/src/components/VoiceSettings.tsx
    - docker-compose.yml
    - turnserver.conf
  modified:
    - client/src/renderer/src/components/ChannelList.tsx
    - client/src/renderer/src/components/ChannelSidebar.tsx
    - client/src/renderer/src/components/MainContent.tsx
    - client/src/renderer/src/stores/ui.ts
    - server/src/config.rs

key-decisions:
  - "Voice channel click calls joinVoiceChannel without changing activeChannelId (text and voice independent)"
  - "VoiceBar positioned between channel list and footer in ChannelSidebar (Discord-style persistent bar)"
  - "Speaking glow: CSS box-shadow 0 0 0 2px #43b581, 0 0 8px #43b581 with 150ms transition"
  - "Per-user volume via right-click context menu with 0-200% range slider"
  - "Voice Settings accessible from server dropdown menu (all users, not just admin)"
  - "coturn relay port range 49152-49252 (narrow for Docker port mapping)"
  - "VAD sensitivity live indicator monitors mic RMS at 50ms intervals on settings panel"
  - "Mic test plays back through selected output device for 5 seconds with level indicator"
  - "Soft participant cap warning (>8) shown once per session via console + state flag"

patterns-established:
  - "Voice channel click-to-join: onClick calls joinVoiceChannel, not onSelectChannel (voice is parallel to text)"
  - "VoiceBar in sidebar: renders only when voiceChannelId !== null, above user panel"
  - "Speaking glow animation: CSS transition on box-shadow for smooth 150ms on/off"
  - "Docker sidecar pattern: coturn runs alongside united-server via docker-compose"

requirements-completed: [VOICE-01, VOICE-02, VOICE-03, VOICE-04]

# Metrics
duration: 6min
completed: 2026-02-26
---

# Phase 8 Plan 03: Voice UI & Docker Summary

**Voice UI components (VoiceBar, VoiceParticipant, VoiceSettings), sidebar voice integration with click-to-join, and docker-compose with coturn TURN relay sidecar**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-26T23:22:22Z
- **Completed:** 2026-02-26T23:28:44Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- VoiceBar shows persistent controls at bottom of sidebar with connection quality icon (green/yellow/red with RTT/loss tooltip), mute/deafen/disconnect buttons
- VoiceParticipant shows inline entries under voice channels with green speaking glow (CSS box-shadow with 150ms transition), mute/deafen status icons, and right-click per-user volume slider (0-200%)
- VoiceSettings panel has full device selection, VAD sensitivity slider with live mic level indicator, PTT key config with listening mode, output volume, and 5-second mic test with playback
- ChannelList joins voice channels on click without changing active text channel; clicking different voice channel auto-disconnects first; participants listed inline under voice channels
- docker-compose.yml ships united-server and coturn sidecar with TURN relay for NAT traversal; turnserver.conf provides shared-secret auth template

## Task Commits

Each task was committed atomically:

1. **Task 1: Voice UI components and sidebar integration** - `861e392` (feat)
2. **Task 2: docker-compose.yml with coturn sidecar and config template** - `4c9bb85` (feat)

## Files Created/Modified
- `client/src/renderer/src/components/VoiceBar.tsx` - Persistent bottom-left voice controls with quality icon, mute/deafen/disconnect
- `client/src/renderer/src/components/VoiceParticipant.tsx` - Sidebar participant entry with speaking glow, status icons, right-click volume slider
- `client/src/renderer/src/components/VoiceSettings.tsx` - Full voice settings: mode selection, VAD sensitivity, PTT key, device selection, mic test
- `client/src/renderer/src/components/ChannelList.tsx` - Voice channel click-to-join, inline participant rendering, soft cap warning
- `client/src/renderer/src/components/ChannelSidebar.tsx` - VoiceBar positioned above footer, Voice Settings in dropdown menu
- `client/src/renderer/src/components/MainContent.tsx` - useVoice hook initialization, voice-settings panel routing
- `client/src/renderer/src/stores/ui.ts` - Added 'voice-settings' to activePanel union type
- `docker-compose.yml` - Docker compose with united-server and coturn services
- `turnserver.conf` - Coturn configuration template with shared-secret auth
- `server/src/config.rs` - Config template updated with detailed TURN setup instructions

## Decisions Made
- Voice channel click calls joinVoiceChannel without changing activeChannelId -- text and voice channels are independent (per CONTEXT.md: "Clicking a text channel does NOT disconnect")
- VoiceBar positioned between channel list and footer in ChannelSidebar, matching Discord's bottom-left connected panel pattern
- Speaking glow uses CSS box-shadow (0 0 0 2px #43b581, 0 0 8px #43b581) with 150ms transition for smooth on/off
- Per-user volume accessible via right-click context menu on VoiceParticipant with 0-200% range slider
- Voice Settings accessible to all users (not admin-gated) via server dropdown menu
- coturn relay port range 49152-49252 kept narrow for manageable Docker port mapping
- VAD sensitivity live indicator monitors mic RMS at 50ms intervals, displayed as a progress bar below the slider
- Mic test captures mic and plays back through selected output device for 5 seconds with live level indicator
- Soft participant cap warning (>8) shown once per session via state flag (per CONTEXT.md: "warn but allow")

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Docker compose and coturn setup is documented in comments within docker-compose.yml and turnserver.conf.

## Next Phase Readiness
- Voice feature complete: signaling (Plan 01), client engine (Plan 02), and UI + deployment (Plan 03) all shipped
- All VOICE requirements (VOICE-01 through VOICE-04) marked complete
- Phase 8 is the final phase -- project v1 milestone complete
- docker-compose.yml provides production deployment with TURN relay for NAT traversal

## Self-Check: PASSED

All created files verified on disk. Both task commits (861e392, 4c9bb85) verified in git log.

---
*Phase: 08-voice-channels*
*Completed: 2026-02-26*
