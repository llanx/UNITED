# Phase 12: Wire Client Connection Lifecycle - Research

**Researched:** 2026-02-26
**Domain:** Electron client WebSocket connection lifecycle, auth flow integration, presence wiring
**Confidence:** HIGH

## Summary

Phase 12 is a plumbing/integration fix, not a feature build. The v1.0 milestone audit found two critical integration breaks: (1) `performChallengeResponse()` and `connectWebSocket()` are defined in `client/src/main/ipc/connection.ts` but never called from any auth flow, and (2) `usePresence()` is exported from `client/src/renderer/src/hooks/usePresence.ts` but never mounted at the app level. The result is that the app reaches `/app` without a WebSocket connection, leaving all real-time features (chat, DMs, voice, presence, typing, P2P mesh) non-functional at runtime.

All the building blocks exist and are correct in isolation. The server's challenge-response auth, JWT issuance, WS actor model, presence tracking, and event broadcasting all work. The client's `WsClient` with exponential backoff, protobuf event forwarders (`chat-events.ts`, `dm-events.ts`, `voice-events.ts`), P2P auto-start on WS connect, and all Zustand stores are implemented. The missing piece is purely the wiring that connects identity unlock/registration to challenge-response auth to WS connection.

**Primary recommendation:** Wire `performChallengeResponse()` + `connectWebSocket()` into a new IPC handler callable from the renderer. Call it from Main.tsx (or a useConnection-like hook mounted there) after `/app` mounts. Mount `usePresence()` alongside existing `useVoice()` and `useNetworkStats()` hooks. Add a connection status banner above the message input. This is a 3-5 file change, not a rewrite.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Connection Timing:**
- WS connects **after /app mounts** (background) -- not before navigation
- User sees cached data (SQLite hydration) immediately, real-time features light up as WS connects
- **Single code path** for both returning-user and new-user flows -- both converge at /app, same WS connection logic
- Connection triggered by **React hook in Main.tsx** (consistent with existing useVoice/useNetworkStats pattern) -- usePresence() mounts there too

**Startup Sequence:**
- **Auth completes before navigation:** Welcome.tsx handles unlock + challenge-response + JWT, THEN navigates to /app
- /app can always assume a valid JWT exists
- If auth fails (wrong key, TOTP required, server unreachable), user stays on Welcome screen with error
- **Sequential subsystem activation:** auth -> WS -> (presence + chat + P2P mesh start)
- **Progressive activation:** features light up individually as each subsystem connects (not waiting for full pipeline)
- WS connects first (~100ms), presence + chat activate immediately, P2P mesh starts discovering after WS is established

**Failure & Reconnection:**
- **Aggressive backoff:** immediate -> 1s -> 2s -> 4s -> 8s -> 16s -> 30s cap
- **Never give up:** keep retrying at 30s cap indefinitely (self-hosted server will come back)
- After ~5 failed attempts, show persistent "Reconnecting..." indicator (not blocking modal)
- **Resume-only on reconnect:** just start receiving new events, missed messages available via scroll-back (no catch-up sync)

**Connection State UX:**
- **Bottom status bar** (Discord pattern): thin banner above message input when disconnected, shows "Connecting..." or "Reconnecting..."
- Banner disappears when connected -- zero UI noise during normal operation
- **500ms delay threshold:** only show banner if connection takes >500ms, fast connections show nothing (avoids flicker)
- **Message input disabled** while disconnected: greyed out, re-enables on reconnect (no offline queue)

**Claude's Recommendation (from CONTEXT.md):**
- Hook placement -- mount useConnection + usePresence in Main.tsx alongside existing useVoice/useNetworkStats hooks
- Dead code cleanup -- remove or wire the existing useAuth.ts orchestration hook if it duplicates the new connection logic
- P2P dependency -- P2P mesh starts after WS because it needs peer directory and relay transport from the server connection

### Claude's Discretion
- None specified -- all decisions are locked

### Deferred Ideas (OUT OF SCOPE)
- **Catch-up sync on reconnect** -- fetch missed messages/events since last timestamp to fill timeline gaps
- **Offline message queue** -- allow composing and queuing messages while disconnected, send on reconnect
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MSG-01 | Send/receive text messages with real-time delivery via gossip (<100ms) | WS connection wiring enables real-time delivery; P2P auto-start on WS connect enables gossip propagation |
| MSG-04 | React to messages with standard Unicode emoji | Requires WS for real-time reaction broadcast (ReactionAddedEvent/ReactionRemovedEvent) |
| MSG-05 | See typing indicators when another user is composing | Requires WS for TypingEvent push + usePresence mounting for typing store updates |
| MSG-06 | See online/offline/away status for other users | Requires usePresence() mounted at app level to receive PUSH_PRESENCE_EVENT and populate userPresence store |
| MSG-09 | Desktop notifications for mentions and DMs | Requires WS for real-time ChatEvent push; notification triggers exist in chat-events.ts, just need active WS |
| DM-01 | Send/receive E2E encrypted DMs | Requires WS for DmMessageEvent push via dm-events.ts; DM crypto pipeline is complete |
| VOICE-01 | Join voice channels with WebRTC audio (2-8 participants) | Requires WS for voice signaling (SDP/ICE relay); voice-events.ts forwards all signals |
| VOICE-02 | Mute microphone and deafen audio | Requires WS for VoiceStateUpdate broadcast to other participants |
| VOICE-03 | Visual indicator showing who is speaking | Requires WS for VoiceSpeakingEvent push; speaking detection works via WebRTC audio analysis |
| P2P-02 | New messages propagated via libp2p gossipsub | P2P auto-start triggers on WS 'connected' status (connection.ts line 142); needs WS to be connected first |
| APP-03 | All subscribed channels receive gossip simultaneously | Requires P2P mesh running (depends on WS connection); gossipsub subscribes to all channel topics on mesh start |
| SEC-02 | Challenge-response auth with JWT tokens | performChallengeResponse() exists but is dead code; must be called during auth flows (returning-user + new-user) |
</phase_requirements>

## Standard Stack

### Core (Already in Project)

No new dependencies are needed. All required libraries are already installed and used throughout the codebase.

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| zustand | v5 | State management (connection status, presence) | Already used - 15 slices |
| react-router-dom | v6+ | Navigation (Welcome -> /app routing) | Already used - HashRouter |
| @bufbuild/protobuf | latest | Protobuf binary encoding for WS messages | Already used everywhere |
| ws (Node.js WebSocket) | built-in | WebSocket client in main process | Already used via WsClient |

### Supporting (Already in Project)

| Library | Purpose | Where Used |
|---------|---------|------------|
| electron (ipcMain/ipcRenderer) | IPC bridge for connection triggers | Already used for all IPC |
| better-sqlite3 | SQLite cache for server info, tokens | Already used via queries.ts |
| sodium-native | Ed25519 signing for challenge-response | Already used via crypto.ts |

### Alternatives Considered

None. This phase introduces zero new dependencies. All code exists; the task is wiring existing modules together.

**Installation:**
```bash
# No installation needed — all dependencies already present
```

## Architecture Patterns

### Current State: What Exists and Where

```
client/src/
├── main/
│   ├── ipc/
│   │   ├── auth.ts           # Token storage, register handler, getAccessToken()
│   │   ├── connection.ts     # performChallengeResponse() [DEAD CODE], connectWebSocket() [DEAD CODE]
│   │   └── p2p.ts            # P2P auto-start on WS 'connected' (line 142-148)
│   ├── ws/
│   │   ├── client.ts         # WsClient class with exponential backoff
│   │   ├── chat-events.ts    # setupChatEventListener() — WS -> renderer push
│   │   ├── dm-events.ts      # setupDmEventListener() — WS -> renderer push
│   │   └── voice-events.ts   # setupVoiceEventListener() — WS -> renderer push
│   └── index.ts              # App initialization (all listeners registered at startup)
├── renderer/src/
│   ├── pages/
│   │   ├── Welcome.tsx       # Unlock flow — navigates to /app WITHOUT auth
│   │   ├── JoinServer.tsx    # Register flow — navigates to /app WITHOUT WS
│   │   └── Main.tsx          # App shell — mounts useConnection but NOT usePresence
│   ├── hooks/
│   │   ├── useConnection.ts  # Subscribes to connection status push events
│   │   ├── usePresence.ts    # Presence + typing IPC listener [NEVER MOUNTED]
│   │   ├── useAuth.ts        # Orchestration hook [DEAD CODE - never imported]
│   │   ├── useVoice.ts       # Voice lifecycle [mounted in MainContent.tsx]
│   │   └── useNetworkStats.ts # Network stats [mounted in MainContent.tsx]
│   ├── stores/
│   │   ├── auth.ts           # hasIdentity, isUnlocked, fingerprint, publicKey
│   │   ├── connection.ts     # status: 'connected' | 'reconnecting' | 'disconnected'
│   │   └── presence.ts       # userPresence map, typing users with timeout
│   └── components/
│       ├── MainContent.tsx   # Renders panels, mounts useVoice + useNetworkStats
│       ├── StatusBarIndicator.tsx  # Network speed indicator (bottom bar)
│       └── ConnectionDot.tsx # Simple status dot on Welcome page
```

### Pattern 1: Auth Flow Gap Analysis

**What:** The two critical breaks in the auth-to-WS pipeline.

**Returning-user flow (Welcome.tsx handleUnlock):**
```
window.united.unlockIdentity(passphrase)   // Unlocks local key
  → setUnlocked(fingerprint, publicKey)    // Updates auth store
  → storage.getActiveServer()              // Checks for cached server
  → navigate('/app')                       // ← NO CHALLENGE-RESPONSE, NO WS
```

**New-user flow (JoinServer.tsx handleRegister):**
```
window.united.connectToServer(url)         // Fetches server info via REST
  → window.united.register(displayName)    // Gets JWT from /api/auth/register
  → navigate('/app')                       // ← HAS JWT BUT NO WS CONNECTION
```

**Key insight:** The new-user flow already has a JWT (from registration), but the returning-user flow has no JWT at all. Both need WS connection. The returning user additionally needs challenge-response auth.

### Pattern 2: The Fix - New IPC Handler for Auth + WS

**What:** Add a new IPC handler that combines challenge-response + WS connect into a single callable function.

**Why:** The existing `performChallengeResponse()` and `connectWebSocket()` in `connection.ts` are private functions. The renderer cannot call them. A new IPC handler bridges this gap.

**Approach:**
```
// New IPC handler in connection.ts (or auth.ts)
ipcMain.handle(IPC.AUTH_CHALLENGE_AND_CONNECT, async (_, serverUrl) => {
  // 1. performChallengeResponse(serverUrl) → gets JWT
  // 2. storeTokens(accessToken, refreshToken)
  // 3. connectWebSocket(serverUrl, accessToken) → starts WS
  // Returns success/failure to renderer
})
```

**Renderer side (Welcome.tsx returning-user flow):**
```
handleUnlock:
  unlockIdentity(passphrase)
  setUnlocked(fingerprint, publicKey)
  activeServer = storage.getActiveServer()
  if (activeServer) {
    await window.united.authenticateAndConnect(activeServer.url)  // NEW
  }
  navigate('/app')
```

**Renderer side (JoinServer.tsx new-user flow):**
```
handleRegister:
  register(displayName)       // Already gets JWT
  await window.united.connectWs()  // NEW — just connect WS, JWT already stored
  navigate('/app')
```

### Pattern 3: Hook Mounting in Main.tsx/MainContent.tsx

**What:** Mount `usePresence()` at the app level, and optionally trigger WS connection from a hook.

**Current Main.tsx:**
```typescript
export default function Main() {
  useConnection()  // Subscribes to status push events
  // usePresence() — MISSING
  // ...
}
```

**Current MainContent.tsx:**
```typescript
export default function MainContent() {
  useNetworkStats()  // Subscribes to stats push events
  useVoice()         // Voice lifecycle
  // usePresence() — MISSING
  // ...
}
```

**Decision from CONTEXT.md:** Mount usePresence in Main.tsx (or MainContent.tsx — same component tree, both always mounted when at /app). The user specified Main.tsx as the mount point for consistency with useConnection.

### Pattern 4: Connection Status Banner

**What:** A thin banner above the message input showing connection state.

**Where:** New component rendered in MainContent.tsx or ChatView.tsx, conditionally shown when status !== 'connected' and visible for >500ms.

**Existing patterns to follow:**
- `StatusBarIndicator.tsx` — bottom bar pattern, thin strip
- `ConnectionDot.tsx` — status color mapping (`connected`, `reconnecting`, `disconnected`)
- `useStore((s) => s.status)` — reactive connection status from Zustand

### Anti-Patterns to Avoid

- **Blocking navigation on connection:** User decision says auth completes before navigation, but WS connects AFTER /app mounts. Do not block the navigate('/app') call on WS connection success.
- **Duplicate auth flows:** The existing `useAuth.ts` hook was designed as an orchestration layer but is dead code. Either wire it in or remove it — do not create a third copy of auth logic.
- **Catching up on reconnect:** User explicitly deferred catch-up sync. On reconnect, just resume receiving new events. Do not add any message gap-fill logic.
- **Modal blocking on disconnect:** User specified a thin banner, not a modal. Do not block the UI on connection failure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff | Custom retry logic | Existing `WsClient.scheduleReconnect()` | Already has backoff with jitter, configurable delay/cap/maxAttempts |
| Protobuf WS messages | Custom encoding | Existing `chat-events.ts` / `dm-events.ts` / `voice-events.ts` | All event forwarders are already set up and registered at startup |
| P2P mesh lifecycle | Manual P2P init | Existing auto-start in `connection.ts:142-148` | P2P auto-starts on WS 'connected' status — no extra code needed |
| Challenge-response | New auth flow | Existing `performChallengeResponse()` in `connection.ts` | Complete implementation with challenge bytes, signature, and verify — just needs to be called |
| Token storage | New storage layer | Existing `storeTokens()` in `auth.ts` | Tokens stored in module-scope vars, accessed via `getAccessToken()` |
| Presence store | New state management | Existing `presence.ts` Zustand slice | Complete with setPresence, setBulkPresence, typing timeouts — just needs usePresence mounted |

**Key insight:** This phase adds almost no new code. The task is exclusively wiring: adding IPC handlers, calling existing functions, and mounting existing hooks.

## Common Pitfalls

### Pitfall 1: Returning User Has No JWT Before WS

**What goes wrong:** The returning-user flow unlocks the local identity but never contacts the server. There is no JWT in memory. Calling `connectWebSocket()` without a token will fail because the server requires `?token=` on the WS URL.

**Why it happens:** Welcome.tsx `handleUnlock` only calls `unlockIdentity()` (local-only) then navigates. The `useAuth.ts` hook was supposed to orchestrate challenge-response but was never integrated.

**How to avoid:** The returning-user flow MUST call `performChallengeResponse()` before `connectWebSocket()`. The new-user flow (register) already has a JWT from the register response — it just needs `connectWebSocket()`.

**Warning signs:** WS immediately closes with 4002 (TOKEN_INVALID) after connection attempt.

### Pitfall 2: Token Scope — Two Different Token Storage Locations

**What goes wrong:** `auth.ts` stores tokens in module-scope (`currentAccessToken`, `currentRefreshToken`). `connection.ts` imports `getAccessToken()` from `auth.ts` to use the token. If challenge-response is performed in a new module or handler, it must call `storeTokens()` from `auth.ts` to make the token available to the rest of the system.

**Why it happens:** Token storage is not a shared utility — it's private state in `auth.ts` with exported getters.

**How to avoid:** Either put the new challenge-response IPC handler in `connection.ts` (which already imports from `auth.ts`) or import `storeTokens` into the new handler.

**Warning signs:** `getAccessToken()` returns null after challenge-response completes.

### Pitfall 3: Reconnect Backoff Schedule Mismatch

**What goes wrong:** The user wants `immediate -> 1s -> 2s -> 4s -> 8s -> 16s -> 30s cap`. The current `DEFAULT_RECONNECT_CONFIG` uses `baseDelay: 1000` (first retry waits 1s, not immediate).

**Why it happens:** The existing backoff formula is `1000 * 2^attempt + jitter`. At attempt=0 that's 1000ms + jitter, not 0ms.

**How to avoid:** Either modify `DEFAULT_RECONNECT_CONFIG` to set `baseDelay: 0` for the first attempt (special-cased), or adjust the formula to skip delay on attempt 0. The simplest fix: in `scheduleReconnect()`, if `attempt === 0`, call `doConnect()` immediately without setTimeout.

**Warning signs:** First reconnect waits ~1-2 seconds instead of being immediate.

### Pitfall 4: 500ms Delay Threshold Flicker Prevention

**What goes wrong:** The connection status banner shows "Connecting..." for <100ms then disappears, causing visual flicker on fast connections.

**Why it happens:** Without a delay threshold, every connection state change immediately renders UI.

**How to avoid:** Use a `setTimeout(500)` guard. Start a timer when status becomes non-'connected'. Only show the banner if 500ms elapses without returning to 'connected'. Clear the timer on 'connected'. This is a React `useEffect` + `useRef` pattern.

**Warning signs:** Quick flash of "Connecting..." text on initial page load.

### Pitfall 5: Race Between Navigation and WS Connection

**What goes wrong:** The CONTEXT.md decision says "auth completes before navigation" but "WS connects after /app mounts." This creates a sequencing constraint: the returning-user flow must complete challenge-response (getting JWT) BEFORE `navigate('/app')`, but the actual WebSocket connection happens AFTER. If the WS connection is attempted before the router has mounted Main.tsx, there is no listener for connection status events.

**Why it happens:** React navigation is synchronous but component mounting involves a render cycle. The WS 'connected' event might fire before `useConnection()` in Main.tsx has registered its listener.

**How to avoid:** Two strategies work:
1. **Main process approach:** Challenge-response happens in main process IPC handler. JWT is stored. WS connection is initiated. Status events are queued in WsClient. When useConnection mounts and registers its listener, the current status is already 'connected'. This works because WsClient emits status changes through IPC push, and the listener registration in Main.tsx will read the current store state.
2. **Hybrid approach:** JWT acquisition happens before navigation (in Welcome.tsx/JoinServer.tsx via IPC). WS connection is triggered from Main.tsx after mount (via a new hook or in useConnection). This aligns with CONTEXT.md's "WS connects after /app mounts."

The CONTEXT.md decision favors approach 2 (WS connects after /app mounts, triggered by React hook). The challenge-response / JWT acquisition still happens before navigation.

**Warning signs:** Connection status flickers or stays 'disconnected' briefly after /app loads.

### Pitfall 6: Message Input Disabled State

**What goes wrong:** MessageComposer allows typing and sending while WS is disconnected. Messages sent via REST POST will work, but no real-time delivery occurs (WS broadcast to other clients fails).

**Why it happens:** MessageComposer currently has no connection status awareness.

**How to avoid:** Read `status` from the connection store in MessageComposer. Disable the input and show a placeholder like "Reconnecting..." when status !== 'connected'. Do the same for DmComposer.

**Warning signs:** User sends a message while disconnected — it appears to succeed (REST POST works) but no one else sees it in real time.

## Code Examples

Verified patterns from the existing codebase:

### Challenge-Response Auth (Existing Dead Code)
```typescript
// Source: client/src/main/ipc/connection.ts lines 83-115
async function performChallengeResponse(serverUrl: string): Promise<{ accessToken: string; refreshToken: string }> {
  const keys = getSessionKeys()
  if (!keys) throw new Error('Identity not unlocked')

  const challenge = await apiPost<ChallengeResponseBody>(serverUrl, '/api/auth/challenge', {})
  const challengeBytes = hexToBuf(challenge.challenge_bytes)
  const signature = signChallenge(challengeBytes)
  const fingerprint = computeFingerprint(keys.publicKey)

  const result = await apiPost<VerifyResponseBody>(serverUrl, '/api/auth/verify', {
    challenge_id: challenge.challenge_id,
    public_key: bufToHex(keys.publicKey),
    signature: bufToHex(signature),
    fingerprint: bufToHex(computeFingerprintBytes(keys.publicKey))
  })

  return { accessToken: result.access_token, refreshToken: result.refresh_token }
}
```

### WS Connection (Existing Dead Code)
```typescript
// Source: client/src/main/ipc/connection.ts lines 121-128
function connectWebSocket(serverUrl: string, token: string): void {
  const wsUrl = serverUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
  wsClient.connect(`${wsUrl}/ws?token=${encodeURIComponent(token)}`)
}
```

### P2P Auto-Start on WS Connect (Already Working)
```typescript
// Source: client/src/main/ipc/connection.ts lines 141-149
wsClient.on('status', (status: ConnectionStatus) => {
  // ...push to renderer...
  if (status === 'connected' && !getP2PNode()) {
    const url = getServerUrl()
    if (url) {
      startP2PNode(url).catch(err => {
        console.error('[P2P] Auto-start failed:', err)
      })
    }
  }
})
```

### usePresence Hook (Existing, Never Mounted)
```typescript
// Source: client/src/renderer/src/hooks/usePresence.ts lines 16-42
export function usePresence() {
  const setPresence = useStore((s) => s.setPresence)
  const addTypingUser = useStore((s) => s.addTypingUser)

  useEffect(() => {
    const cleanupPresence = window.united.onPresenceEvent((event: PresenceUpdate) => {
      setPresence(event.userPubkey, event.status, event.displayName)
    })
    const cleanupTyping = window.united.onTypingEvent((event: TypingEvent) => {
      addTypingUser(event.channelId, event.userId, event.displayName)
    })
    return () => { cleanupPresence(); cleanupTyping() }
  }, [setPresence, addTypingUser])
}
```

### WsClient Reconnect (Existing, Needs Tweaking)
```typescript
// Source: client/src/main/ws/client.ts lines 126-137
private scheduleReconnect(): void {
  if (!this.url) return
  if (this.attempt >= this.config.maxAttempts) {
    this.setStatus('disconnected')
    return
  }
  this.setStatus('reconnecting')
  const delay = calculateReconnectDelay(this.attempt, this.config)
  this.attempt++
  this.reconnectTimer = setTimeout(() => this.doConnect(), delay)
}
```

### Token Storage (Existing, Must Be Used)
```typescript
// Source: client/src/main/ipc/auth.ts lines 36-56
let currentAccessToken: string | null = null
let currentRefreshToken: string | null = null

export function getAccessToken(): string | null { return currentAccessToken }
function storeTokens(accessToken: string, refreshToken: string): void {
  currentAccessToken = accessToken
  currentRefreshToken = refreshToken
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useAuth.ts orchestration hook | Dead code (never imported) | Phase 1 (original design) | Intended to orchestrate unlock->connect->auth but was never wired in |
| Separate challenge-response + connect calls | Should be single IPC handler | Phase 12 (this fix) | Simplifies renderer code — one call does auth + WS |

**Dead code to address:**
- `client/src/renderer/src/hooks/useAuth.ts` — orchestration hook, never imported. Either wire it in as the connection trigger or remove it.
- `client/src/main/ws/protocol.ts` — encode/decode stubs that throw errors. Unreachable. Can be removed as part of cleanup.

## Open Questions

1. **Where to put the challenge-response IPC handler?**
   - What we know: `performChallengeResponse()` lives in `connection.ts`. Token storage lives in `auth.ts`. Both are in the main process.
   - What's unclear: Should the new IPC handler go in `connection.ts` (near the existing functions) or `auth.ts` (near token storage)?
   - Recommendation: Put it in `connection.ts` since that file already has both functions and imports from `auth.ts`. Add a new `IPC.AUTH_CHALLENGE_AND_CONNECT` handler.

2. **Should useAuth.ts be repurposed or removed?**
   - What we know: It was designed to orchestrate the full auth flow but was never imported. Its logic overlaps with what we need.
   - What's unclear: Is it better to wire it in or write fresh logic in the Welcome/JoinServer pages?
   - Recommendation: The CONTEXT.md says connection is triggered by a hook in Main.tsx, not in Welcome.tsx. The useAuth.ts hook's approach of doing everything in one place may conflict with the decision to split auth (before navigation) from WS connect (after /app mounts). Recommend removing it to avoid confusion, since the split approach is cleaner.

3. **New-user flow: connect WS before or after navigate?**
   - What we know: JoinServer.tsx `handleRegister` gets a JWT from the register call. The JWT is stored in `auth.ts` module scope.
   - What's unclear: Should WS connect before navigating to /app (in JoinServer.tsx) or after (in Main.tsx hook)?
   - Recommendation: After. Per CONTEXT.md, both flows converge at /app with the same WS connection logic. The Main.tsx hook checks if JWT exists (it does after register) and connects WS. This keeps it consistent.

4. **Returning-user flow: where does challenge-response happen?**
   - What we know: CONTEXT.md says "auth completes before navigation." The returning user unlocks identity, then needs challenge-response to get a JWT before navigating.
   - What's unclear: Does this mean Welcome.tsx calls a new IPC method to do challenge-response? Or does it happen automatically?
   - Recommendation: Welcome.tsx `handleUnlock` should be extended: after `unlockIdentity()`, call a new IPC method like `authenticateToServer(serverUrl)` that does challenge-response and stores the JWT. Then navigate to /app. The Main.tsx hook then connects WS using the stored JWT.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** — All findings based on direct reading of source files in the UNITED repository
  - `client/src/main/ipc/connection.ts` — performChallengeResponse and connectWebSocket (dead code confirmed)
  - `client/src/main/ipc/auth.ts` — token storage, register handler
  - `client/src/main/ws/client.ts` — WsClient with backoff
  - `client/src/main/ws/chat-events.ts` — WS event forwarder (already initialized at startup)
  - `client/src/renderer/src/pages/Welcome.tsx` — returning-user unlock flow (no auth)
  - `client/src/renderer/src/pages/JoinServer.tsx` — new-user register flow (no WS)
  - `client/src/renderer/src/pages/Main.tsx` — app shell (useConnection but not usePresence)
  - `client/src/renderer/src/hooks/usePresence.ts` — presence hook (never mounted)
  - `client/src/renderer/src/hooks/useAuth.ts` — orchestration hook (dead code)
  - `client/src/renderer/src/components/MainContent.tsx` — panel rendering, mounts useVoice + useNetworkStats
  - `client/src/renderer/src/stores/index.ts` — store composition and hydrate()
  - `shared/types/ws-protocol.ts` — ConnectionStatus, ReconnectConfig, backoff formula
  - `shared/types/ipc-bridge.ts` — UnitedAPI surface, all IPC types

- **v1.0 Milestone Audit** — `.planning/v1.0-MILESTONE-AUDIT.md`
  - Integration break 3a: WS connection never initiated (12 affected requirements)
  - Integration break 3b: usePresence() never mounted (1 affected requirement)

### Secondary (MEDIUM confidence)
- None needed — this is entirely an internal wiring task using existing code

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all code exists
- Architecture: HIGH — all patterns verified by reading source files
- Pitfalls: HIGH — identified through direct code tracing of auth flows

**Research date:** 2026-02-26
**Valid until:** Indefinite (internal codebase analysis, no external dependency concerns)
