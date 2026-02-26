# Phase 4: Real-Time Chat - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Real-time text messaging in channels — sending/receiving messages with server-assigned ordering, markdown formatting, emoji reactions, @mentions, typing indicators, presence status (online/offline/away), unread tracking, desktop notifications, user profiles, and Ed25519 message signing. All connected peers in a channel see messages appear in real-time. Message history loads from peers or server fallback in a virtualized list.

</domain>

<decisions>
## Implementation Decisions

### Message grouping & timestamps
- Collapsed grouping (Discord-style): consecutive messages from the same user within ~5 minutes share one avatar/name header, subsequent messages stack as body-only
- New group starts on time gap or different user
- Timestamp visible on group headers; hover individual messages within a group for exact time
- Date separators between days

### Message composer
- Single-line auto-expanding: starts as one line, grows as user types (up to ~5 lines), then scrolls internally
- Enter to send, Shift+Enter for newline
- Supports markdown preview and @mention autocomplete inline

### Message actions
- Hover toolbar: small floating toolbar appears on message hover with quick actions (react, reply, more...)
- Right-click also opens full context menu with all actions (edit, delete, copy, pin, etc.)
- Both access methods available simultaneously

### Edit & delete
- Users can edit their own messages (shows "(edited)" marker, no time limit)
- Users can delete their own messages (shows "message deleted" placeholder, no time limit)
- Delete is best-effort across peers — removed from server, peers requested to drop cached copy
- Admins can delete any message (already built in Phase 2 moderation)

### Inline replies
- Discord-style inline reply: click reply on a message, quoted preview of the original appears above your new message
- Conversation stays in the channel — no separate thread view
- Clicking the quoted preview scrolls to the original message

### Markdown & code blocks
- Full markdown support: bold, italic, code (inline + fenced blocks), lists, quotes
- Fenced code blocks with syntax highlighting (language detection from tag)
- Inline code gets monospace with background

### Link handling
- URLs detected and rendered as clickable links (highlighted, opens in external browser)
- No rich embeds / preview cards in Phase 4 — deferred to later phase

### Presence display
- Member list sidebar: colored dot + text label (Online, Away, Do Not Disturb, Offline)
- Message avatars: colored dot only (green/yellow/gray)
- Preset statuses only: Online, Away, Do Not Disturb, Offline — no custom status text in Phase 4

### Idle timeout
- 15-minute idle timeout before automatically switching to Away
- Users can manually set Away or DND at any time

### Typing indicators
- Text-based below composer: "Alice is typing...", "Alice and Bob are typing...", "Several people are typing..."
- Fixed position in slim bar above the composer — no layout jank, no message list shifting

### Unread indicators
- Two-tier system: bold channel name for unread, red badge with mention count for @mentions
- Server icon in rail also shows aggregated badge when channels have mentions
- Mark as read: right-click channel or right-click server icon ("Mark all as read")

### Desktop notifications
- Default trigger: @mentions and role mentions only (per-channel opt-in for all messages available)
- Full preview content: server name, channel name, sender name, first ~100 chars of message
- Per-user setting to switch to minimal notifications (sender + "mentioned you in #channel")
- Clicking notification opens the relevant channel

### Emoji reactions
- Compact pills below messages: emoji + count (e.g., "thumbs-up 3")
- Click pill to toggle your reaction on/off
- Hover pill to see list of who reacted
- Emoji picker: grid layout organized by category, recently-used section at top, search bar for filtering

### @mention autocomplete
- Typing '@' immediately triggers filterable dropdown of users and roles
- Arrow keys to navigate, Enter/Tab to select, Escape to dismiss
- Works for both user mentions and role mentions

### @mention rendering
- Highlighted pill/chip with subtle background color — stands out from surrounding text
- Messages mentioning YOU get a distinct background highlight (e.g., yellow-tinted) on the entire message row
- Clickable to open user profile popup

### Claude's Discretion
- Exact syntax highlighting library choice (highlight.js, Shiki, Prism, etc.)
- Hover toolbar icon selection and positioning logic
- Emoji picker grid sizing, category icons, and search algorithm
- Exact colors for presence dots and mention highlights
- Typing indicator debounce/throttle timing
- Virtualized list implementation details
- Message signature verification UI (how to indicate verified vs unverified)

</decisions>

<specifics>
## Specific Ideas

- Discord-style collapsed message groups — same user within a time window shares one header
- Twitter-style "new posts indicator" approach was considered for unread but not adopted — standard bold + badge chosen instead
- Emphasis on matching Discord patterns throughout: hover toolbar, pill reactions, @-trigger autocomplete, presence dots
- UNITED's audience is technical/self-hosting — syntax highlighting in code blocks is table stakes, not a nice-to-have

</specifics>

<deferred>
## Deferred Ideas

- Rich link embeds (OpenGraph preview cards) — significant feature with server-side fetching, SSRF protection, caching. Purely additive, can be its own phase or enhancement.
- Custom status text (free-text status + emoji with duration) — nice-to-have but not core to Phase 4's chat requirements. Preset statuses cover the need.
- Thread/forum-style replies — Phase 4 uses inline replies only. Full threading could be a future enhancement.

</deferred>

---

*Phase: 04-real-time-chat*
*Context gathered: 2026-02-25*
