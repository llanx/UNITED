# Phase 8: Voice Channels - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

WebRTC peer-to-peer voice communication in channels. Users can join voice channels and talk to 2-8+ participants via full-mesh WebRTC audio with no media server. Includes mute/deafen, push-to-talk, speaking indicators, per-user volume, device selection, and TURN relay fallback for NAT traversal. Built on Phase 3's libp2p signaling layer for peer discovery and connection negotiation.

</domain>

<decisions>
## Implementation Decisions

### Join/leave flow & voice UI
- Single-click a voice channel in the sidebar to join immediately (no lobby, no confirmation)
- Persistent bottom-left voice bar (above user panel) while in a call: shows channel name, connection quality icon, mute/deafen/disconnect buttons
- Participants shown inline in the sidebar, listed under the voice channel entry (not in a separate panel or main content area)
- One-click disconnect via red phone/X icon in voice bar. No confirmation dialog. Accidental disconnect = just click channel again.
- Clicking a different voice channel auto-disconnects from current and joins the new one. Clicking a text channel does NOT disconnect.

### Audio controls & push-to-talk
- Default voice mode: voice activity detection (VAD). Mic is live, transmits when user speaks above threshold.
- Push-to-talk (PTT): available as alternative mode. Fixed default key (Claude picks appropriate default), changeable in Settings > Voice. Global hotkey so it works when app isn't focused.
- VAD sensitivity: user-configurable slider in Settings > Voice, from "sensitive" to "aggressive." Real-time indicator showing when mic is detecting sound (for testing/tuning).
- Device selection in Settings > Voice: dropdown for input device (mic), dropdown for output device (speakers/headphones), mic test button (hear yourself), output volume slider.
- Mute: toggles mic off/on. Immediate effect. Icon in voice bar changes to slashed mic.
- Deafen: mutes all incoming audio AND your mic. Immediate effect. Icon in voice bar changes to slashed headphones.

### Speaking indicators & participant display
- Speaking visualization: green glowing border ring on participant's avatar in the sidebar list when they're speaking. Immediate, recognizable.
- Participant entries in sidebar: small avatar + display name + status icons on the right (slashed mic icon if muted, slashed headphone icon if deafened). Compact layout.
- Per-user volume: right-click a participant in the voice list for a context menu with a volume slider (0-200%). Stored locally per user. Essential for groups with different mic levels.
- Connection quality: signal-strength icon in the bottom-left voice bar. Green = good, yellow = degraded, red = poor. Hovering shows latency in ms.

### Connection & degradation
- Peer disconnect handling: auto-reconnect silently in background. Disconnected user's avatar goes dim/greyed. If they don't reconnect within 15 seconds, remove from participant list with subtle notification ("[User] left").
- Participant limit: soft cap at 8. Warn that quality may degrade above 8, but allow more to join. Admin can configure voice channel participant limit per channel.
- NAT traversal: TURN relay fallback through the coordination server when direct P2P connection fails (symmetric NAT). ~20-30% of connections need this. DTLS-SRTP preserves end-to-end encryption regardless of relay. Server admin controls the TURN server — still sovereign infrastructure.
- Audio quality degradation: automatically reduce bitrate when packet loss increases. Connection quality icon shifts green → yellow → red. No popup or interruption. Users can hover icon for latency/packet loss stats.

### Claude's Discretion
- Exact PTT default key choice (something intuitive and unlikely to conflict)
- WebRTC codec selection (Opus is standard for voice, but exact configuration is implementation detail)
- TURN server integration approach (embedded in Rust server vs. standalone like coturn)
- Audio processing pipeline (noise suppression, echo cancellation — WebRTC defaults are usually sufficient)
- Exact VAD algorithm and default sensitivity level
- Voice bar visual design (icon set, spacing, animation timing for speaking indicator)
- Reconnection backoff strategy details
- How "quality may degrade" warning is presented when going above 8 participants

</decisions>

<specifics>
## Specific Ideas

- Voice bar placement and behavior directly mirrors Discord's bottom-left connected panel — the most battle-tested pattern for persistent voice state during text chat.
- Green glow speaking indicator is the industry standard (Discord, Teams, Google Meet) — instantly recognizable to users coming from those platforms.
- Per-user volume (0-200%) is a frequently-requested Discord feature that many users rely on. The 200% upper limit helps when someone's mic is too quiet.
- TURN relay preserves the sovereignty story: the server admin controls the relay, no third-party infrastructure involved. Audio is still DTLS-SRTP encrypted regardless of relay path.
- Soft participant cap (warn but allow) respects self-hosted communities where admin and users can make their own trade-offs about quality vs. inclusivity.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-voice-channels*
*Context gathered: 2026-02-26*
