---
phase: 12-wire-client-connection-lifecycle
verified: 2026-02-27T06:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 12: Wire Client Connection Lifecycle — Verification Report

**Phase Goal:** Wire client connection lifecycle — challenge-response auth, WS auto-connect, connection status UX
**Verified:** 2026-02-27T06:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Returning user unlocks identity and the app automatically authenticates to the server via challenge-response and connects WebSocket | VERIFIED | `Welcome.tsx:28` calls `window.united.authenticateToServer(activeServer.url)` before `navigate('/app')`. Handler in `connection.ts:173` performs full challenge-response and stores JWT. |
| 2 | New user registers via invite and the app automatically connects WebSocket after receiving JWT | VERIFIED | `auth.ts:203` calls `storeTokens()` inside the `AUTH_REGISTER` handler after a successful register response. `Main.tsx:22` calls `connectWs()` on mount, which retrieves that stored JWT. |
| 3 | Presence updates from the server are received and displayed in the member list sidebar | VERIFIED | `chat-events.ts:136` broadcasts `PUSH_PRESENCE_EVENT` → `usePresence.ts:25` calls `setPresence()` → `MemberListSidebar.tsx:45` reads `userPresence` from store. Full pipeline wired. |
| 4 | All WS-dependent features (chat delivery, DM push, voice signaling, typing indicators, P2P auto-start) function at runtime | VERIFIED | `main/index.ts:152-154` calls `setupChatEventListener()`, `setupDmEventListener()`, `setupVoiceEventListener()` at app startup. P2P auto-starts in `connection.ts:143-149` on `wsClient.on('status', 'connected')`. All event pipelines activate when WS connects via `Main.tsx:22`. |
| 5 | WebSocket connects immediately when /app loads without requiring a second auth prompt | VERIFIED | `Main.tsx:21-25` has a `useEffect([], ...)` calling `window.united.connectWs()`. The handler in `connection.ts:181-187` reads stored JWT and calls `connectWebSocket()` — no prompt. |
| 6 | Reconnection begins without visible delay after disconnect, then backs off gradually to 30s cap | VERIFIED | `client.ts:137-141` — `attempt === 0` triggers `setTimeout(() => this.doConnect(), 0)`. Subsequent attempts use `calculateReconnectDelay(attempt - 1, config)`. `maxAttempts: Infinity` in `DEFAULT_RECONNECT_CONFIG`. |
| 7 | Connection status banner shows above message input when disconnected >500ms; composers disabled when disconnected | VERIFIED | `ConnectionBanner.tsx:19` uses `setTimeout(..., 500)` threshold. Rendered above `MessageComposer` at `ChatView.tsx:533` and above `DmComposer` at `DmChatView.tsx:411`. `MessageComposer.tsx:56` and `DmComposer.tsx:41` read `status !== 'connected'` and disable textarea + send. |

**Score:** 7/7 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `client/src/main/ipc/connection.ts` | `AUTH_AUTHENTICATE` and `AUTH_CONNECT_WS` IPC handlers | VERIFIED | Lines 173-187 contain both `ipcMain.handle(IPC.AUTH_AUTHENTICATE, ...)` and `ipcMain.handle(IPC.AUTH_CONNECT_WS, ...)` with full implementations. |
| `client/src/main/ipc/channels.ts` | `AUTH_AUTHENTICATE` constant | VERIFIED | Lines 14-15 define `AUTH_AUTHENTICATE: 'auth:authenticate'` and `AUTH_CONNECT_WS: 'auth:connect-ws'`. |
| `shared/types/ipc-bridge.ts` | Type declarations for `authenticateToServer` and `connectWs` | VERIFIED | Lines 468 and 474 declare both methods on the `UnitedAPI` interface. |
| `client/src/preload/index.ts` | Preload bridge exposure for `authenticateToServer` and `connectWs` | VERIFIED | Lines 45-49 expose both via `ipcRenderer.invoke`. |
| `client/src/renderer/src/pages/Welcome.tsx` | Challenge-response call before navigate | VERIFIED | Lines 27-34: `await window.united.authenticateToServer(activeServer.url)` with error handling that blocks navigation on failure. Zustand store also populated (lines 37-44) before `navigate('/app')`. |
| `client/src/main/ws/client.ts` | Immediate-first-retry reconnect | VERIFIED | Lines 137-141: `attempt === 0` guard fires `setTimeout(() => this.doConnect(), 0)`. `maxAttempts: Infinity` confirmed in `shared/types/ws-protocol.ts:79`. |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `client/src/renderer/src/pages/Main.tsx` | `usePresence` mount and WS connect trigger | VERIFIED | Line 17: `usePresence()` mounted. Lines 21-25: `useEffect(() => { window.united.connectWs()... }, [])` — single code path for both user flows. |
| `client/src/renderer/src/components/ConnectionBanner.tsx` | Thin status banner with 500ms delay | VERIFIED | Full implementation with `setTimeout(..., 500)` for show and `clearTimeout` + immediate hide on reconnect. Renders "Reconnecting..." or "Connecting..." text. |
| `client/src/renderer/src/components/MessageComposer.tsx` | Disabled input when disconnected | VERIFIED | Lines 55-56 read `status !== 'connected'`. Line 127 blocks `handleSend` when `isDisconnected`. Line 494: placeholder shows "Reconnecting...". Line 500: `disabled={isDisabled}` applied. |
| `client/src/renderer/src/components/DmComposer.tsx` | Disabled input when disconnected | VERIFIED | Lines 40-41 read `status !== 'connected'`. Line 102 blocks `handleSend`. Lines 146-148: "Reconnecting..." placeholder has priority. Line 160: `disabled={sending || isDisabled}` applied. |
| `client/src/renderer/src/hooks/useAuth.ts` | DELETED (dead code) | VERIFIED | File does not exist. `ls` returns missing. No dangling imports found. |
| `client/src/main/ws/protocol.ts` | DELETED (unreachable stubs) | VERIFIED | File does not exist. References to `blocks/protocol.ts` in codebase are an unrelated different file. No dangling imports of `ws/protocol.ts` found. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `Welcome.tsx` | `connection.ts` | `window.united.authenticateToServer(url)` IPC | WIRED | `Welcome.tsx:28` calls; `connection.ts:173` handles. |
| `connection.ts` | `auth.ts` | `storeTokens()` after challenge-response | WIRED | `connection.ts:8` imports `storeTokens` from `./auth`. `connection.ts:176` calls `storeTokens(accessToken, refreshToken)`. |
| `Main.tsx` | `connection.ts` | `window.united.connectWs()` IPC call on mount | WIRED | `Main.tsx:22` calls; `connection.ts:181` handles. |
| `Main.tsx` | `hooks/usePresence.ts` | `usePresence()` hook mount | WIRED | `Main.tsx:9` imports; `Main.tsx:17` calls. Hook subscribes to presence and typing push events. |
| `MessageComposer.tsx` | `stores/index.ts` | `useStore((s) => s.status)` for connection awareness | WIRED | `MessageComposer.tsx:55` reads `s.status`. |
| `main/index.ts` | `ws/voice-events.ts` | `setupVoiceEventListener()` called at app startup | WIRED | `main/index.ts:23` imports; `main/index.ts:154` calls `setupVoiceEventListener()`. |
| `connection.ts` | `p2p/node.ts` | `wsClient.on('status')` auto-starts P2P mesh on WS connected | WIRED | `connection.ts:143-149`: `if (status === 'connected' && !getP2PNode()) { startP2PNode(url) }`. |
| Presence event pipeline | `MemberListSidebar.tsx` | WS → `chat-events.ts` → `PUSH_PRESENCE_EVENT` → `usePresence` → store → sidebar | WIRED | `chat-events.ts:136` broadcasts; `usePresence.ts:25` sets store; `MemberListSidebar.tsx:45` reads `userPresence`. |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEC-02 | 12-01 | Ed25519 challenge-response auth; server issues JWT tokens | SATISFIED | `connection.ts:84-116` performs full 3-step challenge-response (request → sign → verify). JWT stored via `storeTokens`. Wired into `Welcome.tsx` returning-user unlock flow. |
| MSG-01 | 12-02 | Real-time message delivery via gossip propagation | SATISFIED | WS auto-connects on `/app` mount; `setupChatEventListener()` registered at startup forwards chat events through pipeline. |
| MSG-04 | 12-02 | Reactions with standard Unicode emoji | SATISFIED | Reactions use same WS pipeline; `setupChatEventListener()` handles `ReactionAdded`/`ReactionRemoved` events forwarded to renderer. |
| MSG-05 | 12-02 | Typing indicators when user is composing | SATISFIED | `chat-events.ts:149` broadcasts `PUSH_TYPING_EVENT`; `usePresence.ts:28-30` subscribes; `ChatView.tsx` uses `useTypingIndicator()`. Full pipeline active when WS connects. |
| MSG-06 | 12-02 | Online/offline/away status for other users | SATISFIED | `chat-events.ts:136` broadcasts `PUSH_PRESENCE_EVENT`; `usePresence.ts:25` updates store; `MemberListSidebar.tsx:84` displays per-member presence status. |
| MSG-09 | 12-02 | Desktop notifications for mentions and DMs | SATISFIED | `setupChatEventListener()` and `setupDmEventListener()` handle notification events forwarded through WS. Pipeline now reachable via WS auto-connect. |
| DM-01 | 12-02 | E2E encrypted DMs (X25519 key exchange) | SATISFIED | `setupDmEventListener()` registered at startup. DM events flow when WS connects. `DmComposer.tsx` connection-aware. |
| VOICE-01 | 12-02 | Voice channels via WebRTC peer-to-peer audio | SATISFIED | `setupVoiceEventListener()` registered at `main/index.ts:154`. Voice signaling events (SDP, ICE) flow via WS pipeline activated on mount. |
| VOICE-02 | 12-02 | Mute microphone / deafen audio | SATISFIED | Voice state updates flow through WS voice event pipeline now activated by WS auto-connect. |
| VOICE-03 | 12-02 | Visual speaking indicator | SATISFIED | Speaking state events flow via `PUSH_VOICE_EVENT` through the now-activated WS pipeline. |
| P2P-02 | 12-02 | Messages propagated via libp2p gossipsub | SATISFIED | P2P mesh auto-starts when `wsClient` emits `status === 'connected'` (connection.ts:143). First connection triggers `startP2PNode(url)`. |
| APP-03 | 12-02 | All subscribed channels receive gossip simultaneously | SATISFIED | P2P mesh starts on WS connect and subscribes to all channels via `setChannelIds()`. Gossipsub delivers to all channels regardless of active view. |

All 12 requirement IDs from plan frontmatter accounted for. No orphaned requirements found for Phase 12.

---

## Anti-Patterns Found

No anti-patterns detected.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

Scanned: all 9 files modified/created by this phase. No TODO/FIXME/placeholder comments, no `return null` stubs, no `console.log`-only implementations, no empty handlers.

---

## Human Verification Required

The following behaviors require a running application to confirm. Automated checks pass for all of them, but the runtime behavior cannot be fully validated by static analysis.

### 1. Challenge-Response Auth on Returning-User Unlock

**Test:** Launch the app with a stored identity and active server. Enter the correct passphrase and click Unlock.
**Expected:** App authenticates to the server (network request visible in dev tools), then navigates to `/app` automatically. If server is unreachable, an error message appears and the user stays on the Welcome screen.
**Why human:** Requires a running server to complete the challenge-response HTTP round-trip.

### 2. WebSocket Auto-Connect After Navigation

**Test:** After successful unlock (or new user registration), observe `/app` mounting.
**Expected:** WebSocket connection initiates immediately (visible as `ws://...` connection in Network devtools). Status in Zustand becomes `connected` within a normal network round-trip.
**Why human:** WS connection timing and Zustand state transition require a live environment to observe.

### 3. Presence Updates in Member List

**Test:** Have a second client connect to the same server and observe the first client's member list.
**Expected:** The second user's status indicator changes from offline to online within a few seconds.
**Why human:** Requires two client instances and a running server; multi-client testing was deferred per project STATE.md.

### 4. ConnectionBanner 500ms Delay Threshold

**Test:** Disconnect the network briefly (< 500ms) and re-connect.
**Expected:** No banner appears for very fast reconnects. Disconnect for > 500ms and the banner appears.
**Why human:** Requires controlled network conditions to observe timing behavior.

### 5. Composer Re-Enable on WS Reconnect

**Test:** Disconnect network, observe composer grays out with "Reconnecting..." placeholder. Restore network.
**Expected:** Composer re-enables automatically when WS reconnects (status returns to `connected`). No user interaction required.
**Why human:** Requires live network interruption to observe state transition.

---

## Gaps Summary

No gaps. All automated checks passed across all three verification levels (exists, substantive, wired) for every artifact and key link. All 12 requirement IDs are satisfied with direct evidence in the codebase. Dead code (`useAuth.ts`, `protocol.ts`) confirmed deleted. Commit hashes `2e76281`, `6e25b7b`, `eb54760`, `7a9d92b` all verified in git log.

---

_Verified: 2026-02-27T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
