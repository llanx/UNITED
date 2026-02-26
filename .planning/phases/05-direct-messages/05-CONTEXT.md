# Phase 5: Direct Messages - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Private one-on-one encrypted conversations where only the participants can read the messages, even if the coordination server is compromised. Includes E2E encryption with X25519 key exchange, offline delivery via encrypted server blobs, a dedicated DM section in the UI, and encryption indicators differentiating DMs from channel messages.

</domain>

<decisions>
## Implementation Decisions

### DM Conversation Flow
- Initiate DMs by clicking a user's name/avatar anywhere (member list, message, mention) — no dedicated compose button
- Anyone on the same server can DM each other; per-user blocking as the safety valve
- Conversations ordered by most recent activity (newest messages at top of list)

### Claude's Discretion: DM Open Behavior
- Claude decides what happens when you click to DM — navigate to DM view vs slide-over panel vs whatever fits the existing triple-column layout best

### Encryption UX
- First-time DM: dismissible educational banner with plain-language explanation ("Only you and [user] can read these messages. Not even the server operator can see them."). Self-contained, no external links.
- After dismissed: subtle lock icon near message input or conversation header for DMs
- Channel messages show a differentiated "signed" indicator (e.g., checkmark) — users learn the difference between E2E encrypted DMs and signed channel messages
- If key exchange fails (peer's public key unavailable): block send + explain. Message input disabled with: "Waiting for encryption keys from [user]". No unencrypted DMs ever sent.
- When the other person rotates their identity key: system message inline in conversation ("X's encryption keys have changed"). Non-blocking — conversation continues.
- No manual key verification in v1 (no safety number/fingerprint comparison). Trust based on server-mediated key exchange. Verification is a v2 feature.
- No screenshot/copy restrictions. User sovereignty — trust your users.

### Offline Delivery & History
- All DM history stored locally in encrypted SQLite. Scroll back as far as the conversation goes. History survives app restarts but not device wipes.
- Server holds encrypted blobs for offline delivery for 30 days. After that, undelivered messages are lost.
- Offline messages appear inline in conversation in chronological order with a subtle "received while offline" separator line. No special notification summary — just catch up.
- Delete for self only. Deleting a DM removes it from your local storage. The other person still has it. No server coordination needed. Honest about the reality of E2E.

### DM Section Layout
- DM icon at the top of the server rail (Discord-style). Clicking it replaces the channel sidebar with the DM conversation list.
- DM conversation list shows: user avatar, name, last message preview, timestamp, unread badge. Mirrors channel sidebar but for people.
- Red circle with unread DM count on the DM icon in the server rail — always visible regardless of what you're viewing.
- DM view is conversation only (full width). No right panel. Profile info accessible by clicking user's name at top.

</decisions>

<specifics>
## Specific Ideas

- First-time encryption explainer should feel like Signal's "Messages are end-to-end encrypted" but with friendlier, non-technical language
- DM sidebar should feel like the channel sidebar — same visual weight, same interaction patterns, just people instead of channels
- Key rotation system message should look like WhatsApp's yellow "security code changed" inline notice

</specifics>

<deferred>
## Deferred Ideas

- Manual key verification (safety numbers/fingerprints) — v2 feature
- Group DMs — separate phase
- Cross-device DM history sync via server blobs — future enhancement
- Screenshot notification (Snapchat-style) — decided against for v1, revisit if requested

</deferred>

---

*Phase: 05-direct-messages*
*Context gathered: 2026-02-25*
