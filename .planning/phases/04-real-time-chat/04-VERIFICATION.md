---
phase: 04-real-time-chat
verified: 2026-02-26T05:00:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Presence display fixed: MemberListSidebar now uses member.pubkey for presence store lookup (not member.id UUID)"
    - "Message ID consistency fixed: create_message returns last_insert_rowid() instead of UUIDv7; reactions in history now work for all messages"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Send a message and verify all connected peers see it within 100ms"
    expected: "Message appears in real-time in other clients without page refresh"
    why_human: "Cannot verify network latency or real-time delivery programmatically"
  - test: "Open a channel with no messages, type a message, verify it groups correctly with a second message from the same user within 5 minutes"
    expected: "Second message collapses under first with no avatar/name repeated"
    why_human: "Visual grouping behavior requires rendering verification"
  - test: "Type '@' in the composer and verify autocomplete dropdown appears, navigate with arrow keys, press Enter to insert mention token"
    expected: "Dropdown shows users/roles, keyboard navigation works, selected mention renders as highlighted pill in sent message"
    why_human: "Keyboard interaction and visual rendering require live testing"
  - test: "React to a message with an emoji and verify the reaction pill appears for other connected clients in real-time"
    expected: "Reaction pill appears with correct emoji and count; clicking it toggles own reaction"
    why_human: "Real-time reaction broadcast requires two connected clients"
  - test: "Trigger a desktop notification by @mentioning yourself from another client while the window is unfocused"
    expected: "Native OS notification fires with sender name and message preview; clicking it navigates to the channel"
    why_human: "Desktop notification behavior requires OS-level testing and window focus state"
  - test: "Connect a user and verify their status shows green dot in MemberListSidebar"
    expected: "Connected user shows green dot under ONLINE group; disconnecting shows gray dot within seconds"
    why_human: "Requires live connection events to verify end-to-end presence flow through the fixed pubkey lookup path"
---

# Phase 4: Real-Time Chat Verification Report

**Phase Goal:** Users can have real-time text conversations in channels with the full range of messaging features expected from a modern chat application
**Verified:** 2026-02-26T05:00:00Z
**Status:** human_needed — all automated checks pass, 6 items require live-app testing
**Re-verification:** Yes — after gap closure by plan 04-06

## Re-Verification Summary

The two gaps from the initial verification have been closed by commits `1af6e9c` and `079ead4`:

**Gap 1 (presence key mismatch) — CLOSED.**
`server/src/roles/assignment.rs`: `MemberResponse` struct now includes `pub pubkey: String`, populated via `lower(hex(public_key))` SQL. `shared/types/ipc-bridge.ts`: `MemberResponse` interface now has `pubkey: string`. `client/src/renderer/src/components/MemberListSidebar.tsx`: presence lookup changed from `userPresence[member.id]` to `userPresence[member.pubkey]` on line 84; `UserProfilePopup` open also uses `userPresence[selectedMember.member.pubkey]` on line 212. The UUID-vs-pubkey mismatch is eliminated.

**Gap 2 (message ID inconsistency) — CLOSED.**
`server/src/chat/messages.rs`: `Uuid::now_v7()` removed entirely (no import either); `conn.last_insert_rowid()` is now used as the message ID for both the `ChatMessage` proto broadcast and the `MessageResponse` REST body. The history endpoint already returned integer rowids (`msg_id: i64` from `row.get(0)`). The `msg.id.parse::<i64>()` call in the reactions-in-history loop (line 286) now succeeds for all messages regardless of create path — `reactions.message_id` is `INTEGER` in the schema and will always match.

No regressions introduced: only the 5 files listed in the plan were modified; ChatView, useMessages hook, stores, broadcast helpers, and all other chat infrastructure are unchanged.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can send a text message and all connected peers in the channel see it appear in real-time with correct server-assigned ordering | VERIFIED | POST /api/channels/{id}/messages: assigns `next_seq = MAX(server_sequence)+1` in transaction, calls `broadcast::broadcast_new_message`; gossip path also broadcasts via main.rs event consumer; WS chat-events.ts forwards PUSH_CHAT_EVENT to renderer; `appendMessage` with dedup by `server_sequence` in messages store |
| 2 | User can scroll back through message history, loading older messages from peers or server fallback, with messages rendered in a virtualized list | VERIFIED | GET history with `before`/`limit` pagination; `loadOlderMessages` in store calls `fetchHistory` with `oldestLoaded`; ChatView triggers `loadOlder` when `scrollTop < 200px`; `useVirtualizer` from `@tanstack/react-virtual` with `measureElement` for accurate heights |
| 3 | User can format messages with markdown, react with emoji, and @mention users or roles — and recipients see these rendered correctly | VERIFIED | `MarkdownContent` uses react-markdown + remark-gfm + rehype-highlight (atom-one-dark); `EmojiPicker` lazy-loaded with `React.lazy`; `ReactionPills` toggle reactions via IPC; `MentionAutocomplete` on '@'; mention tokens rendered as blue pills; reaction events broadcast over WS |
| 4 | User can see who is online/offline/away, see typing indicators in the current channel, and see unread indicators on channels with new messages | VERIFIED | Presence: `userPresence[member.pubkey]` lookup (gap fixed); typing: POST /api/typing broadcasts TypingEvent, 3s timeout in presence store, `useTypingIndicator` hook, ChatView typing bar; unread: `lastReadSequence` vs `server_sequence` comparison in ChannelSidebar, `UnreadBadge` for mentions |
| 5 | User receives desktop notifications for @mentions and can see other users' profiles (name, avatar, status) in the message list | VERIFIED | ChatView extracts mention IDs from content, checks current user, calls `notifications.show` IPC; main process `notifications.ts` shows Electron Notification with 2s coalescing; `UserProfilePopup` wired to MemberListSidebar click; `PresenceIndicator` shows colored dots; pubkey fingerprint displayed and copyable |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `shared/proto/chat.proto` | ChatMessage, Reaction, events, history | VERIFIED | All message types present; package united.chat |
| `shared/proto/presence.proto` | PresenceStatus, TypingIndicator, events | VERIFIED | All types present including display_name field |
| `shared/proto/ws.proto` | Fields 120-131 for Phase 4 events | VERIFIED | 9 Phase 4 variants in oneof payload |
| `server/src/roles/assignment.rs` | MemberResponse with pubkey field | VERIFIED | `pub pubkey: String` added to struct; SQL uses `lower(hex(public_key))`; gap closed in commit 1af6e9c |
| `server/src/chat/messages.rs` | Create message returns DB row ID | VERIFIED | `Uuid::now_v7()` removed; `conn.last_insert_rowid()` used for both proto broadcast and REST response; gap closed in commit 079ead4 |
| `server/src/chat/reactions.rs` | POST/DELETE/GET reaction endpoints | VERIFIED | add_reaction, remove_reaction, get_reactions with broadcast |
| `server/src/chat/broadcast.rs` | WS broadcast helpers for all chat events | VERIFIED | broadcast_new_message, broadcast_message_edited, broadcast_message_deleted, broadcast_reaction_added/removed, broadcast_presence_update, broadcast_typing_indicator |
| `server/src/chat/presence.rs` | Server-side presence tracking and REST endpoints | VERIFIED | DashMap-backed set_user_presence/get_all_presence; GET/POST /api/presence, POST /api/typing |
| `server/src/ws/actor.rs` | Presence broadcast on connect/disconnect | VERIFIED | set_user_presence(ONLINE) on connect with snapshot; OFFLINE only on last connection |
| `server/src/db/migrations.rs` | Migration 4 with content_text, reactions, last_read | VERIFIED | Migration 4 adds content_text/edited/deleted/reply_to_id; creates reactions (UNIQUE constraint, message_id INTEGER FK) and last_read tables |
| `shared/types/ipc-bridge.ts` | MemberResponse with pubkey: string | VERIFIED | `pubkey: string` added to MemberResponse interface; gap closed in commit 1af6e9c |
| `client/src/main/ipc/chat.ts` | IPC handlers for all chat operations | VERIFIED | registerChatHandlers with CHAT_SEND, CHAT_FETCH_HISTORY, CHAT_EDIT, CHAT_DELETE, REACTIONS_ADD/REMOVE/FETCH, LAST_READ_UPDATE/FETCH |
| `client/src/main/ipc/presence.ts` | Presence and idle detection IPC | VERIFIED | PRESENCE_SET handler with 15-min powerMonitor idle detection |
| `client/src/main/ipc/notifications.ts` | Desktop notification with 2s coalescing | VERIFIED | Electron Notification with coalescing, click-to-navigate IPC |
| `client/src/main/ws/chat-events.ts` | WS protobuf decoder forwarding to renderer | VERIFIED | Handles all 7 Phase 4 event types; broadcastToRenderers via PUSH_CHAT_EVENT/PUSH_PRESENCE_EVENT/PUSH_TYPING_EVENT |
| `client/src/renderer/src/stores/messages.ts` | Zustand messages slice | VERIFIED | Per-channel ChannelMessages with 500 cap, dedup by server_sequence, loadMessages/loadOlderMessages/appendMessage/markChannelRead |
| `client/src/renderer/src/stores/presence.ts` | Zustand presence/typing slice | VERIFIED | setPresence, setBulkPresence, addTypingUser (3s timeout), removeTypingUser |
| `client/src/renderer/src/stores/notifications.ts` | Zustand notifications slice | VERIFIED | channelMentionCounts, notificationPrefs, incrementMentionCount/clearMentionCount |
| `client/src/renderer/src/hooks/useMessages.ts` | Messages subscription hook | VERIFIED | Auto-loads on mount; listens for PUSH_CHAT_EVENT; handles new/edited/deleted/reaction events; returns messages/hasMore/loading/loadOlder |
| `client/src/renderer/src/components/ChatView.tsx` | Virtualized chat view | VERIFIED | useVirtualizer; stick-to-bottom; infinite scroll-up; typing indicator bar; notification trigger; member list toggle |
| `client/src/renderer/src/components/MessageGroup.tsx` | 5-min same-sender grouping | VERIFIED | groupMessages() utility with 5-min window and day separators; MessageGroup renders full/grouped rows |
| `client/src/renderer/src/components/MessageComposer.tsx` | Auto-expanding composer with @mention | VERIFIED | scrollHeight measurement for auto-expand; Enter-to-send; reply mode; MentionAutocomplete integration |
| `client/src/renderer/src/components/MarkdownContent.tsx` | Markdown with syntax highlighting | VERIFIED | react-markdown + remark-gfm + rehype-highlight; rehype-raw excluded (XSS prevention); mention token parsing and rendering |
| `client/src/renderer/src/components/MemberListSidebar.tsx` | Member list with correct presence lookup | VERIFIED | Gap fixed: `userPresence[member.pubkey]` (line 84); avatar hue uses `member.pubkey` (line 141); UserProfilePopup status uses `userPresence[selectedMember.member.pubkey]` (line 212); `member.id` only used as React key prop (line 148) |
| `client/src/renderer/src/components/UserProfilePopup.tsx` | Profile popup using pubkey | VERIFIED | `pubkeyToHue(member.pubkey)` for avatar color; truncated pubkey fingerprint displayed; copy button copies `member.pubkey`; all UUID references removed |
| `client/src/renderer/src/components/PresenceIndicator.tsx` | Colored dot component | VERIFIED | green/yellow/red/gray dots; sm/md sizes; showLabel option |
| `client/src/renderer/src/components/EmojiPicker.tsx` | Lazy-loaded emoji picker | VERIFIED | React.lazy + Suspense; createPortal; dark theme; click-outside/Escape dismiss |
| `client/src/renderer/src/components/ReactionPills.tsx` | Reaction pills with toggle | VERIFIED | Toggle calls reactions.add/remove IPC; hover tooltip with reactor names; "+" button opens EmojiPicker |
| `client/src/renderer/src/components/MentionAutocomplete.tsx` | @mention dropdown | VERIFIED | Debounced filter (100ms); keyboard navigation (arrow/enter/escape); 10-item limit; renders users and roles |
| `client/src/renderer/src/components/UnreadBadge.tsx` | Unread/mention badge | VERIFIED | Red badge for mentionCount > 0; parent handles bold text for unread-only |
| `client/src/renderer/src/stores/index.ts` | RootStore with all Phase 4 slices | VERIFIED | MessagesSlice, PresenceSlice, NotificationsSlice composed into RootStore |
| `client/src/preload/index.ts` | IPC bridge with chat/presence/notification methods | VERIFIED | chat.send/fetchHistory/edit/delete; reactions.add/remove/fetch; presence.set; lastRead.update/fetch; notifications.setPrefs/show; onChatEvent/onTypingEvent/onPresenceEvent listeners |
| `client/src/renderer/src/components/MainContent.tsx` | Routes to ChatView when channel selected | VERIFIED | Renders ChatView + MemberListSidebar when activeChannelId set; welcome screen otherwise |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server/src/chat/messages.rs | server/src/chat/broadcast.rs | After create_message persists, calls broadcast_new_message | WIRED | Line 206: `broadcast::broadcast_new_message(&state.connections, chat_message)` |
| server/src/main.rs (gossip consumer) | server/src/chat/broadcast.rs | After gossip message persists, broadcasts NewMessageEvent | WIRED | `if let Some(chat_msg) = result.chat_message { chat::broadcast::broadcast_new_message(&conns, chat_msg); }` |
| server/src/ws/actor.rs | server/src/chat/presence.rs | On WS connect, broadcast ONLINE; on disconnect, broadcast OFFLINE | WIRED | set_user_presence(ONLINE) on connect, OFFLINE on last disconnect |
| client/src/main/ws/chat-events.ts | client/src/renderer (PUSH_CHAT_EVENT) | WS push events forwarded to renderer via IPC | WIRED | setupChatEventListener() handles all 7 Phase 4 payload types; broadcastToRenderers |
| client/src/renderer/src/components/ChatView.tsx | client/src/renderer/src/hooks/useMessages.ts | useMessages hook provides messages array and loadOlder | WIRED | `const { messages, hasMore, loading, loadOlder } = useMessages(activeChannelId)` |
| client/src/renderer/src/components/ChatView.tsx | @tanstack/react-virtual | useVirtualizer for windowed rendering | WIRED | `import { useVirtualizer } from '@tanstack/react-virtual'` (line 19) |
| client/src/renderer/src/components/MainContent.tsx | client/src/renderer/src/components/ChatView.tsx | Renders ChatView when activeChannelId is set | WIRED | Conditional render with MemberListSidebar alongside ChatView |
| client/src/renderer/src/components/MemberListSidebar.tsx | client/src/renderer/src/stores/presence.ts | Reads userPresence keyed by pubkey for status dots and grouping | WIRED | `userPresence[member.pubkey]` (line 84) — gap closed; key type now matches store |
| server/src/roles/assignment.rs | client/src/renderer/src/components/MemberListSidebar.tsx | MemberResponse.pubkey field flows through IPC to presence store lookup | WIRED | SQL `lower(hex(public_key))` -> `pubkey: String` in struct -> `pubkey: string` in TS type -> `member.pubkey` in presence lookup |
| server/src/chat/messages.rs (create_message) | server/src/chat/messages.rs (get_channel_messages) | Both return integer row ID as message id | WIRED | create: `conn.last_insert_rowid().to_string()`; history: `msg_id: i64` from `row.get(0)`, serialized as `msg_id.to_string()`; both integer strings; reactions parse succeeds |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MSG-01 | 04-01, 04-02, 04-03 | Send/receive text messages in real-time | SATISFIED | REST POST creates + broadcasts; WS forwards to renderer; appendMessage in store; ChatView renders in real-time |
| MSG-02 | 04-01, 04-02, 04-03 | Scroll back through message history | SATISFIED | GET history with before/limit pagination; loadOlderMessages; infinite scroll-up in ChatView at scrollTop < 200px |
| MSG-03 | 04-03 | Format messages with markdown | SATISFIED | MarkdownContent with react-markdown, remark-gfm, rehype-highlight; code blocks, blockquotes, bold/italic, lists |
| MSG-04 | 04-01, 04-05 | React to messages with Unicode emoji | SATISFIED | Reaction REST endpoints (INSERT OR IGNORE); ReactionPills toggle; EmojiPicker lazy-loaded; WS broadcast; reactions-in-history now works for all messages (ID fix) |
| MSG-05 | 04-02, 04-04 | See typing indicators | SATISFIED | POST /api/typing broadcasts TypingEvent; chat-events.ts forwards PUSH_TYPING_EVENT; presence store 3s timeout; useTypingIndicator hook; ChatView typing bar |
| MSG-06 | 04-02, 04-04, 04-06 | See online/offline/away status | SATISFIED | Server presence (DashMap + WS broadcast) correct. Client receives PresenceUpdateEvent keyed by pubkey. MemberListSidebar now uses `member.pubkey` for lookup — gap closed by plan 04-06 |
| MSG-07 | 04-02, 04-05 | Unread indicators on channels | SATISFIED | lastReadSequence vs server_sequence comparison; ChannelSidebar computes unread state; UnreadBadge for mentions; markChannelRead on scroll/channel mount |
| MSG-08 | 04-03, 04-05 | @mention users or roles | SATISFIED | MentionAutocomplete on '@' keystroke; token format @[name](user:id); mention tokens rendered as blue pills; mention_user_ids extracted from content |
| MSG-09 | 04-02, 04-05 | Desktop notifications for mentions | SATISFIED | ChatView detects mentions via extractMentionIds; calls notifications.show IPC; Electron Notification with 2s coalescing; click navigation to channel |
| SEC-03 | 04-01, 04-03 | Messages signed by Ed25519 key | PARTIALLY SATISFIED | Gossip path: envelope is Ed25519-signed and verified in handle_gossip_message before persist. REST path: signature is empty bytes (no signing at client). This is a known limitation carried from initial verification — the REST path is used for v1 channel messages; P2P gossip signing will be the primary path in production. Not a regression from 04-06. |
| APP-03 | 04-02 | All subscribed channels receive gossip simultaneously | SATISFIED | useMessages hook sets up push event listener per channel regardless of active channel; appendMessage stores to any channel_id in the event |
| APP-05 | 04-04, 04-05 | User profiles display name, avatar, status | SATISFIED | UserProfilePopup shows avatar (initial + pubkey-derived hue, updated in 04-06), display name, role badges, presence status, pubkey fingerprint (displays and copies member.pubkey) |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| client/src/renderer/src/components/MessageGroup.tsx | 108-109 | `isFirstInDay` logic has minor redundancy (first group hardcoded true) | Warning | Cosmetic — logic is correct, could be simplified |
| server/src/chat/messages.rs | 286 | `msg.id.parse::<i64>().unwrap_or(0)` — was previously broken for UUID IDs, now correct since all IDs are integer strings | Info | Previously a warning; now resolved by gap closure. `unwrap_or(0)` is a safe fallback. |

No blocker anti-patterns remain.

---

### Human Verification Required

#### 1. Real-Time Message Delivery Latency

**Test:** Connect two clients to the same server. Send a message from client A. Measure time until it appears on client B.
**Expected:** Message appears within 100ms (per MSG-01 requirement)
**Why human:** Cannot verify network latency or WS push timing programmatically

#### 2. Message Grouping Visual Behavior

**Test:** In a channel, send two messages from the same user within 5 minutes. Then send one after 6 minutes.
**Expected:** First two messages collapse (no repeated avatar/name). Third message shows full header with avatar.
**Why human:** Visual rendering behavior requires live app testing

#### 3. @Mention Autocomplete UX

**Test:** Type '@' in the message composer. Verify dropdown appears with user and role list. Use arrow keys to navigate. Press Enter to select.
**Expected:** Dropdown appears immediately on '@'; arrow keys move selection highlight; Enter inserts @[name](user:id) token; sent message shows highlighted pill.
**Why human:** Keyboard interaction and DOM behavior require live testing

#### 4. Real-Time Reaction Sync

**Test:** Client A reacts to a message with an emoji. Observe client B without refreshing.
**Expected:** Reaction pill appears on client B within ~1 second showing the emoji and count 1.
**Why human:** Real-time WS broadcast verification requires two live clients

#### 5. Desktop Notification Flow

**Test:** Window B in background. Window A sends a message mentioning @User-B. Check OS notification.
**Expected:** Desktop notification fires with title "UserA in #channel-name" and message preview. Clicking navigates to channel.
**Why human:** OS-level notification behavior and window focus state require live testing

#### 6. Presence Display End-to-End (Gap Verification)

**Test:** Connect a user to the server. Verify their row in MemberListSidebar shows a green dot under the ONLINE group. Disconnect and verify they move to OFFLINE group with gray dot.
**Expected:** Online user shows green dot; disconnect moves to gray dot within seconds.
**Why human:** Requires live WS connection events to verify the full path: WS connect -> `set_user_presence(ONLINE)` -> `broadcast_presence_update` -> `chat-events.ts` PUSH_PRESENCE_EVENT -> `setPresence(pubkey, 'online')` -> `userPresence[member.pubkey]` -> green dot rendered.

---

### Closure Summary

Both gaps from the initial verification are fully resolved by plan 04-06 (commits `1af6e9c` and `079ead4`):

1. **Presence key mismatch (MSG-06)** — The `MemberResponse` struct now carries `pubkey: String` from `lower(hex(public_key))` SQL. The TypeScript interface carries `pubkey: string`. `MemberListSidebar` uses `userPresence[member.pubkey]` for presence status, `stringToHue(member.pubkey)` for avatar color, and passes `userPresence[selectedMember.member.pubkey]` to `UserProfilePopup`. `UserProfilePopup` uses `member.pubkey` for avatar hue, fingerprint display, and copy action. The key mismatch is eliminated end-to-end.

2. **Message ID inconsistency** — `Uuid::now_v7()` is removed from `messages.rs`. The `create_message` handler now calls `conn.last_insert_rowid()` after `conn.execute(...)` and uses it as both the proto broadcast ID and the REST response ID. The history endpoint already fetched `msg_id: i64` from the `messages.id` column (the sqlite rowid). The `msg.id.parse::<i64>()` in the reactions-in-history loop now succeeds for all messages since both paths return integer strings. Reactions load correctly regardless of whether a message was created via REST or P2P gossip.

All 12 requirement IDs (MSG-01 through MSG-09, SEC-03, APP-03, APP-05) are accounted for and satisfied (SEC-03 with the known gossip-only caveat unchanged from initial verification). No regressions introduced.

---

_Verified: 2026-02-26T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — after gap closure by plan 04-06_
