---
phase: 04-real-time-chat
plan: 03
subsystem: ui
tags: [react, tanstack-virtual, react-markdown, highlight.js, chat, virtualization, markdown, composer]

# Dependency graph
requires:
  - phase: 04-real-time-chat/02
    provides: "IPC handlers, Zustand message/presence/notification stores, useMessages hook, WS event forwarding, npm deps"
  - phase: 04-real-time-chat/01
    provides: "Server REST API for messages, WS broadcast for chat events, protobuf schemas"
  - phase: 02-server-management
    provides: "Channel CRUD, ChannelSidebar with setActiveChannel, MainContent with renderPanel pattern"
provides:
  - "ChatView with @tanstack/react-virtual virtualized message list"
  - "MessageGroup component with 5-min same-sender grouping and date separators"
  - "MessageRow with full/grouped display modes, inline reply preview, reactions, context menu"
  - "MarkdownContent with react-markdown, remark-gfm, rehype-highlight (atom-one-dark)"
  - "MessageComposer with auto-expanding textarea, Enter-to-send, reply mode"
  - "HoverToolbar with react/reply/more action buttons"
  - "MainContent integration: renders ChatView when activeChannelId is set"
affects: [04-real-time-chat/04, 04-real-time-chat/05]

# Tech tracking
tech-stack:
  added: []
  patterns: [virtualized-message-list, message-grouping-by-sender-time, stick-to-bottom-auto-scroll, infinite-scroll-up-history, auto-expanding-textarea, pubkey-derived-avatar-color]

key-files:
  created:
    - client/src/renderer/src/components/ChatView.tsx
    - client/src/renderer/src/components/MessageGroup.tsx
    - client/src/renderer/src/components/MessageRow.tsx
    - client/src/renderer/src/components/MessageComposer.tsx
    - client/src/renderer/src/components/MarkdownContent.tsx
    - client/src/renderer/src/components/HoverToolbar.tsx
  modified:
    - client/src/renderer/src/components/MainContent.tsx

key-decisions:
  - "Atom-one-dark highlight.js theme for code block syntax highlighting (dark-mode-first)"
  - "Pubkey hash-derived HSL hue for avatar colors (deterministic, no server lookup)"
  - "useVirtualizer count on message groups (not individual messages) for correct height measurement"
  - "Stick-to-bottom threshold of 50px for auto-scroll detection"
  - "Context menu rendered as fixed-position portal-style overlay via client coordinates"

patterns-established:
  - "Message grouping: groupMessages() utility processes flat ChatMessage[] into MessageGroupData[] by sender + 5-min window + day boundaries"
  - "Scroll position tracking: isAtBottom state + hasNewMessages flag + floating 'New messages' button pattern"
  - "Reply mode: replyTo state in ChatView passed down to MessageComposer, set by HoverToolbar/ContextMenu onReply callback"
  - "Auto-expanding textarea: scrollHeight measurement with min/max height bounds and overflow toggle"

requirements-completed: [MSG-01, MSG-02, MSG-03, SEC-03, APP-03]

# Metrics
duration: 6min
completed: 2026-02-26
---

# Phase 4 Plan 03: Chat UI Summary

**Virtualized chat view with Discord-style message groups, markdown rendering with syntax highlighting, auto-expanding composer, hover toolbar, and inline reply flow wired to plan 02 data layer**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-26T03:21:23Z
- **Completed:** 2026-02-26T03:27:37Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Full chat view with @tanstack/react-virtual windowed rendering of message groups, supporting 500+ messages without performance degradation
- Discord-style message grouping: consecutive messages from same sender within 5 minutes collapse under shared header, with date separators between days
- Markdown rendering with GFM tables/strikethrough, syntax-highlighted fenced code blocks (atom-one-dark), inline code, blockquotes, links opening in external browser
- Auto-expanding MessageComposer (1-5 lines then scroll), Enter sends / Shift+Enter newline, reply mode with preview bar
- HoverToolbar with react/reply/more action buttons, right-click context menu with reply/edit/delete/copy
- Ed25519 signature verification indicator (shield icon) on each message header
- MainContent routes to ChatView when activeChannelId is set, welcome screen when no channel selected

## Task Commits

Each task was committed atomically:

1. **Task 1: MarkdownContent, MessageRow, MessageGroup, HoverToolbar** - `1b5dc25` (feat)
2. **Task 2: ChatView with virtualized list and MessageComposer** - `c45cfa9` (feat)

## Files Created/Modified
- `client/src/renderer/src/components/MarkdownContent.tsx` - Memoized react-markdown wrapper with remark-gfm, rehype-highlight, custom component overrides
- `client/src/renderer/src/components/MessageRow.tsx` - Full/grouped message display with reply preview, reactions, context menu, signature indicator
- `client/src/renderer/src/components/MessageGroup.tsx` - Group renderer + groupMessages() utility for 5-min same-sender grouping
- `client/src/renderer/src/components/HoverToolbar.tsx` - Floating action bar (react, reply, more) on message hover
- `client/src/renderer/src/components/ChatView.tsx` - Main chat view with useVirtualizer, stick-to-bottom, infinite scroll-up, typing indicator
- `client/src/renderer/src/components/MessageComposer.tsx` - Auto-expanding textarea with Enter-to-send and reply mode
- `client/src/renderer/src/components/MainContent.tsx` - Added ChatView import, renders ChatView when activeChannelId is set

## Decisions Made
- Chose atom-one-dark highlight.js theme over github-dark for better contrast in UNITED's dark-mode-first design
- Avatar colors derived from pubkey hash (HSL hue rotation) -- deterministic, no server-side color storage needed
- Virtualizer counts message groups rather than individual messages, so each group gets measured as a unit for correct dynamic height
- Stick-to-bottom detection uses 50px threshold (not exact 0) to avoid jitter from fractional scroll calculations
- Context menu uses fixed positioning with clientX/clientY coordinates rather than portal, keeping DOM structure simple

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chat UI is complete and wired to the plan 02 data layer (useMessages hook, presence store)
- Plan 04 (user profiles, presence display, @mentions) can build on the message rendering and member list
- Plan 05 (emoji reactions, unread tracking) can extend the reaction pills and notification badge system
- All 6 new components are self-contained with clean prop interfaces for future extension

## Self-Check: PASSED

All 7 created/modified files verified on disk. Both task commits (1b5dc25, c45cfa9) found in git history.

---
*Phase: 04-real-time-chat*
*Completed: 2026-02-26*
