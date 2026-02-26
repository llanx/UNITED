# Phase 5: Direct Messages - Research

**Researched:** 2026-02-25
**Domain:** End-to-end encrypted direct messaging with X25519 key exchange, offline delivery, client-side storage
**Confidence:** HIGH

## Summary

Phase 5 adds end-to-end encrypted direct messages where the coordination server is a blind relay -- it stores and forwards encrypted blobs but cannot read message content. The cryptographic foundation is already in the project: Ed25519 identity keys (sodium-native on client, ed25519-dalek on server) can be mathematically converted to X25519 Diffie-Hellman keys using libsodium's `crypto_sign_ed25519_pk_to_curve25519` / `crypto_sign_ed25519_sk_to_curve25519` functions. This eliminates the need for users to manage separate encryption keys -- their existing identity keypair does double duty.

The architecture has three layers: (1) key exchange -- client derives X25519 keys from Ed25519, computes per-conversation shared secret, derives symmetric key via HKDF; (2) message encryption -- each DM is encrypted with XChaCha20-Poly1305 using the derived key, then sent to the server as an opaque blob; (3) offline delivery -- server stores encrypted blobs keyed by recipient fingerprint with a 30-day TTL, delivers on reconnection. The UI adds a DM section to the server rail, replacing the channel sidebar with a conversation list when active.

**Primary recommendation:** Use libsodium's Ed25519-to-X25519 conversion for the DH key exchange (both exist in sodium-native already), XChaCha20-Poly1305 for message encryption (already used for identity encryption), and a new `dm_messages` table in both server and client SQLite databases. Server stores encrypted blobs via REST endpoints; real-time delivery via WS push events.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Initiate DMs by clicking a user's name/avatar anywhere (member list, message, mention) -- no dedicated compose button
- Anyone on the same server can DM each other; per-user blocking as the safety valve
- Conversations ordered by most recent activity (newest messages at top of list)
- First-time DM: dismissible educational banner with plain-language explanation ("Only you and [user] can read these messages. Not even the server operator can see them."). Self-contained, no external links.
- After dismissed: subtle lock icon near message input or conversation header for DMs
- Channel messages show a differentiated "signed" indicator (e.g., checkmark) -- users learn the difference between E2E encrypted DMs and signed channel messages
- If key exchange fails (peer's public key unavailable): block send + explain. Message input disabled with: "Waiting for encryption keys from [user]". No unencrypted DMs ever sent.
- When the other person rotates their identity key: system message inline in conversation ("X's encryption keys have changed"). Non-blocking -- conversation continues.
- No manual key verification in v1 (no safety number/fingerprint comparison). Trust based on server-mediated key exchange. Verification is a v2 feature.
- No screenshot/copy restrictions. User sovereignty -- trust your users.
- All DM history stored locally in encrypted SQLite. Scroll back as far as the conversation goes. History survives app restarts but not device wipes.
- Server holds encrypted blobs for offline delivery for 30 days. After that, undelivered messages are lost.
- Offline messages appear inline in conversation in chronological order with a subtle "received while offline" separator line. No special notification summary -- just catch up.
- Delete for self only. Deleting a DM removes it from your local storage. The other person still has it. No server coordination needed.
- DM icon at the top of the server rail (Discord-style). Clicking it replaces the channel sidebar with the DM conversation list.
- DM conversation list shows: user avatar, name, last message preview, timestamp, unread badge. Mirrors channel sidebar but for people.
- Red circle with unread DM count on the DM icon in the server rail -- always visible regardless of what you're viewing.
- DM view is conversation only (full width). No right panel. Profile info accessible by clicking user's name at top.

### Claude's Discretion
- What happens when you click to DM -- navigate to DM view vs slide-over panel vs whatever fits the existing triple-column layout best

### Deferred Ideas (OUT OF SCOPE)
- Manual key verification (safety numbers/fingerprints) -- v2 feature
- Group DMs -- separate phase
- Cross-device DM history sync via server blobs -- future enhancement
- Screenshot notification (Snapchat-style) -- decided against for v1, revisit if requested
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DM-01 | User can send and receive end-to-end encrypted direct messages (X25519 key exchange, only participants hold decryption keys) | Ed25519-to-X25519 conversion via sodium-native `crypto_sign_ed25519_pk_to_curve25519`/`crypto_sign_ed25519_sk_to_curve25519`; shared secret via `crypto_scalarmult`; symmetric key via HKDF-SHA256; encrypt with XChaCha20-Poly1305 (already in codebase). Server stores only encrypted blobs. |
| DM-02 | User can receive DMs while offline via encrypted blobs stored on the coordination server for later delivery | New server REST endpoints + DB table for encrypted DM blobs with 30-day TTL. On reconnect, client fetches pending blobs, decrypts locally. Server runs periodic cleanup of expired blobs. |
| DM-03 | User can see DM conversations listed separately from channel messages in a dedicated DM section | New DM icon in ServerRail, new `DmSidebar` component replacing ChannelSidebar when active, new `DmConversation` view in MainContent. New Zustand `dm` slice for conversation state. |
| SEC-05 | DMs use per-conversation keys negotiated via X25519 key exchange; coordination server stores only encrypted blobs | Per-conversation key = HKDF-SHA256(X25519_shared_secret, salt="united-dm", info=sorted(fingerprint_a, fingerprint_b)). Deterministic -- both sides derive same key. Server never sees plaintext or key material. |
| SEC-07 | User can see encryption indicators in the UI confirming that DMs are end-to-end encrypted and channel messages are signed | Lock icon for DM conversations, checkmark for signed channel messages. First-time educational banner for DMs. Key rotation triggers inline system message. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sodium-native | ^4.0.0 | Ed25519-to-X25519 conversion, crypto_scalarmult, XChaCha20-Poly1305 encryption | Already in project. Provides all needed primitives: key conversion, DH, AEAD. No new dependency. |
| x25519-dalek | 2.0 | Server-side X25519 DH for key exchange validation (optional) | Companion to ed25519-dalek already in Cargo.toml. Needed only if server validates DH proofs. |
| better-sqlite3 | ^12.6.2 | Client-side encrypted DM storage | Already in project. New tables for DM conversations and messages. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @bufbuild/protobuf | ^2.11.0 | Protobuf encoding for DM envelope on the wire | Already in project. New `dm.proto` schema for DM-specific messages. |
| prost | 0.14 | Server-side protobuf for DM blob storage/retrieval | Already in project. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Ed25519-to-X25519 conversion | Separate X25519 keypair | Requires users to manage two keypairs, complicates key rotation. Conversion is mathematically sound and used by Signal. |
| XChaCha20-Poly1305 for message encryption | crypto_box (NaCl box) | crypto_box uses XSalsa20-Poly1305 + X25519 in one call, but XChaCha20-Poly1305 is already used everywhere in the project and gives explicit control over nonce generation. Consistency wins. |
| crypto_box_seal (sealed boxes) | crypto_box_easy | Sealed boxes are for anonymous senders. DMs have known senders. crypto_box_easy or manual AEAD is more appropriate. |
| HKDF for key derivation | Raw shared secret | Raw X25519 output should never be used directly as an encryption key. HKDF adds domain separation and proper key derivation. Already used in provisioning.ts. |

**Installation:**
```bash
# No new client dependencies needed -- all primitives exist in sodium-native
# Server: add x25519-dalek only if server needs to validate DH
cargo add x25519-dalek --features static_secrets
```

## Architecture Patterns

### Recommended Project Structure

```
# Server additions
server/src/dm/
  mod.rs          # Module declaration
  store.rs        # REST endpoints: store/fetch encrypted DM blobs
  cleanup.rs      # Background task: purge expired blobs (30-day TTL)

# Client additions
client/src/main/ipc/dm.ts          # DM IPC handlers (send, fetch, list conversations)
client/src/main/dm/
  crypto.ts                         # X25519 key derivation, message encrypt/decrypt
  store.ts                          # Local SQLite DM storage queries
client/src/renderer/src/stores/dm.ts        # Zustand DM slice
client/src/renderer/src/components/
  DmIcon.tsx                        # Server rail DM button with unread badge
  DmSidebar.tsx                     # Conversation list (replaces ChannelSidebar)
  DmConversation.tsx                # Message view for a DM conversation
  DmMessageInput.tsx                # Input with lock icon, disabled state for key unavailable
  EncryptionBanner.tsx              # First-time educational banner
  EncryptionIndicator.tsx           # Lock icon (DM) / checkmark (channel) indicators

# Proto additions
shared/proto/dm.proto               # DM-specific protobuf messages
```

### Pattern 1: Ed25519-to-X25519 Key Derivation (Client)

**What:** Convert Ed25519 signing keys to X25519 DH keys for per-conversation encryption
**When to use:** When initiating or receiving a DM conversation
**Example:**
```typescript
// Source: sodium-native docs (https://sodium-friends.github.io/docs/docs/signing)
import sodium from 'sodium-native'

function deriveX25519Keys(ed25519SecretKey: Buffer, ed25519PublicKey: Buffer): {
  x25519SecretKey: Buffer;
  x25519PublicKey: Buffer;
} {
  const x25519SecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES) // 32 bytes
  const x25519PublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES) // 32 bytes

  sodium.crypto_sign_ed25519_sk_to_curve25519(x25519SecretKey, ed25519SecretKey)
  sodium.crypto_sign_ed25519_pk_to_curve25519(x25519PublicKey, ed25519PublicKey)

  return { x25519SecretKey, x25519PublicKey }
}
```

### Pattern 2: Per-Conversation Symmetric Key Derivation

**What:** Derive a deterministic symmetric key for each DM conversation from X25519 shared secret
**When to use:** Before encrypting/decrypting any DM message
**Example:**
```typescript
// Source: libsodium key exchange docs, project provisioning.ts pattern
import sodium from 'sodium-native'
import { createHash } from 'crypto'
import * as crypto from 'crypto'

function deriveConversationKey(
  myX25519SecretKey: Buffer,
  theirX25519PublicKey: Buffer,
  myFingerprint: string,
  theirFingerprint: string
): Buffer {
  // X25519 Diffie-Hellman: compute shared secret
  const sharedSecret = Buffer.alloc(sodium.crypto_scalarmult_BYTES) // 32 bytes
  sodium.crypto_scalarmult(sharedSecret, myX25519SecretKey, theirX25519PublicKey)

  // Sort fingerprints for deterministic info string (both sides get same key)
  const sorted = [myFingerprint, theirFingerprint].sort()
  const info = `${sorted[0]}:${sorted[1]}`

  // HKDF-SHA256 for proper key derivation with domain separation
  return Buffer.from(
    crypto.hkdfSync('sha256', sharedSecret, 'united-dm', info, 32)
  )
}
```

### Pattern 3: DM Message Encryption/Decryption

**What:** Encrypt a DM message with the per-conversation key before sending
**When to use:** Every DM send and receive
**Example:**
```typescript
// Source: existing crypto.ts pattern in codebase (XChaCha20-Poly1305)
function encryptDmMessage(plaintext: Buffer, conversationKey: Buffer): Buffer {
  const nonce = Buffer.alloc(24) // XChaCha20-Poly1305 nonce
  sodium.randombytes_buf(nonce)

  const ciphertext = Buffer.alloc(
    plaintext.length + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES
  )
  sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    ciphertext,
    plaintext,
    null, // no additional data
    null, // unused nsec
    nonce,
    conversationKey
  )

  // Wire format: nonce (24 bytes) || ciphertext (message + 16 byte tag)
  return Buffer.concat([nonce, ciphertext])
}

function decryptDmMessage(encryptedBlob: Buffer, conversationKey: Buffer): Buffer {
  const nonce = encryptedBlob.subarray(0, 24)
  const ciphertext = encryptedBlob.subarray(24)

  const plaintext = Buffer.alloc(
    ciphertext.length - sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES
  )
  sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    plaintext,
    null, // unused nsec
    ciphertext,
    null, // no additional data
    nonce,
    conversationKey
  )
  return plaintext
}
```

### Pattern 4: Server Blind Relay (REST Endpoints)

**What:** Server stores/retrieves encrypted DM blobs without ability to decrypt
**When to use:** Sending DMs and fetching offline messages
**Example:**
```rust
// POST /api/dm/send — store encrypted blob for recipient
// Body: { recipient_fingerprint, encrypted_blob (hex), sender_fingerprint, timestamp }
// Server stores blob with 30-day TTL, notifies recipient via WS if online

// GET /api/dm/pending — fetch undelivered blobs for authenticated user
// Returns: [{ id, sender_fingerprint, encrypted_blob, timestamp }]
// After client confirms receipt, DELETE /api/dm/ack/{id}

// Server CANNOT: decrypt blobs, read message content, see who said what
// Server CAN: see sender/recipient fingerprints, message size, timestamps (metadata)
```

### Pattern 5: DM UI Navigation (Claude's Discretion Recommendation)

**What:** Navigate to DM view within the existing triple-column layout
**Recommendation:** When user clicks to DM someone, navigate to the DM view (replace channel sidebar with DM conversation list, replace main content with DM conversation). This fits the existing triple-column layout: Server Rail | DM Sidebar | DM Conversation. Same pattern as Discord.

**Reasoning:**
- The server rail already has space for a DM icon at the top
- The channel sidebar component is already swappable (different panels based on `activePanel`)
- A slide-over panel would add complexity without benefit and break the consistent layout
- Full navigation is the pattern users expect from Discord/Slack DMs

### Anti-Patterns to Avoid

- **Encrypting at the server:** Server must NEVER see plaintext DMs. All encryption/decryption happens in the Electron main process.
- **Storing keys on server:** Server stores only Ed25519 public keys (for identity). X25519 derivation and conversation keys exist only in client memory.
- **Global DM encryption key:** Each conversation MUST have its own derived key. A single key for all DMs means compromising one conversation compromises all.
- **Nonce reuse:** Every encrypted message MUST use a fresh random nonce. Never derive nonces from counters or timestamps with XChaCha20 (the 24-byte nonce space makes random safe).
- **Sending unencrypted DMs as fallback:** CONTEXT.md explicitly requires blocking send when keys are unavailable. No degraded mode.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ed25519-to-X25519 conversion | Manual curve math | `sodium.crypto_sign_ed25519_pk_to_curve25519` / `sk_to_curve25519` | The conversion involves Edwards-to-Montgomery coordinate mapping. One wrong bit = broken keys. libsodium handles clamping, cofactor clearing. |
| Diffie-Hellman shared secret | Manual scalar multiplication | `sodium.crypto_scalarmult` | Constant-time implementation critical for side-channel resistance. |
| Key derivation from shared secret | SHA-256 hash of raw secret | `crypto.hkdfSync('sha256', ...)` (Node.js built-in) | HKDF provides proper domain separation, prevents related-key attacks. Raw hashing is insufficient. |
| AEAD encryption | AES-GCM via Node.js crypto | `sodium.crypto_aead_xchacha20poly1305_ietf_encrypt` | Project already uses XChaCha20-Poly1305 everywhere. Consistency and no AES-NI dependency. |
| Nonce generation | Counter-based nonce | `sodium.randombytes_buf` | 24-byte XChaCha20 nonces have negligible collision probability with random generation. Counter nonces require persistent state management across restarts. |
| Message ordering | Custom sequence protocol | Timestamps + client-generated IDs | DMs are 1:1 -- timestamps suffice for ordering. No need for server-assigned sequence numbers (unlike channels with gossipsub). |

**Key insight:** The entire cryptographic stack for DM encryption already exists in the project dependencies. The only "new" functions are the Ed25519-to-X25519 conversions, which are standard libsodium operations available in sodium-native.

## Common Pitfalls

### Pitfall 1: Key Rotation Breaking Active DM Conversations
**What goes wrong:** User rotates their Ed25519 identity key. All derived X25519 keys change. The other participant's conversation key no longer matches.
**Why it happens:** The conversation key is derived from the X25519 DH of both parties' Ed25519 keys. Changing one party's key changes the shared secret.
**How to avoid:** When a key rotation event is received (already in the system), the client must: (1) re-derive the conversation key using the new public key, (2) show the inline system message ("X's encryption keys have changed"), (3) store the old key alongside the new one to decrypt historical messages still in local storage. Messages already decrypted and stored locally as plaintext are unaffected.
**Warning signs:** Decryption failures on new messages from a contact who recently rotated.

### Pitfall 2: Forgetting to Zero Sensitive Key Material
**What goes wrong:** X25519 secret keys or conversation keys remain in memory after use.
**Why it happens:** JavaScript garbage collection doesn't zero memory. Buffer contents persist until overwritten.
**How to avoid:** Follow the existing pattern in `crypto.ts`: use `sodium.sodium_memzero()` on all intermediate key buffers after use. Store conversation keys in a WeakMap or explicit cache that can be cleared on session lock/quit. The existing `clearSessionKeys()` pattern shows how.
**Warning signs:** Security audit finds key material lingering in heap dumps.

### Pitfall 3: Nonce-Key Pair Reuse
**What goes wrong:** Same nonce used with same key for different messages, allowing XOR of plaintexts.
**Why it happens:** XChaCha20-Poly1305 with 24-byte random nonces has negligible collision risk (birthday bound ~2^96 messages), BUT only if nonces are truly random.
**How to avoid:** Always use `sodium.randombytes_buf(nonce)` for each message. Never derive nonces from timestamps, counters, or message content. The 24-byte nonce space of XChaCha20 specifically enables safe random nonce generation.
**Warning signs:** Any code path that produces a nonce without calling `randombytes_buf`.

### Pitfall 4: Server-Side Blob Accumulation Without Cleanup
**What goes wrong:** Encrypted DM blobs accumulate indefinitely on the server, consuming disk space.
**Why it happens:** 30-day TTL requires active cleanup. Without a background task, blobs never expire.
**How to avoid:** Server must run a periodic cleanup task (e.g., every hour) that deletes blobs older than 30 days. Use SQLite's datetime comparison: `DELETE FROM dm_blobs WHERE created_at < datetime('now', '-30 days')`. Follow the existing pattern of background tasks in the server (challenge cleanup, rate limiter cleanup).
**Warning signs:** Server disk usage growing monotonically even when users are active.

### Pitfall 5: Race Condition on Offline Message Delivery
**What goes wrong:** User connects, fetches pending DMs, but more arrive during fetch. Some messages appear duplicated or missed.
**Why it happens:** No atomic "fetch and mark delivered" operation.
**How to avoid:** Use a two-phase delivery: (1) Client fetches all pending blobs with `GET /api/dm/pending`, (2) Client processes and stores locally, (3) Client acknowledges each blob with `DELETE /api/dm/ack/{id}`. The ack is idempotent -- deleting an already-deleted blob is a no-op. For real-time delivery while connected, WS push events handle new messages immediately.
**Warning signs:** Users reporting missing or duplicate DMs after reconnection.

### Pitfall 6: Conversation Key Caching Across Sessions
**What goes wrong:** Conversation keys are derived fresh on every message send/receive, causing expensive crypto operations.
**Why it happens:** X25519 DH + HKDF is not free. Doing it per-message is wasteful.
**How to avoid:** Cache derived conversation keys in memory, keyed by `(myFingerprint, theirFingerprint, theirPublicKeyHex)`. Invalidate the cache entry when the other party's public key changes (key rotation event). Clear all entries on session lock/quit. The public key in the cache key ensures rotation automatically invalidates stale entries.
**Warning signs:** Noticeable latency when sending/receiving DMs in rapid succession.

### Pitfall 7: Public Key Availability for New Conversations
**What goes wrong:** User tries to DM someone whose public key hasn't been fetched yet.
**Why it happens:** The client may not have every server member's public key cached locally.
**How to avoid:** The server already stores public keys in the `users` table. Add a REST endpoint `GET /api/users/{fingerprint}/public-key` (or batch endpoint) that returns the Ed25519 public key. The client fetches this before deriving the conversation key. If unavailable, show the "Waiting for encryption keys from [user]" state per CONTEXT.md.
**Warning signs:** Users seeing the "waiting for keys" state for users who are clearly online and registered.

## Code Examples

### Encrypted DM Blob Wire Format

```
DM Blob Structure (sent to server):
  sender_fingerprint: string     -- identifies sender (server can see this)
  recipient_fingerprint: string  -- identifies recipient (server can see this)
  encrypted_payload: bytes       -- nonce (24) || ciphertext (N + 16)
  timestamp: int64               -- Unix millis (server can see this)
  id: string                     -- UUIDv7 (unique blob ID)
```

### Server Migration (Rust)

```sql
-- Migration 4: Direct Messages (Phase 5)

CREATE TABLE dm_blobs (
    id TEXT PRIMARY KEY,
    sender_fingerprint TEXT NOT NULL,
    recipient_fingerprint TEXT NOT NULL,
    encrypted_payload BLOB NOT NULL,
    timestamp INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_dm_blobs_recipient ON dm_blobs(recipient_fingerprint);
CREATE INDEX idx_dm_blobs_created ON dm_blobs(created_at);
```

### Client Migration (TypeScript)

```sql
-- Client migration 2: DM storage

CREATE TABLE IF NOT EXISTS dm_conversations (
    id TEXT PRIMARY KEY,                    -- sorted fingerprints hash
    peer_fingerprint TEXT NOT NULL,
    peer_display_name TEXT,
    peer_public_key BLOB,                   -- cached Ed25519 public key
    last_message_preview TEXT,
    last_message_at TEXT,
    unread_count INTEGER NOT NULL DEFAULT 0,
    encryption_banner_dismissed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dm_messages (
    id TEXT PRIMARY KEY,                    -- UUIDv7
    conversation_id TEXT NOT NULL,
    sender_fingerprint TEXT NOT NULL,
    content TEXT NOT NULL,                  -- decrypted plaintext (stored locally)
    timestamp INTEGER NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0,   -- key rotation notices, etc.
    received_offline INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES dm_conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conv ON dm_messages(conversation_id, timestamp);
```

### Protobuf Schema (dm.proto)

```protobuf
syntax = "proto3";
package united.dm;

// Encrypted DM blob sent to server for storage/relay
message DmBlob {
    string id = 1;                      // UUIDv7
    string sender_fingerprint = 2;
    string recipient_fingerprint = 3;
    bytes encrypted_payload = 4;        // nonce || ciphertext
    int64 timestamp = 5;               // Unix millis
}

// Send a DM via server relay
message SendDmRequest {
    DmBlob blob = 1;
}

message SendDmResponse {
    bool stored = 1;
    bool delivered_realtime = 2;        // true if recipient was online
}

// Fetch pending (offline) DMs
message PendingDmsRequest {}

message PendingDmsResponse {
    repeated DmBlob blobs = 1;
}

// Acknowledge receipt of DM blobs (allows server to delete)
message AckDmsRequest {
    repeated string blob_ids = 1;
}

message AckDmsResponse {
    bool success = 1;
}

// Real-time DM push event (server -> recipient via WS)
message DmReceivedEvent {
    DmBlob blob = 1;
}

// Fetch a user's public key for DM key exchange
message GetPublicKeyRequest {
    string fingerprint = 1;
}

message GetPublicKeyResponse {
    bytes public_key = 1;               // Ed25519 public key (32 bytes)
    string display_name = 2;
}
```

### WS Envelope Extension

```protobuf
// Add to ws.proto Envelope oneof payload:
//   120-129: Direct Messages (Phase 5)
united.dm.SendDmRequest send_dm_request = 120;
united.dm.SendDmResponse send_dm_response = 121;
united.dm.PendingDmsRequest pending_dms_request = 122;
united.dm.PendingDmsResponse pending_dms_response = 123;
united.dm.AckDmsRequest ack_dms_request = 124;
united.dm.AckDmsResponse ack_dms_response = 125;
united.dm.DmReceivedEvent dm_received_event = 126;
united.dm.GetPublicKeyRequest get_public_key_request = 127;
united.dm.GetPublicKeyResponse get_public_key_response = 128;
```

### IPC Channel Constants Addition

```typescript
// Add to client/src/main/ipc/channels.ts
// DM
DM_SEND: 'dm:send',
DM_FETCH_PENDING: 'dm:fetch-pending',
DM_ACK: 'dm:ack',
DM_LIST_CONVERSATIONS: 'dm:list-conversations',
DM_GET_MESSAGES: 'dm:get-messages',
DM_DELETE_MESSAGE: 'dm:delete-message',
DM_GET_PUBLIC_KEY: 'dm:get-public-key',
DM_MARK_READ: 'dm:mark-read',

// Push events
PUSH_DM_RECEIVED: 'dm:received',
PUSH_DM_KEY_ROTATION: 'dm:key-rotation',
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Signal Protocol (Double Ratchet) | Simpler X25519 static DH for 1:1 DMs | Signal Protocol is gold standard but massive complexity | For v1 without forward secrecy requirement, static DH is sufficient. Double Ratchet is a v2 consideration. |
| Separate encryption keypair | Ed25519-to-X25519 conversion | libsodium has supported this since v1.0.0 | Users don't need to manage two keypairs. Signal uses the same conversion internally. |
| Server-mediated key exchange (KEM) | Direct DH from public keys | KEM adds a round trip | Both parties' public keys are already on the server. DH can be computed client-side without additional protocol. |

**Deprecated/outdated:**
- NaCl crypto_box (XSalsa20-Poly1305): Still works, but project uses XChaCha20-Poly1305 everywhere. Stick with project standard.
- Separate keypair generation for encryption: Unnecessary given Ed25519-to-X25519 conversion availability.

## Open Questions

1. **Forward secrecy for DMs**
   - What we know: Static DH key exchange means compromising either party's long-term key compromises all past messages. Signal Protocol (Double Ratchet) provides forward secrecy but adds massive complexity.
   - What's unclear: Whether the threat model warrants forward secrecy in v1, given DMs are stored locally in plaintext anyway.
   - Recommendation: Skip forward secrecy in v1. The threat model doc explicitly accepts "device theft with unlocked app" as limited-window risk. Static DH is consistent with this posture. Document as v2 enhancement alongside group DMs.

2. **Blocking implementation**
   - What we know: CONTEXT.md says "per-user blocking as the safety valve" for DMs.
   - What's unclear: Whether blocking should be a Phase 5 deliverable or deferred. No requirement ID explicitly covers blocking.
   - Recommendation: Include basic blocking in Phase 5 (local-only block list in client SQLite, server-side block list to reject blob storage). It's the safety valve for open DMs between all server members.

3. **DM metadata privacy**
   - What we know: Server can see sender/recipient fingerprints, timestamps, and message sizes (metadata). Content is encrypted.
   - What's unclear: Whether metadata minimization is in scope for v1.
   - Recommendation: Accept metadata visibility in v1. Padding messages, onion routing, or mix networks are v2+. The threat model says "server breach exposes encrypted blobs" -- metadata is implicitly accepted.

4. **REST vs WS for DM operations**
   - What we know: Channel operations use REST (authenticated via JWT). WS is used for real-time events. P2P peer directory uses WS.
   - What's unclear: Whether DM send should go through REST or WS.
   - Recommendation: Use REST for send/fetch/ack (consistent with channel CRUD pattern, simpler error handling, works with existing apiPost helper). Use WS push events for real-time delivery notifications (`DmReceivedEvent`). This hybrid matches the existing architecture perfectly.

## Sources

### Primary (HIGH confidence)
- [sodium-native signing API](https://sodium-friends.github.io/docs/docs/signing) - `crypto_sign_ed25519_pk_to_curve25519` and `sk_to_curve25519` function signatures confirmed
- [sodium-native sealed box encryption](https://sodium-friends.github.io/docs/docs/sealedboxencryption) - `crypto_box_seal` / `crypto_box_seal_open` API verified
- [sodium-native key box encryption](https://sodium-friends.github.io/docs/docs/keyboxencryption) - `crypto_box_easy` / `crypto_box_keypair` API verified
- [libsodium Ed25519 to Curve25519 docs](https://libsodium.gitbook.io/doc/advanced/ed25519-curve25519) - Conversion is mathematically sound, officially supported
- [libsodium key exchange docs](https://libsodium.gitbook.io/doc/key_exchange) - `crypto_kx` API with bidirectional key derivation
- [libsodium sealed boxes docs](https://libsodium.gitbook.io/doc/public-key_cryptography/sealed_boxes) - Internal construction: ephemeral keypair + blake2b nonce + crypto_box
- [x25519-dalek docs](https://docs.rs/x25519-dalek/latest/x25519_dalek/) - EphemeralSecret, StaticSecret, PublicKey, SharedSecret types
- [ed25519-dalek SigningKey](https://docs.rs/ed25519-dalek/latest/ed25519_dalek/struct.SigningKey.html) - `to_scalar_bytes()` for X25519 conversion, `verifying_key().to_montgomery()` for public key
- Existing codebase: `client/src/main/ipc/crypto.ts` - All XChaCha20-Poly1305 patterns verified in working code
- Existing codebase: `client/src/main/ipc/provisioning.ts` - X25519 DH + HKDF pattern verified in working code

### Secondary (MEDIUM confidence)
- [ed25519-dalek-hpke](https://github.com/rustonbsd/ed25519-dalek-hpke) - Demonstrates Ed25519-to-X25519 conversion pattern in Rust
- Signal Protocol documentation - Validates Ed25519-to-X25519 conversion as production pattern

### Tertiary (LOW confidence)
- None -- all findings verified against official documentation or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in the project; no new dependencies for core functionality
- Architecture: HIGH - Follows existing patterns (REST + WS, IPC bridge, Zustand slices, SQLite migrations) exactly
- Pitfalls: HIGH - Key rotation, key zeroing, and blob cleanup pitfalls derived from existing codebase patterns and standard crypto engineering
- Crypto correctness: HIGH - All primitives are standard libsodium operations used identically in production systems (Signal, Session)

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable domain, no fast-moving dependencies)
