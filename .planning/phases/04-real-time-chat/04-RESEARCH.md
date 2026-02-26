# Phase 4: Real-Time Chat - Research

**Researched:** 2026-02-25
**Domain:** Real-time messaging, markdown rendering, virtualized lists, presence, notifications
**Confidence:** HIGH

## Summary

Phase 4 transforms UNITED from infrastructure into a usable chat application. The server-side P2P layer (gossipsub, message persistence with server-assigned sequence numbers, Ed25519 signature verification) is already built in Phase 3. The server's messages table schema already stores channel_id, sender_pubkey, message_type, payload, timestamp, sequence_hint, server_sequence, and signature. What Phase 4 must build is: (1) the server REST API for message history retrieval and new message event broadcast to WebSocket clients, (2) client-side message sending via gossipsub and/or WebSocket, (3) the full chat UI with markdown rendering, reactions, mentions, typing indicators, presence, unread tracking, and desktop notifications.

The project already has `@tanstack/react-virtual` in `package.json`, Zustand for state management with an established slice pattern, a protobuf-based WebSocket protocol with push events, and an IPC bridge architecture where the main process handles all network calls. The `p2p.proto` already defines `MessageType` enum with `CHAT`, `TYPING`, `PRESENCE`, and `TEST` variants. The `GossipEnvelope` already wraps messages with Ed25519 signatures. The core architectural challenge is bridging gossipsub messages to WebSocket clients so connected users see messages in real-time, and building the bidirectional flow: user types message -> sign -> publish to gossipsub + forward via WS -> all connected clients receive.

**Primary recommendation:** Build the chat feature in layers: (1) server-side message APIs and WS broadcast, (2) client-side message data layer and basic chat view, (3) rich text features (markdown, mentions, reactions), (4) presence, typing, unread, and notifications. Use react-markdown with rehype-highlight for markdown rendering, emoji-picker-react for the emoji picker, and the already-installed @tanstack/react-virtual for message virtualization.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Message grouping:** Collapsed Discord-style grouping (same user within ~5min shares one header). New group on time gap or different user. Date separators between days.
- **Message composer:** Single-line auto-expanding (up to ~5 lines then internal scroll). Enter to send, Shift+Enter for newline. Markdown preview and @mention autocomplete inline.
- **Message actions:** Hover toolbar (react, reply, more...) + right-click context menu with all actions (edit, delete, copy, pin, etc.)
- **Edit & delete:** Users edit own messages (shows "(edited)", no time limit). Users delete own messages (shows "message deleted" placeholder). Delete is best-effort across peers. Admins can delete any message.
- **Inline replies:** Discord-style quoted preview of original above reply. Click preview scrolls to original. No separate thread view.
- **Markdown & code blocks:** Full markdown (bold, italic, code, lists, quotes). Fenced code blocks with syntax highlighting (language detection from tag). Inline code with monospace + background.
- **Link handling:** URLs detected and rendered as clickable links. Open in external browser. No rich embeds/preview cards in Phase 4.
- **Presence display:** Member list sidebar has colored dot + text label (Online, Away, DND, Offline). Message avatars have colored dot only. Preset statuses only.
- **Idle timeout:** 15-minute auto-switch to Away. Manual Away/DND at any time.
- **Typing indicators:** Text-based below composer. Fixed position slim bar above composer. "Alice is typing...", "Alice and Bob are typing...", "Several people are typing..."
- **Unread indicators:** Two-tier: bold channel name for unread, red badge with mention count for @mentions. Server icon aggregated badge. Right-click "Mark as read".
- **Desktop notifications:** Default trigger: @mentions and role mentions only (per-channel opt-in for all messages). Full preview content. Per-user minimal notification setting. Click opens relevant channel.
- **Emoji reactions:** Compact pills below messages (emoji + count). Click to toggle. Hover to see who reacted. Emoji picker: grid by category, recently-used at top, search bar.
- **@mention autocomplete:** '@' triggers filterable dropdown of users and roles. Arrow keys/Enter/Tab/Escape.
- **@mention rendering:** Highlighted pill/chip. Messages mentioning YOU get distinct background highlight on entire row. Clickable to open user profile popup.

### Claude's Discretion
- Exact syntax highlighting library choice (highlight.js, Shiki, Prism, etc.)
- Hover toolbar icon selection and positioning logic
- Emoji picker grid sizing, category icons, and search algorithm
- Exact colors for presence dots and mention highlights
- Typing indicator debounce/throttle timing
- Virtualized list implementation details
- Message signature verification UI (how to indicate verified vs unverified)

### Deferred Ideas (OUT OF SCOPE)
- Rich link embeds (OpenGraph preview cards) -- deferred to later phase
- Custom status text (free-text status + emoji with duration) -- preset statuses cover the need
- Thread/forum-style replies -- Phase 4 uses inline replies only
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MSG-01 | Send/receive text messages in channels with real-time delivery via gossip (<100ms to connected peers) | GossipEnvelope already built in Phase 3. Server persists + broadcasts via WS. Client sends via gossipsub or WS relay. |
| MSG-02 | View message history by scrolling back, fetching from peers or server fallback | Server REST API for paginated message history by server_sequence. @tanstack/react-virtual for virtualized reverse-scroll list. |
| MSG-03 | Format messages with markdown (bold, italic, code blocks, lists, quotes) | react-markdown + remark-gfm + rehype-highlight. Custom components for code blocks. |
| MSG-04 | React to messages with standard Unicode emoji | emoji-picker-react for picker. Reactions stored as sub-messages or separate DB table. Compact pill rendering. |
| MSG-05 | See typing indicators when another user is composing | MessageType.TYPING in GossipEnvelope. Debounce 2s send, 3s timeout to clear. Fixed bar above composer. |
| MSG-06 | See online/offline/away status for other users | MessageType.PRESENCE in GossipEnvelope. Peer directory + WS push for status changes. 15-min idle timeout. |
| MSG-07 | See unread indicators on channels with new messages | Client-side last-read sequence tracking per channel. Compare to latest server_sequence. Badge count for mentions. |
| MSG-08 | @mention specific users or roles to trigger notifications | Mention parsing in message content (@username / @role). Autocomplete dropdown. Server extracts mentions for notification routing. |
| MSG-09 | Desktop notifications for mentions and DM messages | Electron Notification API from main process. IPC push from message handler. Click-to-navigate. |
| SEC-03 | All messages signed by author's Ed25519 key; peers verify before displaying | Already built: GossipEnvelope has sender_pubkey + signature fields. decode_and_verify_gossip_envelope() exists. Client needs verification + UI indicator. |
| APP-03 | All subscribed channels receive gossip simultaneously | Phase 3 subscribes all channels at startup. WS broadcast sends to all connected clients regardless of active channel. |
| APP-05 | User profiles display name, avatar, and custom status text | Member list with presence info. Profile popup on @mention click. Avatar (initial-based for now), display name, status. |
</phase_requirements>

## Standard Stack

### Core (Already in Project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-virtual | ^3.13.18 | Virtualized message list | Already installed. Headless, framework-agnostic, dynamic height support. |
| zustand | ^5.0.8 | State management | Already installed. Slice pattern established for channels, roles, auth. |
| @bufbuild/protobuf | ^2.11.0 | Wire format encoding | Already installed. Shared proto schemas between server and client. |
| react | ^19.0.0 | UI framework | Already installed. |
| tailwindcss | ^4.2.1 | Styling | Already installed. |
| prost | (Cargo) | Server-side protobuf | Already in server Cargo.toml. |
| libp2p | 0.56 | P2P networking | Already in server. Gossipsub configured with D=4, D_lo=3, D_hi=8. |

### New Dependencies (Phase 4)

| Library | Version | Purpose | Why This One |
|---------|---------|---------|--------------|
| react-markdown | ^10.x | Markdown to React components | Industry standard. No dangerouslySetInnerHTML. CommonMark + GFM via plugins. Huge remark/rehype plugin ecosystem. |
| remark-gfm | ^4.x | GitHub Flavored Markdown | Tables, strikethrough, task lists. Required for chat-quality markdown. |
| rehype-highlight | ^7.x | Syntax highlighting in code blocks | Uses highlight.js under the hood. Lightweight (~50KB gzip for common languages). Runtime highlighting suitable for chat. |
| highlight.js | ^11.x | Syntax highlighting engine | Peer dependency of rehype-highlight. 189 languages, auto-detection, ~50KB gzipped for common subset. Better than Shiki for client-side chat (Shiki is SSR-focused, 9MB unpacked). |
| emoji-picker-react | ^4.x | Emoji picker component | Most popular React emoji picker. Native Unicode emoji (no CDN images). Categories, search, skin tones, recently-used. ~2.5MB but lazy-loaded on demand. |
| date-fns | ^4.x | Date formatting for timestamps | Lightweight (tree-shakeable), immutable. For relative time ("2 min ago") and date separators. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| highlight.js | Shiki | Shiki = VS Code quality but 9MB unpacked, SSR-focused, slower client-side init. highlight.js is lighter, runtime-friendly, covers common languages well. |
| highlight.js | Prism | Similar quality to highlight.js but less automatic language detection. highlight.js auto-detects, which is nice when users forget the language tag. |
| emoji-picker-react | frimousse | Frimousse is lighter (3KB) but unstyled -- requires building entire UI. emoji-picker-react is ready-to-use with search, categories, skin tones. |
| emoji-picker-react | emoji-mart | emoji-mart is feature-rich but heavier and framework-agnostic (not React-optimized). emoji-picker-react is React-native. |
| @tanstack/react-virtual | virtua | Virtua has better built-in reverse scrolling (~3KB). However, @tanstack/react-virtual is already installed and has more community resources. Stick with what's installed. |
| date-fns | dayjs / moment | moment is deprecated. dayjs is fine but date-fns is more tree-shakeable and already widely used. |

**Installation:**
```bash
cd client && npm install react-markdown remark-gfm rehype-highlight highlight.js emoji-picker-react date-fns
```

No new server Rust dependencies needed -- the messaging infrastructure (libp2p, prost, ed25519-dalek, rusqlite) is already in place.

## Architecture Patterns

### Message Flow Architecture

The critical architectural pattern for Phase 4 is the dual-path message delivery system:

```
SENDER:
  User types message
  -> Client signs with Ed25519
  -> Client publishes via gossipsub (P2P path - direct to mesh peers)
  -> Client ALSO sends via WS to server (reliability path)

SERVER RECEIVES (from gossipsub subscription):
  GossipEnvelope arrives
  -> decode_and_verify_gossip_envelope() [already built]
  -> handle_gossip_message() assigns server_sequence [already built]
  -> Server broadcasts NewMessage event to all connected WS clients

CLIENT RECEIVES:
  Via gossipsub (fast, <100ms) OR via WS push (reliable fallback)
  -> Deduplicate by message hash/sequence
  -> Insert into local message store
  -> Re-render if in active channel
```

This dual-path ensures: gossipsub gives <100ms latency when peers are meshed, WS gives 100% reliability through the server.

### Recommended Project Structure (New/Modified Files)

```
shared/proto/
  chat.proto              # NEW: ChatMessage, Reaction, EditMessage, DeleteMessage
  presence.proto          # NEW: PresenceUpdate, TypingIndicator
  ws.proto                # MODIFIED: Add Phase 4 payload variants (120-149)

server/src/
  chat/                   # NEW module
    mod.rs                # Module declarations
    messages.rs           # REST API: GET /api/channels/{id}/messages (paginated)
    reactions.rs          # REST API: POST/DELETE /api/messages/{id}/reactions
    broadcast.rs          # WS broadcast for new messages, edits, deletes, reactions
  db/
    migrations.rs         # MODIFIED: Migration 4 - reactions table, message edits
    models.rs             # MODIFIED: Add Reaction model, edit tracking

client/src/main/
  ipc/
    chat.ts               # NEW: IPC handlers for send message, fetch history, reactions
    presence.ts           # NEW: IPC handlers for presence updates, typing
    notifications.ts      # NEW: Desktop notification handling
  ws/
    protocol.ts           # MODIFIED: Handle new message types from WS push
  db/
    schema.ts             # MODIFIED: Migration 2 - messages, reactions, last_read tables

client/src/renderer/src/
  stores/
    messages.ts           # NEW: Message store slice (per-channel message arrays)
    presence.ts           # NEW: Presence store slice (user statuses, typing)
    notifications.ts      # NEW: Notification preferences store
  hooks/
    useMessages.ts        # NEW: Message subscription, scroll position, unread tracking
    usePresence.ts        # NEW: Presence/typing subscription
    useNotifications.ts   # NEW: Notification permission and delivery
  components/
    ChatView.tsx           # NEW: Main chat view (virtualized list + composer)
    MessageGroup.tsx       # NEW: Collapsed message group (shared header)
    MessageRow.tsx         # NEW: Single message with markdown, reactions, actions
    MessageComposer.tsx    # NEW: Auto-expanding input with mention autocomplete
    MarkdownContent.tsx    # NEW: react-markdown wrapper with code highlighting
    EmojiPicker.tsx        # NEW: Emoji picker popover
    ReactionPills.tsx      # NEW: Reaction pills below messages
    MentionAutocomplete.tsx # NEW: @mention dropdown
    TypingIndicator.tsx    # NEW: "Alice is typing..." bar
    PresenceIndicator.tsx  # NEW: Colored dot component
    UnreadBadge.tsx        # NEW: Bold channel name + mention count
    HoverToolbar.tsx       # NEW: Message hover action toolbar
    UserProfilePopup.tsx   # NEW: Profile popup on @mention click
    MemberListSidebar.tsx  # NEW: Right sidebar member list with presence
```

### Pattern 1: Message Store with Per-Channel Windowed Arrays

**What:** Each channel maintains a windowed array of messages in Zustand, with pagination cursors for history loading.
**When to use:** Always -- this is the core data structure for chat.

```typescript
// stores/messages.ts
interface ChannelMessages {
  messages: ChatMessage[];        // Ordered by server_sequence
  oldestLoaded: number | null;    // Oldest server_sequence in local window
  newestLoaded: number | null;    // Newest server_sequence
  hasMoreHistory: boolean;        // Whether older messages exist on server
  lastReadSequence: number;       // Last message the user has "seen"
}

interface MessagesSlice {
  channelMessages: Map<string, ChannelMessages>;

  // Load initial messages for a channel (latest N)
  loadMessages: (channelId: string) => Promise<void>;

  // Load older messages (scroll up)
  loadOlderMessages: (channelId: string) => Promise<void>;

  // Handle incoming message (from gossipsub or WS push)
  appendMessage: (channelId: string, msg: ChatMessage) => void;

  // Handle edit/delete
  updateMessage: (channelId: string, messageId: number, updates: Partial<ChatMessage>) => void;
  removeMessage: (channelId: string, messageId: number) => void;

  // Unread tracking
  markChannelRead: (channelId: string) => void;
  getUnreadCount: (channelId: string) => number;
  getMentionCount: (channelId: string) => number;
}
```

### Pattern 2: Debounced Typing Indicator via Gossipsub

**What:** Typing events flow through the same gossipsub mesh as chat messages, using `MessageType.TYPING`.
**When to use:** Whenever a user is actively composing in a channel.

```typescript
// Sender side: debounced typing event
const TYPING_SEND_INTERVAL = 2000; // Send at most every 2s
let lastTypingSent = 0;

function onComposerInput() {
  const now = Date.now();
  if (now - lastTypingSent > TYPING_SEND_INTERVAL) {
    sendTypingIndicator(channelId); // Publish MessageType.TYPING via gossipsub
    lastTypingSent = now;
  }
}

// Receiver side: timeout-based clearing
const TYPING_TIMEOUT = 3000; // Clear after 3s of no typing events
const typingTimers = new Map<string, NodeJS.Timeout>();

function onTypingReceived(userId: string) {
  clearTimeout(typingTimers.get(userId));
  typingTimers.set(userId, setTimeout(() => {
    removeTypingUser(userId);
    typingTimers.delete(userId);
  }, TYPING_TIMEOUT));
  addTypingUser(userId);
}
```

### Pattern 3: Message Deduplication

**What:** Since messages arrive via both gossipsub and WS push, clients must deduplicate.
**When to use:** On every incoming message.

```typescript
// Use a Set of message identifiers (server_sequence + channel_id)
// or SHA-256 hash of the GossipEnvelope data
const seenMessages = new Set<string>();

function handleIncomingMessage(channelId: string, serverSeq: number, msg: ChatMessage) {
  const key = `${channelId}:${serverSeq}`;
  if (seenMessages.has(key)) return; // Already received via other path
  seenMessages.add(key);
  appendMessage(channelId, msg);
}
```

### Pattern 4: WS Envelope Extension for Chat Events

**What:** Extend the existing ws.proto Envelope oneof with Phase 4 payload variants.
**When to use:** All Phase 4 WS communication.

```protobuf
// Field number allocation for Phase 4: 120-149
// In ws.proto Envelope oneof payload:
united.chat.NewMessageEvent new_message_event = 120;
united.chat.MessageEditedEvent message_edited_event = 121;
united.chat.MessageDeletedEvent message_deleted_event = 122;
united.chat.ReactionAddedEvent reaction_added_event = 123;
united.chat.ReactionRemovedEvent reaction_removed_event = 124;
united.presence.PresenceUpdateEvent presence_update_event = 125;
united.presence.TypingEvent typing_event = 126;
// Request/response for history:
united.chat.FetchHistoryRequest fetch_history_request = 130;
united.chat.FetchHistoryResponse fetch_history_response = 131;
```

### Pattern 5: Virtualized Reverse-Scroll Chat List

**What:** Use @tanstack/react-virtual with reverse layout for chat messages.
**When to use:** The main message list component.

Key implementation details:
- Use `estimateSize` based on typical message height (~60px for short messages)
- Use `measureElement` for accurate dynamic heights after render
- Implement "stick to bottom" behavior: auto-scroll when new messages arrive IF user is at bottom
- When user scrolls up, DON'T auto-scroll (they're reading history)
- Prepending older messages requires scroll position adjustment to prevent jump
- Load older messages when virtualizer reports items near the top are visible (infinite scroll up)

### Anti-Patterns to Avoid

- **Storing all messages in one flat array:** Use per-channel Maps. A single array with 10k+ messages from all channels will cause React to re-render everything on any message.
- **Re-parsing markdown on every render:** Memoize the markdown output. Wrap `MarkdownContent` in `React.memo` and ensure the `content` prop is stable.
- **Sending typing events on every keystroke:** Debounce to max once per 2 seconds. Without debounce, a fast typist generates 5-10 events/second flooding gossipsub.
- **Trusting client timestamps for ordering:** Always use `server_sequence` for display ordering. Client timestamps are hints only (used for Lamport ordering during server downtime).
- **Fetching full message history on channel open:** Only fetch the latest ~50 messages. Load more on scroll-up. Use cursor-based pagination with `before_sequence` parameter.
- **Blocking the render thread with signature verification:** Verify Ed25519 signatures in the main process (or Web Worker), not in the React render cycle. Pass a `verified: boolean` flag to the renderer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown to HTML | Custom parser | react-markdown + remark-gfm | CommonMark spec is 600+ pages. Edge cases in nested formatting, escaping, etc. |
| Syntax highlighting | Regex-based highlighter | highlight.js via rehype-highlight | Language grammars are thousands of lines. 189 languages already covered. |
| Emoji picker | Custom grid component | emoji-picker-react | Unicode emoji data, skin tone variants, category organization, search -- massive data set and UX complexity. |
| Virtualized list | Custom windowing | @tanstack/react-virtual | Scroll math, overscan, dynamic measurement, range extraction -- subtle bugs take months to fix. |
| Date formatting | Manual date math | date-fns | Timezone handling, relative time ("2 minutes ago"), locale-aware formatting. |
| URL detection in text | Custom regex | Built-in URL pattern or linkify-it | URLs are surprisingly complex (IPv6, IDN, query strings, fragments). |
| Ed25519 verification (client) | Custom crypto | sodium-native (already installed) | Crypto must be correct. sodium-native wraps libsodium, audited and battle-tested. |

**Key insight:** Chat applications have deceptive complexity in rendering. Markdown parsing, emoji handling, URL detection, and virtualized scrolling each have years of edge cases baked into mature libraries. Hand-rolling any of these is a multi-month trap.

## Common Pitfalls

### Pitfall 1: Scroll Position Jump on History Load
**What goes wrong:** When older messages are prepended to the list, the scroll position jumps to show the new items instead of staying at the current reading position.
**Why it happens:** The virtualizer recalculates offsets when items are prepended, and without compensation, the viewport shifts.
**How to avoid:** Before prepending, record the current scroll offset and the total content height. After prepend, set scroll position to `previousOffset + (newTotalHeight - previousTotalHeight)`. @tanstack/react-virtual's `scrollToOffset` can handle this, but it must be called synchronously after the data update.
**Warning signs:** Users lose their place when scrolling through history.

### Pitfall 2: Markdown XSS in Chat Messages
**What goes wrong:** Users inject malicious HTML through markdown that executes in other users' browsers.
**Why it happens:** Markdown renderers that use `dangerouslySetInnerHTML` or allow raw HTML passthrough.
**How to avoid:** react-markdown is safe by default -- it builds a React VDOM, never uses innerHTML. Do NOT enable `rehype-raw` plugin. Do NOT add `allowedElements` that includes script/iframe. Links should have `target="_blank"` and `rel="noopener noreferrer"`.
**Warning signs:** Any use of `dangerouslySetInnerHTML` in message rendering code.

### Pitfall 3: Typing Indicator Thundering Herd
**What goes wrong:** With 50 users in a channel, all sending typing events, gossipsub traffic spikes and indicators flicker rapidly.
**Why it happens:** No debounce on send side, no aggregation on receive side.
**How to avoid:** Send-side: debounce to once per 2 seconds. Receive-side: aggregate and only show up to 3 names, then "Several people are typing..." Display-side: use a 3-second timeout to clear stale indicators.
**Warning signs:** Network traffic spikes when users are typing. UI flickers.

### Pitfall 4: Memory Leak from Unbounded Message Store
**What goes wrong:** Over hours of use, the message store grows unbounded as new messages arrive, eventually consuming hundreds of MB.
**Why it happens:** Messages are appended but never removed from the in-memory store.
**How to avoid:** Implement a sliding window per channel. Keep the most recent N messages (e.g., 500) in memory. When the user scrolls up past the window, load from local SQLite cache or server API. Evict messages from the bottom of the window when it exceeds the cap.
**Warning signs:** Electron memory usage grows steadily over time. Performance degrades after hours of use.

### Pitfall 5: Race Condition in Message Ordering
**What goes wrong:** Messages appear out of order because gossipsub delivery is faster than WS broadcast, and the two paths assign different arrival times.
**Why it happens:** Gossipsub messages arrive before the server has assigned a server_sequence, while WS-pushed messages include the authoritative server_sequence.
**How to avoid:** Always sort by `server_sequence`. For messages that arrive via gossipsub before the server has processed them, insert optimistically using `sequence_hint` (Lamport counter) as a temporary sort key. When the server-confirmed sequence arrives via WS, update the sort position. The reorder should be rare and invisible to users.
**Warning signs:** Messages occasionally appear above/below their correct position, then jump.

### Pitfall 6: Electron Notification Flood
**What goes wrong:** User receives 50 notifications in rapid succession when someone @mentions them multiple times or mentions @everyone.
**Why it happens:** No rate limiting on notification display.
**How to avoid:** Coalesce notifications: if multiple notifications arrive within 2 seconds for the same channel, merge them into one ("3 new mentions in #general"). Respect system DND settings. Never notify for the active channel if the window is focused.
**Warning signs:** Users disable notifications entirely because they're too noisy.

### Pitfall 7: @mention Autocomplete Lag
**What goes wrong:** The @mention dropdown is slow to appear or filter, especially in large servers.
**Why it happens:** Fetching the full member list from the server on every '@' keystroke.
**How to avoid:** Cache the member list locally (already fetched for the member sidebar). Filter in-memory with substring match. Pre-sort by recent activity or alphabetical. Limit dropdown to 10 results. Debounce the filter input by 100ms.
**Warning signs:** Noticeable delay between typing '@' and seeing the dropdown.

## Code Examples

### Protobuf Schema for Chat Messages

```protobuf
// shared/proto/chat.proto
syntax = "proto3";
package united.chat;

message ChatMessage {
  string id = 1;                    // UUID
  string channel_id = 2;
  string sender_pubkey = 3;         // Hex-encoded Ed25519 public key
  string sender_display_name = 4;   // Denormalized for rendering
  string content = 5;               // Markdown text
  uint64 timestamp = 6;             // Sender wall clock millis
  uint64 server_sequence = 7;       // Authoritative ordering
  bytes signature = 8;              // Ed25519 signature
  string reply_to_id = 9;           // Optional: message being replied to
  bool edited = 10;                 // Whether message has been edited
  repeated string mention_user_ids = 11;  // Extracted @mentions
  repeated string mention_role_ids = 12;  // Extracted @role mentions
}

message Reaction {
  string message_id = 1;
  string user_pubkey = 2;
  string emoji = 3;                 // Unicode emoji character
  uint64 timestamp = 4;
}

message NewMessageEvent {
  ChatMessage message = 1;
}

message MessageEditedEvent {
  string message_id = 1;
  string channel_id = 2;
  string new_content = 3;
  uint64 edit_timestamp = 4;
}

message MessageDeletedEvent {
  string message_id = 1;
  string channel_id = 2;
}

message ReactionAddedEvent {
  Reaction reaction = 1;
}

message ReactionRemovedEvent {
  string message_id = 1;
  string user_pubkey = 2;
  string emoji = 3;
}

message FetchHistoryRequest {
  string channel_id = 1;
  uint64 before_sequence = 2;       // Cursor: fetch messages before this sequence
  uint32 limit = 3;                 // Max messages to return (default 50)
}

message FetchHistoryResponse {
  repeated ChatMessage messages = 1;
  bool has_more = 2;                // Whether older messages exist
}
```

### Protobuf Schema for Presence

```protobuf
// shared/proto/presence.proto
syntax = "proto3";
package united.presence;

enum PresenceStatus {
  PRESENCE_STATUS_UNSPECIFIED = 0;
  PRESENCE_STATUS_ONLINE = 1;
  PRESENCE_STATUS_AWAY = 2;
  PRESENCE_STATUS_DND = 3;
  PRESENCE_STATUS_OFFLINE = 4;
}

message PresenceUpdate {
  string user_pubkey = 1;
  PresenceStatus status = 2;
  uint64 timestamp = 3;
}

message TypingIndicator {
  string user_pubkey = 1;
  string channel_id = 2;
  string display_name = 3;          // Denormalized for rendering
  uint64 timestamp = 4;
}

message PresenceUpdateEvent {
  PresenceUpdate update = 1;
}

message TypingEvent {
  TypingIndicator indicator = 1;
}
```

### Server Message History Endpoint

```rust
// server/src/chat/messages.rs
// GET /api/channels/{channel_id}/messages?before=<seq>&limit=50
pub async fn get_channel_messages(
    Path(channel_id): Path<String>,
    Query(params): Query<HistoryParams>,
    State(state): State<AppState>,
    _claims: Claims,  // JWT auth required
) -> Result<Json<HistoryResponse>, StatusCode> {
    let db = state.db.clone();
    let before = params.before.unwrap_or(i64::MAX);
    let limit = params.limit.unwrap_or(50).min(100) as i64;

    let messages = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let mut stmt = conn.prepare(
            "SELECT id, channel_id, sender_pubkey, message_type, payload, timestamp,
                    sequence_hint, server_sequence, signature, created_at
             FROM messages
             WHERE channel_id = ?1 AND server_sequence < ?2
             ORDER BY server_sequence DESC
             LIMIT ?3"
        ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        // ... map rows to ChatMessage proto
        Ok::<Vec<ChatMessage>, StatusCode>(messages)
    }).await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let has_more = messages.len() as i64 == limit;
    Ok(Json(HistoryResponse { messages, has_more }))
}
```

### Client MarkdownContent Component

```tsx
// components/MarkdownContent.tsx
import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface Props {
  content: string;
}

export default memo(function MarkdownContent({ content }: Props) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // Open links in external browser
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (href) window.open(href, '_blank');
            }}
          >
            {children}
          </a>
        ),
        // Styled code blocks
        code: ({ className, children, ...props }) => {
          const isBlock = className?.startsWith('language-');
          if (isBlock) {
            return (
              <code className={`${className} rounded bg-black/30 block p-3 text-sm`} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className="rounded bg-white/10 px-1 py-0.5 text-sm" {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </Markdown>
  );
});
```

### Desktop Notification from Main Process

```typescript
// client/src/main/ipc/notifications.ts
import { Notification, BrowserWindow } from 'electron';

interface NotificationPayload {
  title: string;
  body: string;
  channelId: string;
  serverId: string;
}

// Coalesce rapid notifications
const pendingNotifications = new Map<string, { count: number; timer: NodeJS.Timeout }>();

export function showMentionNotification(payload: NotificationPayload): void {
  // Don't notify if window is focused and user is in the channel
  const win = BrowserWindow.getFocusedWindow();
  if (win && !win.isMinimized()) {
    // Check if user is viewing this channel (via IPC state check)
    return;
  }

  const key = `${payload.serverId}:${payload.channelId}`;
  const pending = pendingNotifications.get(key);

  if (pending) {
    pending.count++;
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      const notification = new Notification({
        title: payload.title,
        body: pending.count > 1
          ? `${pending.count} new mentions in #${payload.channelId}`
          : payload.body,
      });
      notification.on('click', () => {
        // Navigate to channel via IPC
        for (const w of BrowserWindow.getAllWindows()) {
          w.webContents.send('navigate:channel', payload.channelId);
          w.focus();
        }
      });
      notification.show();
      pendingNotifications.delete(key);
    }, 2000);
  } else {
    pendingNotifications.set(key, {
      count: 1,
      timer: setTimeout(() => {
        const notification = new Notification({
          title: payload.title,
          body: payload.body,
        });
        notification.on('click', () => {
          for (const w of BrowserWindow.getAllWindows()) {
            w.webContents.send('navigate:channel', payload.channelId);
            w.focus();
          }
        });
        notification.show();
        pendingNotifications.delete(key);
      }, 2000),
    });
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-window / react-virtualized | @tanstack/react-virtual | 2023+ | Headless, no wrapper divs, dynamic measurement built-in |
| dangerouslySetInnerHTML markdown | react-markdown VDOM | Always best practice | XSS prevention, React reconciliation |
| Prism.js manual highlighting | rehype-highlight plugin | 2024+ | Integrates directly into markdown pipeline |
| Image-based emoji | Native Unicode emoji | 2023+ | No CDN dependency, smaller bundle, OS-native rendering |
| Custom event bus for presence | Gossipsub MessageType enum | Phase 3 decision | Reuses existing P2P infrastructure, no separate presence channel |

**Deprecated/outdated:**
- `react-virtualized`: Replaced by `react-window` then `@tanstack/react-virtual`. Heavy, class-based, not maintained.
- `react-window`: Still works but `@tanstack/react-virtual` is the successor by the same team (Tanner Linsley).
- `react-syntax-highlighter`: Wraps Prism/highlight.js but adds unnecessary abstraction. Use rehype-highlight directly with react-markdown.

## Server-Side Database Changes

### Migration 4: Chat Features

```sql
-- Add edit tracking to messages table
ALTER TABLE messages ADD COLUMN content_text TEXT;
ALTER TABLE messages ADD COLUMN edited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN edit_timestamp TEXT;
ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN reply_to_id INTEGER;

-- Reactions table
CREATE TABLE reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    user_pubkey TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    UNIQUE(message_id, user_pubkey, emoji)
);
CREATE INDEX idx_reactions_message ON reactions(message_id);

-- Last read tracking (server-side, for cross-device sync)
CREATE TABLE last_read (
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    last_sequence INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, channel_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
```

### Client-Side SQLite Migration

```sql
-- Client migration 2: Message cache and tracking
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    channel_id TEXT NOT NULL,
    server_id TEXT NOT NULL,
    sender_pubkey TEXT NOT NULL,
    sender_display_name TEXT,
    content TEXT,
    server_sequence INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    signature BLOB,
    verified INTEGER NOT NULL DEFAULT 0,
    reply_to_id INTEGER,
    edited INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_client_msgs_channel_seq
    ON messages(channel_id, server_sequence);

CREATE TABLE IF NOT EXISTS reactions (
    message_id INTEGER NOT NULL,
    user_pubkey TEXT NOT NULL,
    emoji TEXT NOT NULL,
    PRIMARY KEY (message_id, user_pubkey, emoji)
);

CREATE TABLE IF NOT EXISTS last_read (
    channel_id TEXT NOT NULL,
    server_id TEXT NOT NULL,
    last_sequence INTEGER NOT NULL DEFAULT 0,
    mention_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, server_id)
);

CREATE TABLE IF NOT EXISTS notification_prefs (
    channel_id TEXT NOT NULL,
    server_id TEXT NOT NULL,
    notify_all INTEGER NOT NULL DEFAULT 0,
    muted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, server_id)
);
```

## Open Questions

1. **Message payload encoding in GossipEnvelope**
   - What we know: GossipEnvelope.payload is `bytes`. Currently no inner message type is defined for chat content.
   - What's unclear: Should the ChatMessage proto be the payload, or should the payload be raw text and metadata carried in envelope fields?
   - Recommendation: Encode ChatMessage as the payload bytes within GossipEnvelope. The `message_type` field on GossipEnvelope (already `MESSAGE_TYPE_CHAT`) tells the receiver what proto to decode the payload as. This keeps the envelope generic and payload type-specific.

2. **Message history: REST API vs WS request/response**
   - What we know: The project uses REST for CRUD operations and WS for push events. History fetch could go either way.
   - What's unclear: Whether to use GET /api/channels/{id}/messages (REST) or FetchHistoryRequest/Response (WS).
   - Recommendation: Use REST API for history fetches. It follows the established pattern (channels, roles, members all use REST). REST is simpler for pagination (query params), cacheable, and doesn't tie up the WS connection. WS is for push events only.

3. **Reactions: per-message sub-messages or separate gossipsub events?**
   - What we know: Reactions need to propagate to all peers. They're small (emoji + user + message_id).
   - What's unclear: Whether reactions should be their own gossipsub messages or embedded in the message envelope.
   - Recommendation: Reactions should be separate gossipsub messages with `MESSAGE_TYPE_REACTION` (add to the MessageType enum). This keeps the original message immutable and allows reactions to arrive independently. Server stores in the reactions table. WS broadcasts ReactionAddedEvent/ReactionRemovedEvent.

4. **Presence: gossipsub or WS-only?**
   - What we know: Presence is about online/offline/away status. The server already tracks WS connections.
   - What's unclear: Whether presence should flow through gossipsub or be server-managed via WS.
   - Recommendation: Hybrid. The server authoritatively manages presence based on WS connection state (connect=online, disconnect=offline). Users manually set Away/DND via REST or WS. Server broadcasts presence changes to all WS clients. Gossipsub carries presence for P2P resilience during server downtime, but the server is the primary source.

## Sources

### Primary (HIGH confidence)
- Project source code analysis: server/src/p2p/, server/src/ws/, client/src/main/ipc/, client/src/renderer/src/stores/
- shared/proto/p2p.proto -- GossipEnvelope schema, MessageType enum
- server/src/p2p/messages.rs -- Existing signature verification and message persistence
- server/src/db/migrations.rs -- Existing messages table schema
- .planning/phases/03-p2p-networking/03-01-SUMMARY.md -- Phase 3 completion details
- .planning/phases/04-real-time-chat/04-CONTEXT.md -- User decisions

### Secondary (MEDIUM confidence)
- [react-markdown GitHub](https://github.com/remarkjs/react-markdown) -- v10 API, plugin system, security model
- [TanStack Virtual docs](https://tanstack.com/virtual/latest) -- Virtualizer API, dynamic measurement, scroll control
- [TanStack Virtual discussion #195](https://github.com/TanStack/virtual/discussions/195) -- Reversed list patterns for chat
- [Electron Notification docs](https://www.electronjs.org/docs/latest/tutorial/notifications) -- API, platform limitations, click handling
- [emoji-picker-react](https://github.com/ealush/emoji-picker-react) -- v4 features, native Unicode support
- [highlight.js vs Shiki comparison](https://dev.to/begin/tale-of-the-tape-highlightjs-vs-shiki-27ce) -- Bundle size, runtime vs SSR tradeoffs
- [rehype-highlight](https://github.com/rehypejs/rehype-highlight) -- Integration with react-markdown

### Tertiary (LOW confidence)
- Community patterns for typing indicator debounce timing (2s send / 3s clear is consensus, not officially documented)
- Notification coalescing patterns (2s window is heuristic, may need adjustment)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are well-established, versions verified, most already installed
- Architecture: HIGH -- builds directly on existing Phase 3 infrastructure (gossipsub, WS broadcast, protobuf, Zustand slices)
- Pitfalls: HIGH -- most are well-documented in the chat application domain with proven mitigations
- Code examples: MEDIUM -- patterns are standard but exact API details for @tanstack/react-virtual reverse scroll may need adjustment during implementation
- Open questions: MEDIUM -- all have clear recommendations but final decisions should be made during planning

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable domain, no fast-moving dependencies)
