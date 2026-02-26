---
phase: 04-real-time-chat
plan: 02
subsystem: client
tags: [zustand, ipc, websocket, protobuf, chat, presence, notifications, electron, react-hooks]

# Dependency graph
requires:
  - phase: 04-real-time-chat/01
    provides: "Server REST API for messages, reactions, presence, last-read; WS broadcast for chat events; protobuf schemas (chat.proto, presence.proto)"
  - phase: 01-foundation
    provides: "Electron IPC bridge pattern, Zustand slice composition, WS client with reconnection"
  - phase: 03-p2p-networking
    provides: "WS protobuf envelope decode/encode pattern, gossipsub message types"
provides:
  - "IPC handlers for chat send/history/edit/delete, reactions, presence, last-read, notifications"
  - "Zustand messages slice with per-channel windowed arrays (500 cap), dedup by server_sequence"
  - "Zustand presence slice with status tracking and 3s typing timeout"
  - "Zustand notifications slice with mention counts and per-channel prefs"
  - "useMessages hook for chat data subscription and scroll management"
  - "usePresence hook for presence/typing event subscription"
  - "WS event forwarder decoding Phase 4 protobuf envelopes to renderer"
  - "Preload bridge extensions for chat, reactions, presence, lastRead, notifications"
  - "npm dependencies: react-markdown, remark-gfm, rehype-highlight, highlight.js, emoji-picker-react, date-fns, @tanstack/react-virtual"
affects: [04-real-time-chat/03, 04-real-time-chat/04, 04-real-time-chat/05]

# Tech tracking
tech-stack:
  added: [react-markdown, remark-gfm, rehype-highlight, highlight.js, emoji-picker-react, date-fns, "@tanstack/react-virtual", "@bufbuild/buf", "@bufbuild/protoc-gen-es"]
  patterns: [per-channel-message-windowing, typing-timeout-auto-clear, idle-detection-via-powerMonitor, notification-coalescing, ws-protobuf-event-forwarding]

key-files:
  created:
    - client/src/main/ipc/chat.ts
    - client/src/main/ipc/presence.ts
    - client/src/main/ipc/notifications.ts
    - client/src/main/ws/chat-events.ts
    - client/src/renderer/src/stores/messages.ts
    - client/src/renderer/src/stores/presence.ts
    - client/src/renderer/src/stores/notifications.ts
    - client/src/renderer/src/hooks/useMessages.ts
    - client/src/renderer/src/hooks/usePresence.ts
  modified:
    - client/src/main/ipc/channels.ts
    - client/src/main/index.ts
    - client/src/preload/index.ts
    - client/src/renderer/src/stores/index.ts
    - shared/types/ipc-bridge.ts
    - client/package.json

key-decisions:
  - "Per-channel message cap of 500 with oldest-end trimming on append, oldest-end trimming on history prepend"
  - "Typing timeout 3s via window.setTimeout with auto-clear on unmount"
  - "Idle detection via Electron powerMonitor.getSystemIdleTime() polled every 30s, threshold 15min"
  - "Notification coalescing: 2s window per channel, skip if window focused on same channel"
  - "WS event forwarding uses protobuf envelope decode with switch on payload.case"
  - "Installed buf + protoc-gen-es in shared/ for proto codegen (was missing)"

patterns-established:
  - "Message store: Record<channelId, ChannelMessages> with dedup by server_sequence"
  - "Typing indicator: addTypingUser sets setTimeout, re-entry clears old timer"
  - "WS chat event listener: separate module (chat-events.ts) from WS client, registered in main/index.ts"
  - "Push event triple: PUSH_CHAT_EVENT, PUSH_TYPING_EVENT, PUSH_PRESENCE_EVENT"
  - "Hook pattern: useMessages(channelId) auto-loads on mount, sets up IPC listener, returns { messages, hasMore, loading, loadOlder }"

requirements-completed: [MSG-01, MSG-02, MSG-05, MSG-06, MSG-07, APP-03, SEC-03]

# Metrics
duration: 13min
completed: 2026-02-26
---

# Phase 4 Plan 02: Client Data Layer Summary

**IPC handlers for chat/presence/notifications, 3 Zustand store slices with message windowing and typing timeouts, WS protobuf event forwarding, subscription hooks, and preload bridge extensions**

## Performance

- **Duration:** 13 min
- **Started:** 2026-02-26T02:54:12Z
- **Completed:** 2026-02-26T03:07:00Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Full client-side data pipeline for chat: IPC handlers call server REST API for message send/history/edit/delete/reactions/last-read/presence
- Zustand messages slice with per-channel windowed arrays (max 500), deduplication by server_sequence, unread tracking via lastReadSequence
- WS event forwarder decodes protobuf envelopes and broadcasts 7 event types (new message, edit, delete, reaction add/remove, presence, typing) to renderer
- Presence slice tracks all users' online/offline/away/dnd status with 3s typing timeouts
- 15-minute idle detection via Electron powerMonitor with automatic away/online transitions
- Desktop notification support with per-channel muting, mention-only default, 2s coalescing
- 7 new npm dependencies installed for Phase 4 UI (react-markdown, highlight.js, emoji-picker, date-fns, etc.)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create IPC channel constants** - `def7ab3` (chore)
2. **Task 2: IPC handlers, Zustand stores, and WS event forwarding** - `4a32f07` (feat)

## Files Created/Modified
- `client/src/main/ipc/chat.ts` - IPC handlers for send, fetchHistory, edit, delete, reactions, lastRead
- `client/src/main/ipc/presence.ts` - IPC handlers for presence set/fetch, 15min idle detection
- `client/src/main/ipc/notifications.ts` - Desktop notification display with 2s coalescing, click-to-navigate
- `client/src/main/ws/chat-events.ts` - WS protobuf envelope decoder forwarding Phase 4 events to renderer
- `client/src/renderer/src/stores/messages.ts` - Zustand slice: per-channel messages, dedup, windowing, unread
- `client/src/renderer/src/stores/presence.ts` - Zustand slice: user presence, per-channel typing with 3s timeout
- `client/src/renderer/src/stores/notifications.ts` - Zustand slice: mention counts, per-channel notification prefs
- `client/src/renderer/src/stores/index.ts` - RootStore extended with MessagesSlice, PresenceSlice, NotificationsSlice
- `client/src/renderer/src/hooks/useMessages.ts` - Hook: auto-load, IPC listener, markRead, loadOlder
- `client/src/renderer/src/hooks/usePresence.ts` - Hook: presence/typing subscriptions, typing indicator text
- `client/src/preload/index.ts` - Bridge extended with chat, reactions, presence, lastRead, notifications, 3 push listeners
- `client/src/main/index.ts` - Registers chat, presence, notification handlers and chat event listener
- `client/src/main/ipc/channels.ts` - 14 new IPC channel constants + 3 push event channels
- `shared/types/ipc-bridge.ts` - ChatMessage, ReactionSummary, ChatEvent, PresenceUpdate, TypingEvent, NotificationPrefs types
- `client/package.json` - 7 new dependencies

## Decisions Made
- Per-channel message cap set to 500 (balance between memory usage and scroll-back depth); trims from oldest on append, from newest on history load
- Typing timeout set to 3s per CONTEXT.md specification, using window.setTimeout with cleanup on removal
- Idle detection polls every 30s via powerMonitor.getSystemIdleTime(); 15min threshold auto-sets away, respects manual DND
- WS event forwarding creates a separate module (chat-events.ts) rather than extending the existing discovery.ts listener -- cleaner separation of concerns
- Notification coalescing uses a 2s window per channel with timer reset pattern
- Installed @bufbuild/buf and @bufbuild/protoc-gen-es as devDependencies in shared/ since they were missing for proto codegen

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing buf and protoc-gen-es for proto codegen**
- **Found during:** Task 2 (WS event forwarding)
- **Issue:** The shared/ directory had buf.gen.yaml but no buf CLI or protoc-gen-es installed. Generated TypeScript proto types were needed for the WS event decoder.
- **Fix:** Installed @bufbuild/buf and @bufbuild/protoc-gen-es as devDependencies in shared/, ran buf generate to produce chat_pb.ts and presence_pb.ts
- **Files modified:** shared/package.json, shared/package-lock.json
- **Verification:** `npx buf generate` succeeds, imports resolve in chat-events.ts
- **Committed in:** 4a32f07 (Task 2 commit)

**2. [Rule 3 - Blocking] Reorganized git history for clean task separation**
- **Found during:** Task 2 (commit phase)
- **Issue:** Prior plan 04-01 server changes were uncommitted in working tree and got mixed into the staging area during Task 2 commit attempt
- **Fix:** Soft-reset and re-committed with proper separation: 04-01 server changes in one commit, 04-02 client changes in another
- **Files modified:** (git history only)
- **Verification:** `git log` shows clean separation between 04-01 and 04-02 commits
- **Committed in:** 429213b (04-01), 4a32f07 (04-02)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary -- proto codegen needed for WS decoder, git history needed clean separation. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Client data layer is complete and ready for the chat UI (plan 03) to render messages, send new ones, and react to real-time events
- All IPC methods, store slices, and hooks are typed and composable
- The useMessages hook handles auto-loading, deduplication, and push event subscription so the UI layer can focus purely on rendering
- npm dependencies for markdown rendering, emoji picker, and virtualized list are installed and ready

## Self-Check: PASSED

All 15 created/modified files verified on disk. Both task commits (def7ab3, 4a32f07) found in git history.

---
*Phase: 04-real-time-chat*
*Completed: 2026-02-26*
