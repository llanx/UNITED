---
phase: 08-voice-channels
verified: 2026-02-26T23:45:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Join a voice channel with two clients and confirm P2P audio works"
    expected: "Both users hear each other in real-time with sub-300ms latency"
    why_human: "WebRTC P2P audio requires live network traversal and getUserMedia — cannot verify programmatically"
  - test: "Toggle mute and confirm microphone is silenced locally"
    expected: "Remote peers stop receiving audio immediately; local mic indicator goes dark"
    why_human: "MediaStreamTrack.enabled toggling and its effect on remote audio requires live session"
  - test: "Speaking glow appears on correct participant avatar"
    expected: "Green ring animates on speaker's avatar, disappears within 150ms of silence"
    why_human: "AnalyserNode RMS threshold and timing depends on real audio input"
  - test: "Press backtick in PTT mode and speak"
    expected: "Audio transmits only while key held; releases cleanly on keyup"
    why_human: "uiohook-napi global hook requires live Electron main process and keyboard input"
  - test: "Join voice channel from behind NAT, verify connection with TURN relay"
    expected: "ICE negotiation succeeds using coturn relay; audio flows"
    why_human: "NAT traversal requires live network topology and a running coturn server"
---

# Phase 8: Voice Channels Verification Report

**Phase Goal:** Users can join voice channels and talk to each other with peer-to-peer audio that feels as responsive as centralized alternatives
**Verified:** 2026-02-26T23:45:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server tracks which users are in which voice channels via in-memory state | VERIFIED | `server/src/voice/state.rs`: `VoiceState` wrapping `Arc<DashMap<String, VoiceChannelState>>`. `join_channel`, `leave_channel`, `get_participants`, `leave_all_channels` all implemented. |
| 2 | Server relays SDP offer/answer and ICE candidates between peers without inspecting content | VERIFIED | `server/src/voice/signaling.rs`: `handle_voice_sdp_offer`, `handle_voice_sdp_answer`, `handle_voice_ice_candidate` relay payloads via `send_to_user` with `sender_user_id` injected. Content not inspected. |
| 3 | Server generates time-limited TURN credentials using shared secret HMAC-SHA1 | VERIFIED | `server/src/voice/turn.rs`: `generate_turn_credentials` uses `HmacSha1` with `{timestamp}:{username}` format. `get_ice_servers` builds ICE list with STUN fallback + conditional TURN. |
| 4 | Voice channel join returns participant list and ICE server configuration | VERIFIED | `server/src/voice/signaling.rs` `handle_voice_join`: sends `VoiceJoinResponse` with `participants` and `ice_servers` fields populated from DB + TURN generation. |
| 5 | Voice channel has configurable max_participants (default 8, nullable for text channels) | VERIFIED | `server/src/db/migrations.rs` Migration 8: `ALTER TABLE channels ADD COLUMN max_participants INTEGER`. `state.rs` `join_channel` enforces hard limit, soft cap at 8 returns `quality_warning`. |
| 6 | Client can join a voice channel and establish WebRTC peer connections with existing participants | VERIFIED | `VoiceManager.ts` `joinChannel`: captures local mic, creates `RTCPeerConnection` per existing participant, uses lexicographic `shouldOffer` rule. ICE candidate queueing via `pendingCandidates` map. |
| 7 | Client can mute microphone and deafen all incoming audio with immediate local effect | VERIFIED | `AudioPipeline.ts` `muteLocalMic`: toggles `track.enabled` on local stream. `deafen`: sets `masterGain.gain.value = 0`. `voice.ts` store `toggleMute`/`toggleDeafen` enforce mutual implication. |
| 8 | Client detects speaking state via AnalyserNode RMS and broadcasts to other participants | VERIFIED | `AudioPipeline.ts` `isSpeaking`/`getLocalRMS`: compute RMS via `getFloatTimeDomainData`. `VoiceManager.ts` `startSpeakingDetection`: 50ms setInterval polling, calls `signaling.sendSpeaking` on state change. |
| 9 | Client supports push-to-talk via uiohook-napi global hotkey with keydown/keyup events | VERIFIED | `client/src/main/voice/ptt.ts`: imports `uIOhook, UiohookKey` from `uiohook-napi`. `startPTT` registers keydown/keyup handlers with `pttActive` flag preventing repeat keydown. Broadcasts `PUSH_PTT_STATE` to renderer. |
| 10 | User can click a voice channel in the sidebar to join immediately with no confirmation | VERIFIED | `ChannelList.tsx` `handleClick`: when `isVoice && onJoinVoice`, calls `onJoinVoice()` (which is `joinVoiceChannel(ch.id)` from store). No confirmation dialog. Voice and text channels are independent (activeChannelId not changed). |
| 11 | docker-compose.yml ships coturn as a sidecar with TURN relay for NAT traversal | VERIFIED | `docker-compose.yml`: `coturn` service using `coturn/coturn:4.8` image with STUN/TURN ports 3478/5349 and relay range 49152-49252. `united-server` `depends_on: coturn`. |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `shared/proto/voice.proto` | Voice channel protobuf messages | VERIFIED | 12 message types: VoiceJoinRequest, VoiceJoinResponse, VoiceLeaveRequest, VoiceLeaveEvent, VoiceSdpOffer, VoiceSdpAnswer, VoiceIceCandidate, VoiceStateUpdate, VoiceSpeakingEvent, VoiceParticipant, VoiceParticipantJoinedEvent, IceServer. |
| `server/src/voice/state.rs` | In-memory voice channel state | VERIFIED | `VoiceState` wrapping `Arc<DashMap<String, VoiceChannelState>>`. Full CRUD: `join_channel` (with hard cap + soft cap), `leave_channel`, `get_participants`, `update_state`, `leave_all_channels`. 158 lines, no stubs. |
| `server/src/voice/signaling.rs` | SDP/ICE relay via WS | VERIFIED | 7 handlers: `handle_voice_join`, `handle_voice_leave`, `handle_voice_sdp_offer`, `handle_voice_sdp_answer`, `handle_voice_ice_candidate`, `handle_voice_state_update`, `handle_voice_speaking`. 328 lines, all substantive. |
| `server/src/voice/turn.rs` | TURN credential generation | VERIFIED | `generate_turn_credentials` uses HMAC-SHA1 with `{timestamp}:{user_id}` format. `get_ice_servers` includes STUN fallback + conditional TURN with UDP/TCP URLs. |
| `client/src/renderer/src/voice/VoiceManager.ts` | Full mesh WebRTC connection lifecycle | VERIFIED | 483 lines. RTCPeerConnection per peer, lexicographic offer/answer, ICE candidate queueing (`pendingCandidates`), 15s disconnect timeout, Opus 40kbps via `sender.setParameters`, speaking detection loop, stats polling. |
| `client/src/renderer/src/voice/AudioPipeline.ts` | Web Audio API routing for VAD, volume, deafen | VERIFIED | 279 lines. `AnalyserNode` for VAD, per-peer `GainNode` (0-200%), `masterGain` for deafen, `muteLocalMic` via `track.enabled`, `setOutputDevice` with `setSinkId` fallback. |
| `client/src/renderer/src/stores/voice.ts` | Voice state slice (participants, mute, deafen, speaking) | VERIFIED | `VoiceSlice` with 13 state fields and 13 actions. localStorage persistence for settings. `toggleDeafen` implies mute. `updateParticipantSpeaking` updates per-user speaking state. |
| `client/src/main/voice/ptt.ts` | Global keyboard hook for push-to-talk | VERIFIED | Imports `uIOhook, UiohookKey` from `uiohook-napi`. `startPTT`/`stopPTT`/`changePTTKey`. `pttActive` flag prevents repeat keydown. Broadcasts `IPC.PUSH_PTT_STATE` to all windows. |
| `client/src/main/ipc/voice.ts` | Voice IPC handlers | VERIFIED | `ipcMain.handle` for 10 voice IPC channels. Routes WS send calls for SDP/ICE, join/leave, state updates. PTT start/stop on mode change. macOS mic permission check via `systemPreferences`. |
| `client/src/renderer/src/components/VoiceBar.tsx` | Persistent bottom-left voice controls | VERIFIED | 167 lines. Quality icon with 4-bar signal display colored green/yellow/red. Mute/deafen/disconnect buttons reading from voice store. Returns null when `voiceChannelId === null`. |
| `client/src/renderer/src/components/VoiceParticipant.tsx` | Sidebar participant entry with speaking indicator | VERIFIED | 129 lines. Avatar with `box-shadow: 0 0 0 2px #43b581, 0 0 8px #43b581` when `participant.speaking`. 150ms CSS transition. Right-click context menu with 0-200% volume slider. |
| `client/src/renderer/src/components/VoiceSettings.tsx` | Settings > Voice panel | VERIFIED | 431 lines. `vadSensitivity` slider, PTT key config with listening mode, device enumeration with `devicechange` event, output volume, mic test with playback. |
| `docker-compose.yml` | Docker compose with coturn sidecar | VERIFIED | `coturn/coturn:4.8` service with STUN/TURN ports 3478 UDP/TCP, 5349 TLS, relay range 49152-49252. `depends_on: coturn` in united-server. `turnserver.conf` volume mount. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `shared/proto/ws.proto` | `shared/proto/voice.proto` | import + Envelope oneof fields 180-199 | WIRED | `voice_join_request = 180` through `voice_participant_joined_event = 189` confirmed in ws.proto. |
| `server/src/ws/protocol.rs` | `server/src/voice/signaling.rs` | dispatch_payload match arms for voice payloads | WIRED | 7 `Payload::Voice*` match arms call `crate::voice::signaling::handle_voice_*` — confirmed in grep. |
| `server/src/voice/signaling.rs` | `server/src/voice/state.rs` | voice state lookup on join/leave | WIRED | `state.voice_state.join_channel(...)`, `state.voice_state.leave_channel(...)`, `state.voice_state.get_participants(...)` confirmed. |
| `client/src/renderer/src/voice/VoiceManager.ts` | `client/src/renderer/src/voice/SignalingClient.ts` | SDP/ICE exchange via WS | WIRED | `this.signaling.sendSdpOffer(...)`, `this.signaling.sendSdpAnswer(...)`, `this.signaling.sendIceCandidate(...)` confirmed in VoiceManager. |
| `client/src/renderer/src/voice/VoiceManager.ts` | `client/src/renderer/src/voice/AudioPipeline.ts` | Remote stream routing through Web Audio | WIRED | `this.audio.addRemoteStream(remoteUserId, event.streams[0])` in `ontrack` handler confirmed. |
| `client/src/renderer/src/voice/SignalingClient.ts` | `client/src/main/ws/voice-events.ts` | WS voice event forwarding from main to renderer | WIRED | `voice-events.ts` calls `broadcastToRenderers(IPC.PUSH_VOICE_EVENT, event)` for all 8 voice event types. |
| `client/src/main/voice/ptt.ts` | `client/src/renderer/src/stores/voice.ts` | IPC push of PTT key state | WIRED | `ptt.ts` sends `IPC.PUSH_PTT_STATE`. `useVoice.ts` subscribes via `signaling.onPttState = setPttActive`. |
| `client/src/renderer/src/components/ChannelList.tsx` | `client/src/renderer/src/stores/voice.ts` | joinVoiceChannel on voice channel click | WIRED | `joinVoiceChannel` read from store. `onJoinVoice={() => joinVoiceChannel(ch.id)}` in ChannelItem. |
| `client/src/renderer/src/components/VoiceBar.tsx` | `client/src/renderer/src/stores/voice.ts` | toggleMute, toggleDeafen, leaveVoiceChannel | WIRED | All three store actions called directly from button `onClick` handlers. |
| `client/src/renderer/src/components/VoiceParticipant.tsx` | `client/src/renderer/src/stores/voice.ts` | voiceParticipants map for speaking state | WIRED | `participant.speaking` from `VoiceParticipantState` drives `box-shadow` CSS. `setUserVolume` called from volume slider. |
| `client/src/renderer/src/components/ChannelSidebar.tsx` | `client/src/renderer/src/components/VoiceBar.tsx` | VoiceBar rendered above footer | WIRED | `import VoiceBar from './VoiceBar'`. `<VoiceBar />` rendered in sidebar between channel list and footer. |
| `docker-compose.yml` | `server/Dockerfile` | united-server and coturn services | WIRED | `united-server.build.dockerfile: server/Dockerfile`. `depends_on: coturn`. |
| `server/src/ws/actor.rs` | `server/src/voice/state.rs` | Disconnect cleanup broadcasts VoiceLeaveEvent | WIRED | `state.voice_state.leave_all_channels(&user_id)` on WS close, then `broadcast_leave_event` per channel confirmed. |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VOICE-01 | 08-01, 08-02, 08-03 | User can join voice channels and communicate with other users via WebRTC peer-to-peer audio (2-8 simultaneous participants) | SATISFIED | Server signaling (08-01) + VoiceManager full-mesh WebRTC (08-02) + click-to-join UI (08-03). Hard cap enforcement in state.rs. |
| VOICE-02 | 08-02, 08-03 | User can mute their microphone and deafen all incoming audio | SATISFIED | `AudioPipeline.muteLocalMic` toggles `track.enabled`. `deafen` sets `masterGain = 0`. VoiceBar mute/deafen buttons. Store sends state update via WS. |
| VOICE-03 | 08-02, 08-03 | User can see a visual indicator showing which user is currently speaking | SATISFIED | AnalyserNode RMS detection in AudioPipeline. 50ms poll loop in VoiceManager. `VoiceSpeakingEvent` broadcast via WS. Green `box-shadow` on VoiceParticipant avatar with 150ms CSS transition. |
| VOICE-04 | 08-02, 08-03 | User can use push-to-talk as an alternative to voice activity detection | SATISFIED | `uiohook-napi` in `ptt.ts` with keydown/keyup tracking. Default key: backtick (UiohookKey.Backquote). PTT mode selectable in VoiceSettings. `pttActive` flag prevents repeat keydown events. |

**Coverage:** 4/4 Phase 8 requirements — all SATISFIED. No orphaned requirements.

**REQUIREMENTS.md Traceability Status:** All 4 VOICE requirements marked `[x]` (Complete) in REQUIREMENTS.md and confirmed implemented.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `VoiceBar.tsx` | 119 | `return null` | INFO | Appropriate conditional render — VoiceBar is hidden when not in voice channel. Not a stub. |
| `VoiceManager.ts` | 189, 214 | `return null` | INFO | Appropriate null return for missing peer stats. Not a stub. |
| `ChannelList.tsx` | 266-268 | `console.warn` for soft cap warning | INFO | Documented as intentional simplification ("In a real app this would use a toast system"). Not a blocker. |

No blocker anti-patterns found. No TODO/FIXME/placeholder patterns in any voice implementation files.

---

### Human Verification Required

#### 1. P2P Audio in Real Session

**Test:** Open two client instances (or two machines), join the same voice channel, and speak.
**Expected:** Both users hear each other with clear audio and low latency (perceptually less than 300ms).
**Why human:** WebRTC P2P audio requires live `getUserMedia`, ICE negotiation, and DTLS handshake. Cannot verify programmatically.

#### 2. Mute and Deafen Effect

**Test:** Mute your microphone, speak, and confirm the remote user stops receiving audio. Deafen and confirm all incoming audio stops.
**Expected:** Mute: `track.enabled = false` on local tracks. Deafen: `masterGain.gain.value = 0`, all remote audio silent. Both toggle cleanly.
**Why human:** Effect on remote audio transmission requires live session with two participants.

#### 3. Speaking Glow Animation

**Test:** Speak into the microphone and observe the participant list for the speaking glow on your avatar (visible to other participants).
**Expected:** Green ring (`box-shadow: 0 0 0 2px #43b581, 0 0 8px #43b581`) appears on speaking participant, fades within ~150ms of silence.
**Why human:** AnalyserNode RMS threshold and perceptual timing requires live audio input; CSS animation timing needs visual confirmation.

#### 4. Push-to-Talk Global Hotkey

**Test:** Set voice mode to PTT, minimize the app, press backtick while focused on another application, and speak.
**Expected:** Audio transmits only while key held. Releasing key immediately stops transmission. Works even when app not focused.
**Why human:** `uiohook-napi` global hook requires live Electron process and keyboard events in a running system.

#### 5. NAT Traversal with TURN Relay

**Test:** Deploy `docker-compose up`, configure `turnserver.conf` with a real secret, put clients behind different NATs, and join voice.
**Expected:** ICE negotiation succeeds via coturn relay when direct P2P fails. Audio flows through TURN relay.
**Why human:** Requires live network with NAT topology, running coturn server, and matching `shared_secret` between server and coturn.

---

### Gaps Summary

No gaps found. All 11 observable truths verified, all 13 artifacts confirmed as substantive (not stubs), all 13 key links confirmed as wired, all 4 VOICE requirements satisfied.

The implementation is architecturally complete:

- **Server (08-01):** Voice signaling backbone with protobuf schemas, DashMap state, SDP/ICE relay, HMAC-SHA1 TURN credentials, disconnect cleanup, and REST participant endpoint.
- **Client engine (08-02):** Full-mesh WebRTC via VoiceManager with ICE candidate queueing and Opus 40kbps, Web Audio pipeline via AudioPipeline, global PTT via uiohook-napi, Zustand VoiceSlice, IPC bridge.
- **UI + deployment (08-03):** VoiceBar, VoiceParticipant with speaking glow, VoiceSettings panel, click-to-join in sidebar, docker-compose with coturn sidecar.

Five items flagged for human verification are all live-session behaviors (audio quality, PTT global hook, NAT traversal) that cannot be verified statically. These are expected for a WebRTC feature and do not indicate implementation gaps.

---

*Verified: 2026-02-26T23:45:00Z*
*Verifier: Claude (gsd-verifier)*
