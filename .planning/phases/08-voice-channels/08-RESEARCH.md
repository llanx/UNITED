# Phase 8: Voice Channels - Research

**Researched:** 2026-02-26
**Domain:** WebRTC peer-to-peer audio, signaling, voice activity detection, TURN relay
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single-click a voice channel in the sidebar to join immediately (no lobby, no confirmation)
- Persistent bottom-left voice bar (above user panel) while in a call: shows channel name, connection quality icon, mute/deafen/disconnect buttons
- Participants shown inline in the sidebar, listed under the voice channel entry (not in a separate panel or main content area)
- One-click disconnect via red phone/X icon in voice bar. No confirmation dialog. Accidental disconnect = just click channel again.
- Clicking a different voice channel auto-disconnects from current and joins the new one. Clicking a text channel does NOT disconnect.
- Default voice mode: voice activity detection (VAD). Mic is live, transmits when user speaks above threshold.
- Push-to-talk (PTT): available as alternative mode. Fixed default key (Claude picks appropriate default), changeable in Settings > Voice. Global hotkey so it works when app isn't focused.
- VAD sensitivity: user-configurable slider in Settings > Voice, from "sensitive" to "aggressive." Real-time indicator showing when mic is detecting sound (for testing/tuning).
- Device selection in Settings > Voice: dropdown for input device (mic), dropdown for output device (speakers/headphones), mic test button (hear yourself), output volume slider.
- Mute: toggles mic off/on. Immediate effect. Icon in voice bar changes to slashed mic.
- Deafen: mutes all incoming audio AND your mic. Immediate effect. Icon in voice bar changes to slashed headphones.
- Speaking visualization: green glowing border ring on participant's avatar in the sidebar list when they're speaking. Immediate, recognizable.
- Participant entries in sidebar: small avatar + display name + status icons on the right (slashed mic icon if muted, slashed headphone icon if deafened). Compact layout.
- Per-user volume: right-click a participant in the voice list for a context menu with a volume slider (0-200%). Stored locally per user. Essential for groups with different mic levels.
- Connection quality: signal-strength icon in the bottom-left voice bar. Green = good, yellow = degraded, red = poor. Hovering shows latency in ms.
- Peer disconnect handling: auto-reconnect silently in background. Disconnected user's avatar goes dim/greyed. If they don't reconnect within 15 seconds, remove from participant list with subtle notification ("[User] left").
- Participant limit: soft cap at 8. Warn that quality may degrade above 8, but allow more to join. Admin can configure voice channel participant limit per channel.
- NAT traversal: TURN relay fallback through the coordination server when direct P2P connection fails (symmetric NAT). ~20-30% of connections need this. DTLS-SRTP preserves end-to-end encryption regardless of relay. Server admin controls the TURN server -- still sovereign infrastructure.
- Audio quality degradation: automatically reduce bitrate when packet loss increases. Connection quality icon shifts green to yellow to red. No popup or interruption. Users can hover icon for latency/packet loss stats.

### Claude's Discretion
- Exact PTT default key choice (something intuitive and unlikely to conflict)
- WebRTC codec selection (Opus is standard for voice, but exact configuration is implementation detail)
- TURN server integration approach (embedded in Rust server vs. standalone like coturn)
- Audio processing pipeline (noise suppression, echo cancellation -- WebRTC defaults are usually sufficient)
- Exact VAD algorithm and default sensitivity level
- Voice bar visual design (icon set, spacing, animation timing for speaking indicator)
- Reconnection backoff strategy details
- How "quality may degrade" warning is presented when going above 8 participants

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VOICE-01 | User can join voice channels and communicate with other users via WebRTC peer-to-peer audio (2-8 simultaneous participants) | Full mesh WebRTC via Chromium's built-in RTCPeerConnection in renderer process; signaling via existing WS connection; coturn for TURN relay |
| VOICE-02 | User can mute their microphone and deafen all incoming audio | MediaStreamTrack.enabled toggle for mute; GainNode zero for deafen; state sync via WS events |
| VOICE-03 | User can see a visual indicator showing which user is currently speaking | Web Audio API AnalyserNode on each remote stream; RMS threshold detection; speaking state via WS broadcast |
| VOICE-04 | User can use push-to-talk as an alternative to voice activity detection | uiohook-napi for global keydown/keyup events; MediaStreamTrack.enabled toggle on key state |
</phase_requirements>

## Summary

Phase 8 adds WebRTC peer-to-peer voice communication to UNITED. The architecture uses Chromium's built-in WebRTC stack in Electron's renderer process for all audio capture, encoding, and playback. The existing WebSocket connection to the coordination server serves double duty as the signaling channel for SDP offer/answer exchange and ICE candidate trickle. A full-mesh topology connects each participant directly to every other participant, which is well-suited for audio-only calls with up to 8-10 participants (audio requires only ~40kbps per stream compared to 1-2Mbps for video).

The server's role is limited to voice channel state management (who is in which channel), signaling relay (forwarding SDP and ICE candidates between peers), and providing TURN relay credentials for NAT traversal. TURN relay is essential -- approximately 20-30% of connections fail without it due to symmetric NATs and corporate firewalls. The recommendation is to ship coturn as a Docker sidecar rather than embedding a TURN server in the Rust binary, keeping the coordination server focused on its core responsibilities.

For push-to-talk, Electron's built-in `globalShortcut` module cannot detect keydown/keyup events (only "shortcut pressed" callbacks), making it unsuitable for PTT. The `uiohook-napi` package provides global keyboard hooks with proper keydown/keyup events, supporting all three desktop platforms. Voice activity detection uses the Web Audio API's AnalyserNode to compute RMS audio levels in real-time, with a configurable threshold slider.

**Primary recommendation:** Use Chromium's native WebRTC in the renderer process with full-mesh connections, the existing WS connection for signaling, coturn in Docker for TURN relay, and uiohook-napi for push-to-talk global hotkeys.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Built-in RTCPeerConnection | Chromium 134 (Electron 40) | WebRTC peer connections, audio encoding/decoding | Ships with Electron, full Opus codec support, DTLS-SRTP encryption, getStats API |
| Built-in getUserMedia | Chromium 134 (Electron 40) | Microphone capture | Ships with Electron, handles device enumeration and permissions |
| Built-in Web Audio API | Chromium 134 (Electron 40) | VAD (AnalyserNode), per-user volume (GainNode), audio routing | Ships with Electron, zero additional dependencies |
| coturn | 4.8.x | STUN/TURN relay server | Industry standard, Docker image available, battle-tested, AGPL-compatible |
| uiohook-napi | 1.5.x | Global keyboard hooks for push-to-talk | Only maintained library providing global keydown/keyup events for Electron |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing WS connection | (already in project) | Signaling channel for SDP/ICE/voice state | All voice signaling messages |
| Existing protobuf stack | (already in project) | Voice event encoding | Voice channel events in WS Envelope |
| Zustand | 5.0.x (already in project) | Voice state management | VoiceSlice for call state, participants, audio settings |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Chromium built-in WebRTC | node-datachannel (main process) | node-datachannel's media track API is immature (exported in v0.31.0, Dec 2024), poorly documented; Chromium's WebRTC is production-grade with full codec support |
| coturn (standalone) | turn-rs (embedded in Rust server) | turn-rs is impressive (5Gbit/s, <35us latency) but embedding TURN in the coordination server couples concerns; coturn as Docker sidecar is operationally cleaner and better documented |
| uiohook-napi | iohook | iohook is unmaintained (last published 5+ years ago); uiohook-napi is the successor with N-API support |
| Full mesh | SFU (mediasoup, etc.) | SFU adds a media server dependency, violating P2P architecture; full mesh supports 8-10 audio-only participants adequately |
| AnalyserNode VAD | WebRTC VAD library (webrtcvad) | AnalyserNode is built-in, no native addon required; webrtcvad adds native dependency for marginal accuracy improvement |

**Installation:**
```bash
# Client (Electron)
npm install uiohook-napi

# Server (Docker sidecar)
# coturn runs as a separate Docker container, no Rust crate needed
```

## Architecture Patterns

### Recommended Project Structure
```
client/src/
├── main/
│   ├── ipc/
│   │   └── voice.ts           # IPC handlers: device enum, PTT key config, TURN credentials
│   └── voice/
│       └── ptt.ts              # uiohook-napi global hotkey registration
├── renderer/src/
│   ├── voice/
│   │   ├── VoiceManager.ts     # RTCPeerConnection lifecycle, full mesh management
│   │   ├── AudioPipeline.ts    # Web Audio API: AnalyserNode, GainNode routing
│   │   └── SignalingClient.ts  # WS voice message handling (SDP, ICE, state)
│   ├── stores/
│   │   └── voice.ts            # VoiceSlice: participants, mute/deafen, speaking, quality
│   ├── hooks/
│   │   └── useVoice.ts         # Voice event subscriptions, cleanup
│   └── components/
│       ├── VoiceBar.tsx         # Bottom-left persistent bar
│       ├── VoiceParticipant.tsx # Sidebar participant entry
│       └── VoiceSettings.tsx    # Settings > Voice panel
server/src/
├── voice/
│   ├── mod.rs                  # Voice module re-exports
│   ├── state.rs                # In-memory voice channel state (DashMap)
│   ├── signaling.rs            # SDP/ICE relay via WS
│   └── turn.rs                 # TURN credential generation (time-limited)
shared/proto/
└── voice.proto                 # Voice channel protobuf messages
```

### Pattern 1: Full Mesh WebRTC Connection
**What:** Each participant creates an RTCPeerConnection to every other participant. For N participants, each peer maintains N-1 connections.
**When to use:** Audio-only calls with up to 8-10 participants.
**Example:**
```typescript
// Renderer process - VoiceManager.ts
class VoiceManager {
  private peers = new Map<string, RTCPeerConnection>()
  private localStream: MediaStream | null = null

  async joinChannel(channelId: string, existingParticipants: string[]) {
    // 1. Capture microphone
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    })

    // 2. Create peer connection to each existing participant
    for (const peerId of existingParticipants) {
      await this.createOffer(peerId)
    }
  }

  private async createOffer(remotePeerId: string) {
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers, // STUN + TURN from server
    })

    // Add local audio track
    this.localStream!.getAudioTracks().forEach(track => {
      pc.addTrack(track, this.localStream!)
    })

    // Handle remote audio
    pc.ontrack = (event) => {
      this.handleRemoteTrack(remotePeerId, event.streams[0])
    }

    // Trickle ICE
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignaling({
          type: 'ice-candidate',
          target: remotePeerId,
          candidate: event.candidate.toJSON(),
        })
      }
    }

    // Create and send offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.sendSignaling({
      type: 'sdp-offer',
      target: remotePeerId,
      sdp: pc.localDescription!.sdp,
    })

    this.peers.set(remotePeerId, pc)
  }
}
```

### Pattern 2: Signaling via Existing WS Connection
**What:** Reuse the existing WebSocket connection for all voice signaling rather than establishing a separate signaling channel.
**When to use:** Always -- UNITED already has a persistent authenticated WS connection.
**Example:**
```typescript
// voice.proto field allocation: 180-199
// WS Envelope extends with voice signaling messages:
//   VoiceJoinRequest (180), VoiceJoinResponse (181),
//   VoiceLeaveRequest (182), VoiceLeaveEvent (183),
//   VoiceSdpOffer (184), VoiceSdpAnswer (185),
//   VoiceIceCandidate (186), VoiceStateUpdate (187),
//   VoiceSpeakingEvent (188), VoiceParticipantList (189)

// Server relays SDP/ICE between peers (does NOT inspect content)
// Server tracks voice channel membership in DashMap
```

### Pattern 3: Audio Pipeline with Web Audio API
**What:** Route all audio through Web Audio API nodes for volume control, speaking detection, and mute/deafen.
**When to use:** For every remote audio stream and the local microphone.
**Example:**
```typescript
// AudioPipeline.ts
class AudioPipeline {
  private audioContext = new AudioContext()
  private remoteGains = new Map<string, GainNode>()  // per-user volume
  private analyserNodes = new Map<string, AnalyserNode>()
  private masterGain: GainNode

  constructor() {
    this.masterGain = this.audioContext.createGain()
    this.masterGain.connect(this.audioContext.destination)
  }

  addRemoteStream(peerId: string, stream: MediaStream) {
    const source = this.audioContext.createMediaStreamSource(stream)
    const gain = this.audioContext.createGain()
    const analyser = this.audioContext.createAnalyser()
    analyser.fftSize = 256

    source.connect(gain)
    gain.connect(analyser)
    analyser.connect(this.masterGain)

    this.remoteGains.set(peerId, gain)
    this.analyserNodes.set(peerId, analyser)
  }

  setUserVolume(peerId: string, volume: number) {
    // volume: 0-200% (stored as 0.0 - 2.0)
    const gain = this.remoteGains.get(peerId)
    if (gain) gain.gain.value = volume / 100
  }

  deafen(deafened: boolean) {
    this.masterGain.gain.value = deafened ? 0 : 1
  }

  isSpeaking(peerId: string, threshold: number): boolean {
    const analyser = this.analyserNodes.get(peerId)
    if (!analyser) return false
    const data = new Float32Array(analyser.frequencyBinCount)
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    const rms = Math.sqrt(sum / data.length)
    return rms > threshold
  }
}
```

### Pattern 4: TURN Credential Generation
**What:** Server generates time-limited TURN credentials using the shared secret mechanism.
**When to use:** Every time a user joins a voice channel -- credentials included in the join response.
**Example:**
```rust
// server/src/voice/turn.rs
use hmac::{Hmac, Mac};
use sha1::Sha1;

pub fn generate_turn_credentials(
    username: &str,
    shared_secret: &str,
    ttl_secs: u64,
) -> (String, String) {
    let timestamp = chrono::Utc::now().timestamp() as u64 + ttl_secs;
    let turn_username = format!("{}:{}", timestamp, username);

    let mut mac = Hmac::<Sha1>::new_from_slice(shared_secret.as_bytes())
        .expect("HMAC key length");
    mac.update(turn_username.as_bytes());
    let credential = base64::encode(mac.finalize().into_bytes());

    (turn_username, credential)
}
```

### Anti-Patterns to Avoid
- **Running WebRTC in the main process:** The main process has no access to getUserMedia or the Web Audio API. Audio capture and WebRTC connections must run in the renderer process. The main process handles only IPC coordination (device enumeration, PTT hotkey registration, TURN credential fetching).
- **Creating a separate signaling WebSocket:** UNITED already has an authenticated, persistent WS connection. Creating a second one duplicates auth logic, connection management, and reconnection handling.
- **Using an SFU for 8 participants audio-only:** An SFU (Selective Forwarding Unit) adds a centralized media server dependency. Audio-only full mesh is well within the capabilities of modern hardware for 8 participants (~280kbps total bandwidth per peer at 40kbps/stream * 7 peers).
- **Polling getStats() too frequently:** Polling RTCPeerConnection.getStats() more than once per second wastes CPU. Use a 2-second interval, matching the project's existing stats push interval pattern.
- **Embedding TURN in the Rust binary:** TURN relay is infrastructure, not application logic. Bundling it in the coordination server couples concerns, makes independent scaling impossible, and adds complexity to the Rust codebase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio codec | Custom audio encoding/decoding | Opus via Chromium's WebRTC | Opus handles voice at 20-40kbps with FEC, DTX, and adaptive bitrate -- impossible to match |
| NAT traversal | Custom STUN/TURN server | coturn Docker image | NAT traversal is extremely complex (RFC 5389, 5766, 8656); coturn handles all edge cases |
| Echo cancellation | Custom AEC algorithm | Chromium's built-in AEC | Chromium's acoustic echo cancellation is production-grade; audio constraints `echoCancellation: true` enables it |
| Noise suppression | Custom noise gate | Chromium's built-in NS | `noiseSuppression: true` in getUserMedia constraints uses Chromium's WebRTC audio processing |
| Global keyboard hooks | Custom native addon for PTT | uiohook-napi | Cross-platform keyboard event hooks require platform-specific native code (Win32 hooks, Quartz events, X11) |
| ICE candidate gathering | Manual STUN queries | RTCPeerConnection built-in | ICE agent handles candidate gathering, prioritization, connectivity checks, and nomination automatically |
| Audio resampling | Manual sample rate conversion | Web Audio API AudioContext | AudioContext handles resampling transparently between different sample rates |

**Key insight:** WebRTC is a deeply integrated stack where audio capture, encoding, encryption, NAT traversal, and transport are tightly coupled. Using Chromium's built-in implementation gives you the entire pipeline tested against billions of real-world connections. Individual components (codec, SRTP, ICE) cannot be meaningfully improved in isolation.

## Common Pitfalls

### Pitfall 1: AudioContext Autoplay Policy
**What goes wrong:** AudioContext starts in "suspended" state. Remote audio silently fails to play.
**Why it happens:** Browser autoplay policy requires a user gesture before AudioContext can start. Electron inherits this from Chromium.
**How to avoid:** Resume the AudioContext on the user's click to join the voice channel. `audioContext.resume()` in the join handler.
**Warning signs:** No audio from remote peers, but local mic works fine. `audioContext.state === 'suspended'`.

### Pitfall 2: getUserMedia Permission on macOS
**What goes wrong:** getUserMedia returns a stream of silence (all zeros) instead of actual microphone input on macOS.
**Why it happens:** macOS requires explicit microphone permission. Electron does not throw an error if permission is missing -- it returns a silent stream.
**How to avoid:** Check `systemPreferences.getMediaAccessStatus('microphone')` before calling getUserMedia. If not granted, call `systemPreferences.askForMediaAccess('microphone')`.
**Warning signs:** Local VAD never triggers "speaking" on macOS. Other platforms work fine.

### Pitfall 3: ICE Candidate Race Condition
**What goes wrong:** ICE candidates arrive before remote description is set, causing `addIceCandidate()` to throw.
**Why it happens:** Trickle ICE sends candidates as they're gathered, which can be faster than the SDP offer/answer exchange.
**How to avoid:** Queue ICE candidates received before `setRemoteDescription()` completes. Process the queue after remote description is set.
**Warning signs:** "Failed to execute 'addIceCandidate'" errors in console. Some peers connect, others don't.

### Pitfall 4: Full Mesh Connection Storms
**What goes wrong:** When a new participant joins a voice channel with 7 existing participants, 7 simultaneous offer/answer exchanges create a burst of signaling messages.
**Why it happens:** Full mesh requires N-1 connections per peer. A join event triggers all existing peers to initiate connections.
**How to avoid:** Use a deterministic offer/answer role assignment: the peer with the lexicographically smaller user ID sends the offer. This prevents duplicate connection attempts and provides clear connection ownership.
**Warning signs:** Duplicate peer connections, "setRemoteDescription called in wrong state" errors.

### Pitfall 5: Mute/Deafen State Desync
**What goes wrong:** Local mute state and what other participants see get out of sync after a reconnection.
**Why it happens:** Mute state is only toggled locally (MediaStreamTrack.enabled = false) and broadcast once via WS. If the WS event is lost during reconnection, peers show wrong state.
**How to avoid:** Include full voice state (muted, deafened) in the VoiceJoinResponse participant list. Re-broadcast state on reconnection. Server is the source of truth for mute/deafen state.
**Warning signs:** One participant shows as unmuted when they are actually muted.

### Pitfall 6: Memory Leaks from Unreleased MediaStreams
**What goes wrong:** Audio continues playing or microphone stays active after leaving a voice channel.
**Why it happens:** MediaStream tracks, AudioContext nodes, and RTCPeerConnection objects must all be explicitly closed.
**How to avoid:** Implement thorough cleanup: `track.stop()` for all tracks, `pc.close()` for all peer connections, `audioContext.close()`. Use a cleanup function pattern similar to the existing `onDmEvent` listener cleanup.
**Warning signs:** Microphone indicator stays active in OS after leaving voice. Increasing memory usage over time.

### Pitfall 7: globalShortcut Cannot Do Push-to-Talk
**What goes wrong:** Push-to-talk only activates on key press but never deactivates on key release.
**Why it happens:** Electron's globalShortcut module fires a single callback when the key combination is pressed. It has no keyup event. This is a documented limitation (GitHub issue #26301).
**How to avoid:** Use uiohook-napi which provides proper keydown/keyup events at the OS level. Register in the main process, forward key state to renderer via IPC.
**Warning signs:** PTT activates but mic stays open. Users can never release the PTT key.

### Pitfall 8: TURN Relay Not Configured
**What goes wrong:** ~20-30% of users cannot connect to voice channels at all. They see "connecting..." indefinitely.
**Why it happens:** Without a TURN server, users behind symmetric NATs cannot establish peer connections. STUN only works for simple NATs.
**How to avoid:** TURN must be available from Phase 8 launch. Ship coturn as a Docker sidecar with the server's docker-compose.yml. Generate time-limited credentials in the VoiceJoinResponse.
**Warning signs:** Connection works on LAN but fails across the internet. getStats shows ICE state "failed" or "disconnected".

## Code Examples

### Voice Join Flow (end-to-end)
```
1. User clicks voice channel in sidebar
2. Renderer sends VoiceJoinRequest via WS
3. Server validates (capacity check, permissions)
4. Server adds user to voice channel state (DashMap)
5. Server sends VoiceJoinResponse to user (participant list + TURN credentials)
6. Server broadcasts VoiceParticipantJoinedEvent to existing participants
7. New user captures microphone (getUserMedia)
8. New user creates RTCPeerConnection to each existing participant
9. SDP offer/answer exchange via WS signaling relay
10. ICE candidates trickled via WS signaling relay
11. Audio flows directly peer-to-peer (or via TURN if needed)
12. Speaking detection runs locally on each peer's AnalyserNode
13. Speaking state broadcast via WS for UI indicator sync
```

### Opus Configuration for Voice Chat
```typescript
// SDP munging is NOT needed -- Opus is the default WebRTC audio codec
// But we can set preferences via RTCRtpSender.setParameters()
const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
if (sender) {
  const params = sender.getParameters()
  if (params.encodings && params.encodings.length > 0) {
    params.encodings[0].maxBitrate = 40_000  // 40kbps voice
    // DTX (discontinuous transmission) saves bandwidth during silence
    // Enabled automatically when Opus detects silence
  }
  await sender.setParameters(params)
}
```

### Connection Quality Monitoring
```typescript
// Poll getStats every 2 seconds per peer connection
async function measureQuality(pc: RTCPeerConnection): Promise<QualityMetrics> {
  const stats = await pc.getStats()
  let rtt = 0, packetLoss = 0, jitter = 0

  stats.forEach((report) => {
    if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
      rtt = report.roundTripTime ?? 0           // seconds
      packetLoss = report.fractionLost ?? 0     // 0-1
      jitter = report.jitter ?? 0               // seconds
    }
  })

  // Quality thresholds
  const quality =
    rtt > 0.3 || packetLoss > 0.05 ? 'poor' :
    rtt > 0.15 || packetLoss > 0.02 ? 'degraded' :
    'good'

  return { rtt: Math.round(rtt * 1000), packetLoss, jitter, quality }
}
```

### Push-to-Talk via uiohook-napi
```typescript
// main process: voice/ptt.ts
import { uIOhook, UiohookKey } from 'uiohook-napi'

let pttActive = false
const DEFAULT_PTT_KEY = UiohookKey.Backquote  // ` key - rarely used, accessible

export function registerPTT(
  key: number,
  onActivate: () => void,
  onDeactivate: () => void
) {
  uIOhook.on('keydown', (e) => {
    if (e.keycode === key && !pttActive) {
      pttActive = true
      onActivate()
    }
  })

  uIOhook.on('keyup', (e) => {
    if (e.keycode === key && pttActive) {
      pttActive = false
      onDeactivate()
    }
  })

  uIOhook.start()
}

export function unregisterPTT() {
  uIOhook.stop()
}
```

### TURN Credentials in Voice Join Response
```rust
// Server returns TURN credentials when user joins a voice channel
// Credentials are time-limited (shared-secret auth mechanism)
message VoiceJoinResponse {
  repeated VoiceParticipant participants = 1;
  repeated IceServer ice_servers = 2;
}

message IceServer {
  repeated string urls = 1;     // ["turn:server:3478?transport=udp"]
  string username = 2;          // "timestamp:userid"
  string credential = 3;        // HMAC-SHA1(username, shared_secret)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebRTC Plan B SDP | Unified Plan SDP | Chrome 72 (2019), now universal | Unified Plan is the only supported SDP format; Plan B was removed from Chrome 93+ |
| SRTP key exchange via SDES (in SDP) | DTLS-SRTP (mandatory) | WebRTC 1.0 spec finalization | Keys never appear in signaling; TURN relay cannot decrypt audio |
| Callback-based getUserMedia | Promise-based navigator.mediaDevices.getUserMedia | ~2017 | Old callback API deprecated; always use the promise form |
| AnalyserNode for VAD | Still AnalyserNode or AudioWorklet | Current | AudioWorklet offers more precision but AnalyserNode is simpler and sufficient for speaking detection |
| iohook for global keyboard hooks | uiohook-napi | ~2022 | iohook unmaintained; uiohook-napi is the N-API successor with active maintenance |
| Manual ICE restart | RTCPeerConnection.restartIce() | Chrome 77+ | Simplified reconnection -- just call restartIce() and create a new offer |

**Deprecated/outdated:**
- **electron-webrtc:** Abandoned package that ran a hidden Electron renderer for WebRTC. Not needed -- Electron's renderer has native WebRTC support.
- **SDP Plan B:** Removed from Chromium. Always use Unified Plan (the default).
- **iohook:** Unmaintained for 5+ years. Use uiohook-napi instead.
- **RTCPeerConnection constructor with `url` property in iceServers:** Use `urls` (plural) -- the singular `url` property is deprecated.

## Discretion Recommendations

### PTT Default Key: Backtick/Grave (`` ` ``)
Backtick is the most common PTT default across voice chat applications (Discord, TeamSpeak, Mumble). It is located in the top-left corner of QWERTY keyboards, easily reachable without disrupting typing. On most layouts it has no common typing function. uiohook-napi keycode: `UiohookKey.Backquote`.

### Opus Configuration: Voice-Optimized Defaults
Use Opus at 48kHz sample rate (WebRTC default), 40kbps bitrate for voice, with DTX (discontinuous transmission) enabled. These are sensible defaults that Chromium applies automatically. No SDP munging needed. FEC (Forward Error Correction) is enabled by default in WebRTC's Opus implementation when packet loss is detected.

### TURN: coturn as Docker Sidecar
Ship coturn in the existing docker-compose.yml as a sidecar container. The Rust server generates time-limited credentials using a shared secret stored in `united.toml` (`turn_shared_secret`). This keeps the TURN server independently scalable and operationally transparent. For single-server deployments, `docker-compose up` brings up both services together.

### Audio Processing: Chromium Defaults
Use `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true` in getUserMedia constraints. Chromium's audio processing pipeline is production-grade (used by Google Meet, Discord, etc.). No additional audio processing library is needed for v1. Advanced noise suppression (RNNoise/Krisp-style) is deferred to v2 (AVOICE-02).

### VAD Algorithm: RMS with Configurable Threshold
Use AnalyserNode.getFloatTimeDomainData() to compute RMS (root mean square) of the audio signal. Compare against a configurable threshold mapped to the "sensitive" to "aggressive" slider. Default sensitivity: moderate position (threshold ~0.01 RMS). The real-time indicator in Settings > Voice should show a live volume bar using the same RMS values.

### Reconnection Strategy: Exponential Backoff
Reuse the existing reconnection pattern from the WS connection: exponential backoff starting at 1 second, capping at 30 seconds. On ICE disconnection, call `pc.restartIce()` and create a new offer. If ICE fails after 15 seconds, tear down the connection and remove the participant with "[User] left" notification.

### Quality Degradation Warning
When participant count exceeds 8, show a one-time toast notification: "Voice quality may be reduced with more than 8 participants." Dismissable, not blocking. Do not prevent joining.

## Open Questions

1. **coturn shared secret distribution**
   - What we know: coturn supports time-limited credentials via shared secret HMAC-SHA1
   - What's unclear: How does the server admin configure the shared secret? Options: auto-generated on first boot (like the setup token), or explicit in `united.toml`
   - Recommendation: Auto-generate and store in `united.toml` on first boot. Print to console alongside the setup token. Admin can override in config.

2. **uiohook-napi Electron rebuild compatibility**
   - What we know: uiohook-napi uses N-API v8, which Electron 40 supports. The project already rebuilds native modules (sodium-native, better-sqlite3, node-datachannel).
   - What's unclear: Whether uiohook-napi requires explicit Electron rebuild or works out of the box
   - Recommendation: Test during implementation. Add to the existing `electron-rebuild` pipeline if needed.

3. **Voice channel participant limit enforcement**
   - What we know: Admin-configurable per channel, soft cap at 8 with warning
   - What's unclear: Where is the per-channel limit stored? A new column on the channels table? Or a separate voice_channel_settings table?
   - Recommendation: Add `max_participants` column to channels table (nullable, defaults to 8 for voice channels, NULL for text). Simpler than a separate table.

4. **Speaking state broadcast mechanism**
   - What we know: Each client computes speaking state locally via AnalyserNode. Other clients need this for the green glow indicator.
   - What's unclear: Should speaking state be broadcast via WS (server relay) or via WebRTC data channels (peer-to-peer)?
   - Recommendation: Use WS for simplicity and consistency with all other state. Speaking events are small and infrequent (toggle on/off, not continuous). The existing WS connection handles this with negligible overhead.

5. **Audio output device selection**
   - What we know: getUserMedia handles input device selection. The user also wants output device selection.
   - What's unclear: Output device selection in Electron requires `HTMLMediaElement.setSinkId()` which is supported but may require special handling with Web Audio API routing.
   - Recommendation: Create an `<audio>` element per remote stream, use `setSinkId()` for output device, then route through Web Audio API GainNode for volume control. Or use `AudioContext.setSinkId()` (newer API, check Electron 40 support).

## Sources

### Primary (HIGH confidence)
- Electron 40 API docs (globalShortcut, desktopCapturer, systemPreferences) -- verified limitations
- MDN WebRTC API (RTCPeerConnection, getUserMedia, getStats) -- standard API reference
- MDN Web Audio API (AnalyserNode, GainNode, AudioContext) -- standard API reference
- WebRTC.org samples (peer connection audio, bandwidth adjustment) -- reference implementations
- coturn GitHub repository -- Docker image and configuration documentation

### Secondary (MEDIUM confidence)
- [node-datachannel releases](https://github.com/murat-dogan/node-datachannel/releases) -- media track support immaturity confirmed via release notes
- [uiohook-napi npm](https://www.npmjs.com/package/uiohook-napi) -- v1.5.4, keydown/keyup event support confirmed
- [Electron globalShortcut keydown/keyup issue #26301](https://github.com/electron/electron/issues/26301) -- confirmed PTT limitation
- [WebRTC mesh topology limits](https://dev.to/akeel_almas_9a2ada3db4257/webrtc-network-topology-complete-guide-to-mesh-sfu-and-mcu-architecture-selection-published-by-3fi6) -- 4-6 video, 8-10 audio-only
- [turn-rs crate](https://crates.io/crates/turn-server) -- pure Rust TURN server (alternative to coturn)
- [DTLS-SRTP WebRTC security](https://webrtc-security.github.io/) -- end-to-end encryption through TURN confirmed
- [WebRTC getStats monitoring](https://dev.to/deepak_mishra_35863517037/the-client-knows-best-deep-dive-into-webrtc-getstats-and-quality-monitoring-3e5p) -- polling best practices

### Tertiary (LOW confidence)
- [Electron getUserMedia macOS permissions bug](https://github.com/electron/electron/issues/42714) -- silent stream instead of error (needs validation on current Electron version)
- Audio-only mesh supporting ~10 users -- cited in search results but not rigorously benchmarked

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Chromium WebRTC is well-documented but full mesh at 8 participants for audio-only is at the edge of documented territory; uiohook-napi is the clear choice for PTT but has lower adoption
- Architecture: HIGH - Renderer-based WebRTC, WS signaling, coturn sidecar is a well-established pattern used by production applications
- Pitfalls: HIGH - Documented issues with concrete mitigations; AudioContext autoplay, macOS permissions, ICE races are all well-known

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (30 days -- WebRTC ecosystem is stable)
