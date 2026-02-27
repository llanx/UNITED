# Phase 12: Wire Client Connection Lifecycle - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire existing WS connection and presence code into auth flows so all real-time features (chat, DMs, voice, presence, P2P mesh) activate automatically at startup. Both returning-user (unlock) and new-user (invite join) flows must connect WS after authentication. This is a plumbing/integration fix — the code exists but is dead.

Two critical breaks from v1.0 audit:
1. `performChallengeResponse()` and `connectWebSocket()` are never called during auth flows
2. `usePresence()` is never mounted at the app level

</domain>

<decisions>
## Implementation Decisions

### Connection Timing
- WS connects **after /app mounts** (background) — not before navigation
- User sees cached data (SQLite hydration) immediately, real-time features light up as WS connects
- **Single code path** for both returning-user and new-user flows — both converge at /app, same WS connection logic
- Connection triggered by **React hook in Main.tsx** (consistent with existing useVoice/useNetworkStats pattern) — usePresence() mounts there too

### Startup Sequence
- **Auth completes before navigation:** Welcome.tsx handles unlock + challenge-response + JWT, THEN navigates to /app
- /app can always assume a valid JWT exists
- If auth fails (wrong key, TOTP required, server unreachable), user stays on Welcome screen with error
- **Sequential subsystem activation:** auth → WS → (presence + chat + P2P mesh start)
- **Progressive activation:** features light up individually as each subsystem connects (not waiting for full pipeline)
- WS connects first (~100ms), presence + chat activate immediately, P2P mesh starts discovering after WS is established

### Failure & Reconnection
- **Aggressive backoff:** immediate → 1s → 2s → 4s → 8s → 16s → 30s cap
- **Never give up:** keep retrying at 30s cap indefinitely (self-hosted server will come back)
- After ~5 failed attempts, show persistent "Reconnecting..." indicator (not blocking modal)
- **Resume-only on reconnect:** just start receiving new events, missed messages available via scroll-back (no catch-up sync)

### Connection State UX
- **Bottom status bar** (Discord pattern): thin banner above message input when disconnected, shows "Connecting..." or "Reconnecting..."
- Banner disappears when connected — zero UI noise during normal operation
- **500ms delay threshold:** only show banner if connection takes >500ms, fast connections show nothing (avoids flicker)
- **Message input disabled** while disconnected: greyed out, re-enables on reconnect (no offline queue)

### Claude's Recommendation
- Hook placement — mount useConnection + usePresence in Main.tsx alongside existing useVoice/useNetworkStats hooks
- Dead code cleanup — remove or wire the existing useAuth.ts orchestration hook if it duplicates the new connection logic
- P2P dependency — P2P mesh starts after WS because it needs peer directory and relay transport from the server connection

</decisions>

<specifics>
## Specific Ideas

- Connection UX should feel like Discord: cached data visible immediately, "Reconnecting..." banner above message input when disconnected
- Self-hosted context means aggressive reconnect is appropriate (no thundering herd concern)
- Keep this phase focused on wiring — no offline queue, no catch-up sync, no new UI components beyond the status banner

</specifics>

<deferred>
## Deferred Ideas

- **Catch-up sync on reconnect** — fetch missed messages/events since last timestamp to fill timeline gaps
- **Offline message queue** — allow composing and queuing messages while disconnected, send on reconnect

</deferred>

---

*Phase: 12-wire-client-connection-lifecycle*
*Context gathered: 2026-02-26*
