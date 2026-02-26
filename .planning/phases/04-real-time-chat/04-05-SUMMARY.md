---
phase: 04-real-time-chat
plan: 05
subsystem: chat, ui, notifications
tags: [emoji-picker-react, react, zustand, mentions, unread, notifications, electron, ipc]

# Dependency graph
requires:
  - phase: 04-03
    provides: "ChatView, MessageRow, MessageComposer, HoverToolbar, MarkdownContent"
  - phase: 04-04
    provides: "Presence store for display name map, MemberListSidebar"
  - phase: 04-02
    provides: "Zustand message/notification stores, WS chat-event forwarder, useMessages hook"
  - phase: 04-01
    provides: "Reaction REST endpoints, WS broadcast for reaction events"
provides:
  - "EmojiPicker component with React.lazy code splitting and portal positioning"
  - "ReactionPills component with toggle, hover tooltips, and add button"
  - "MentionAutocomplete dropdown with keyboard navigation and user/role filtering"
  - "UnreadBadge component with red mention count badge"
  - "@mention token rendering as highlighted pills in MarkdownContent"
  - "Unread channel indicators (bold name + mention badge) in ChannelSidebar"
  - "Aggregated mention badge on ServerRail icon with Mark All as Read"
  - "Desktop notification pipeline for @mentions via IPC"
  - "Notification click navigation to relevant channel"
  - "Mark-as-read on channel view, scroll-to-bottom, and context menu"
affects: [05-dm-system]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "@mention token format: @[display_name](user:id) or @[display_name](role:id)"
    - "Mention parsing in MarkdownContent with extractMentionIds utility"
    - "Renderer-triggered notifications via notifications.show IPC"
    - "Channel unread state computed from lastReadSequence vs latest server_sequence"

key-files:
  created:
    - "client/src/renderer/src/components/EmojiPicker.tsx"
    - "client/src/renderer/src/components/ReactionPills.tsx"
    - "client/src/renderer/src/components/MentionAutocomplete.tsx"
    - "client/src/renderer/src/components/UnreadBadge.tsx"
  modified:
    - "client/src/renderer/src/components/MessageRow.tsx"
    - "client/src/renderer/src/components/HoverToolbar.tsx"
    - "client/src/renderer/src/components/MessageComposer.tsx"
    - "client/src/renderer/src/components/MarkdownContent.tsx"
    - "client/src/renderer/src/components/ChannelList.tsx"
    - "client/src/renderer/src/components/ChannelSidebar.tsx"
    - "client/src/renderer/src/components/ServerRail.tsx"
    - "client/src/renderer/src/components/ChatView.tsx"
    - "client/src/main/ipc/channels.ts"
    - "client/src/main/ipc/notifications.ts"
    - "client/src/preload/index.ts"
    - "shared/types/ipc-bridge.ts"

key-decisions:
  - "@mention token format uses @[name](type:id) for safe parsing before markdown processing"
  - "Mention rendering splits into simple (inline spans) vs complex (markdown fallback) paths"
  - "Channel unread state computed in ChannelSidebar from message store sequence comparison"
  - "Desktop notifications triggered from renderer via IPC (not main process WS listener) for accurate mention detection"
  - "Notification click sends 'navigate' ChatEvent type to renderer for channel switching"
  - "EmojiPicker uses React.lazy with Suspense fallback for ~2.5MB bundle code splitting"

patterns-established:
  - "@mention token format: @[display_name](user:id) or @[display_name](role:id) -- parsed before markdown rendering"
  - "Unread state derivation: compare lastReadSequence to latest server_sequence per channel"
  - "Notification flow: renderer detects mention -> IPC to main -> Electron Notification -> click IPC back to renderer"
  - "Context menu evolution: ChannelList now supports both admin actions and user actions (Mark as Read)"

requirements-completed: [MSG-04, MSG-07, MSG-08, MSG-09, APP-05]

# Metrics
duration: 11min
completed: 2026-02-26
---

# Phase 4 Plan 05: Rich Chat Features Summary

**Emoji reactions with lazy-loaded picker, @mention autocomplete with highlighted rendering, unread badges with aggregated server indicator, desktop notifications for mentions, and mark-as-read system**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-26T04:04:18Z
- **Completed:** 2026-02-26T04:15:41Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Emoji picker opens from hover toolbar and reaction "+" button, lazy-loaded for bundle efficiency (~2.5MB code split)
- Reactions render as compact pills with emoji + count, toggle on click, hover shows who reacted with display names
- @mention autocomplete appears on '@' keystroke with debounced filtering of users and roles, full keyboard navigation
- Mention tokens render as highlighted blue pills in messages; messages mentioning current user get yellow background tint
- Unread channels show bold name in sidebar, mention channels show red badge with count
- Server icon shows aggregated mention badge across all channels
- Right-click context menu on channels offers "Mark as Read"; server icon offers "Mark All as Read"
- Desktop notifications fire for @mentions when window is not focused, with 2s coalescing window
- Clicking a notification navigates to the relevant channel via IPC

## Task Commits

Each task was committed atomically:

1. **Task 1: Emoji reactions (picker, pills, toggle)** - `ed5b3f9` (feat)
2. **Task 2: @mentions, unread badges, and desktop notifications** - `0f5386b` (feat)

## Files Created/Modified
- `client/src/renderer/src/components/EmojiPicker.tsx` - React.lazy wrapped emoji-picker-react with portal positioning
- `client/src/renderer/src/components/ReactionPills.tsx` - Compact pills with toggle, hover tooltips, add button
- `client/src/renderer/src/components/MentionAutocomplete.tsx` - Dropdown with keyboard nav, user/role filtering, 10-item limit
- `client/src/renderer/src/components/UnreadBadge.tsx` - Red badge for mention counts
- `client/src/renderer/src/components/MessageRow.tsx` - Added ReactionPills, EmojiPicker wiring, mention highlight detection
- `client/src/renderer/src/components/MessageComposer.tsx` - Added @mention detection, token insertion, autocomplete integration
- `client/src/renderer/src/components/MarkdownContent.tsx` - Added mention token parsing, rendering as styled spans, extractMentionIds utility
- `client/src/renderer/src/components/ChannelList.tsx` - Added unread state, bold names, mention badges, Mark as Read context menu
- `client/src/renderer/src/components/ChannelSidebar.tsx` - Computes and passes per-channel unread state to ChannelList
- `client/src/renderer/src/components/ServerRail.tsx` - Aggregated mention badge, Mark All as Read context menu
- `client/src/renderer/src/components/ChatView.tsx` - Mark-as-read on mount/scroll, mention detection, notification trigger, navigate handler
- `client/src/main/ipc/channels.ts` - Added NOTIFICATIONS_SHOW IPC channel
- `client/src/main/ipc/notifications.ts` - Added show handler with Electron Notification and click-to-navigate
- `client/src/preload/index.ts` - Added notifications.show bridge method
- `shared/types/ipc-bridge.ts` - Added notifications.show type and 'navigate' ChatEvent type

## Decisions Made
- @mention token format uses `@[name](type:id)` for safe parsing before markdown -- avoids markdown escaping issues
- Mention rendering has two code paths: simple messages render mentions as inline React spans, complex markdown content falls back to stripped rendering
- Channel unread state computed in ChannelSidebar by comparing lastReadSequence to latest server_sequence from the messages store
- Desktop notifications triggered from renderer via IPC rather than main process WS listener -- renderer has accurate mention detection with access to member/role data
- Notification click sends a 'navigate' ChatEvent back to renderer, which calls setActiveChannel
- EmojiPicker uses React.lazy with Suspense fallback to code-split the ~2.5MB emoji-picker-react package

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added notifications.show IPC method**
- **Found during:** Task 2 (Desktop notification pipeline)
- **Issue:** Plan specifies `window.united.notifications.show()` but this IPC method did not exist in the bridge
- **Fix:** Added NOTIFICATIONS_SHOW to IPC channels, handler in notifications.ts, bridge type in ipc-bridge.ts, preload binding
- **Files modified:** client/src/main/ipc/channels.ts, client/src/main/ipc/notifications.ts, client/src/preload/index.ts, shared/types/ipc-bridge.ts
- **Verification:** TypeScript compiles, IPC chain complete from renderer through preload to main process
- **Committed in:** 0f5386b (Task 2 commit)

**2. [Rule 3 - Blocking] Added 'navigate' ChatEvent type**
- **Found during:** Task 2 (Notification click handling)
- **Issue:** ChatEvent union type didn't include 'navigate' needed for notification click -> channel navigation
- **Fix:** Added 'navigate' to ChatEvent type union in ipc-bridge.ts
- **Files modified:** shared/types/ipc-bridge.ts
- **Verification:** TypeScript compiles, navigation handler in ChatView handles navigate events
- **Committed in:** 0f5386b (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary to complete the notification pipeline. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 (Real-Time Chat) is now complete with all 5 plans executed
- All 12 Phase 4 requirement IDs covered across plans 01-05
- Chat system includes: message CRUD, markdown rendering, reactions, @mentions, presence, typing indicators, unread tracking, and desktop notifications
- Ready for Phase 5 (DM System) which builds on the message infrastructure and mention system

## Self-Check: PASSED

- All 4 created files verified present on disk
- Commit ed5b3f9 (Task 1) found in git log
- Commit 0f5386b (Task 2) found in git log
- Client TypeScript compiles with no errors

---
*Phase: 04-real-time-chat*
*Completed: 2026-02-26*
