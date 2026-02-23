# Identity Architecture: UNITED

**Defined:** 2026-02-22
**Status:** Design complete, pending implementation (Phase 1)

## Design Principles

1. **Local device is the identity authority.** Your keypair lives on your device. No server is the "source of truth" for who you are.
2. **No single server is a point of failure for identity.** Losing access to one server does not kill your identity.
3. **Keypair management must be invisible to users.** Users pick a passphrase. They never see a hex string unless they choose to.
4. **Security properties must hold on self-hosted single-machine deployments.** Don't assume HSMs, split-storage, or professional ops.
5. **v1 uses only proven, audited components.** Ed25519, Argon2id, BIP39, AES-256-GCM, JWT — all battle-tested. No novel protocols.

## Design Rationale

This architecture was chosen after evaluating identity models in Nostr, Bluesky (AT Protocol), Matrix, Keybase, Signal, SimpleX, Briar, Session, Tox, and Jami, plus analysis of OPAQUE (RFC 9807), FROST (RFC 9591), Kintsugi, DIDs (W3C), and passkey/WebAuthn.

Key findings that drove the design:
- **Identity must not equal key.** Nostr's model (pubkey IS identity, no rotation) is its biggest weakness. We add indirection so keys can rotate.
- **No home server.** Matrix has spent 6+ years failing to solve account portability. The home server model creates a dependency that contradicts sovereignty.
- **OPAQUE's advantages evaporate in self-hosted deployments.** Partial compromise resistance requires storing the OPRF seed separately — impractical on a single machine. Post-full-compromise, OPAQUE degrades to approximately Argon2id alone.
- **Every production P2P messenger uses raw keypairs.** Briar, Session, Tox, Jami, Nostr — none use OPAQUE, DIDs, or threshold recovery. Complexity must be justified.
- **Recovery is the actual hard problem.** Identity generation is trivial. What kills adoption is: lost keys, no multi-device, no password reset.

---

## Layer 1: Identity

### Mechanism

Identity is a **random Ed25519 keypair** generated with 256 bits of entropy from the OS CSPRNG.

```
Identity creation:
  1. Generate 32 random bytes from OS CSPRNG
  2. Derive Ed25519 keypair (private key + public key)
  3. Identity fingerprint = SHA-256(public_key), truncated to 20 bytes
  4. Encode fingerprint as base32 for display: UNITED-ABCDE-FGHIJ-KLMNO-PQRST
```

### What the identity IS

| Property | Value |
|----------|-------|
| Stable identifier | SHA-256(public_key), 20 bytes, base32-encoded |
| Display format | `UNITED-ABCDE-FGHIJ-KLMNO-PQRST` (human-friendly) |
| Wire format | Raw 32-byte public key |
| Survives key rotation | Yes (identity = hash of genesis record, not current key — see Layer 5) |

### What the identity IS NOT

- Not a DID. No DID documents, no method registries, no verifiable credentials in v1.
- Not a blockchain address. No chain, no tokens, no gas.
- Not a global username. Display names are server-local.

### Display Names

Display names are **per-server**, bound to public key:
- Alice joins Dave's server → display name "Alice" bound to her public key
- Alice joins Sarah's server → display name "Alice" (or "AliceGamer", her choice) bound to the same public key
- Both servers independently verify the same key. Cross-server identity is cryptographic, not name-based.

Format for cross-server references: `Alice@dave-server.example.com` (like Matrix/email). This is a display convention, not a protocol-level identity.

---

## Layer 2: Key Protection

### At Rest

The private key is encrypted on the user's device:

```
Key protection:
  1. User chooses a passphrase during identity creation
  2. Derive encryption key: Argon2id(passphrase, random_salt, m=256MB, t=3, p=4)
  3. Encrypt private key: AES-256-GCM(derived_key, private_key)
  4. Store on device:
     ~/.united/
       identity.json     # { fingerprint, public_key, salt, encrypted_private_key, nonce }
```

### Passphrase Requirements

- Minimum 12 characters enforced by client
- Strength meter in UI (zxcvbn or similar)
- No maximum length
- Passphrase is **changeable** — re-encrypt the same private key with a new derived key. Identity does not change.

### Unlocking

On app launch, user enters passphrase. Client derives the key, decrypts the private key, holds it in memory for the session. When the app closes, the decrypted key is zeroed from memory.

---

## Layer 3: Recovery

Recovery is the hardest problem in decentralized identity. We solve it with three independent tiers, all shipped in v1. Any one tier is sufficient to recover.

### Tier 1: Mnemonic Backup (Paper)

At identity creation, display the raw private key as a **24-word BIP39 mnemonic**:

```
Your recovery phrase (write this down and store it safely):

witch collapse practice feed shame open despair creek
road again ice least pencil order shop blanket harvest
violin maple solve congress elegant body arena mandate
```

- 24 words = 256 bits of entropy (full Ed25519 key strength)
- NOT a user-chosen passphrase — this IS the raw key, encoded as words
- Works forever, on any device, with no server dependency
- Standard BIP39 wordlist (2048 English words, unambiguous)
- The "break glass in emergency" option

**Recovery flow:** Enter 24 words on a new device → reconstruct private key → re-encrypt with new passphrase → identity restored.

### Tier 2: Encrypted Backup on Servers

When a user joins a server, their **encrypted identity blob** is stored on that server:

```
Encrypted backup blob:
  {
    fingerprint: "ABCDE-FGHIJ-KLMNO-PQRST",
    public_key: <32 bytes>,
    encrypted_private_key: AES-256-GCM(Argon2id(passphrase), private_key),
    salt: <16 bytes>,
    nonce: <12 bytes>,
    created_at: timestamp
  }
```

- The server **cannot decrypt this** — it's encrypted with the user's passphrase-derived key
- Stored on **every server the user joins** — not a single "home server"
- Any server can serve it back on a new device
- Server admin's maximum power: delete your copy. Other servers still have it.
- A server breach exposes encrypted blobs — attacker needs the passphrase for offline attack (Argon2id makes this expensive)

**Recovery flow:** On new device → connect to any server you've joined → request your encrypted blob → enter passphrase → decrypt → identity restored.

### Tier 3: Device-to-Device Provisioning

When adding a second device while you still have an existing one:

```
Device provisioning:
  1. Existing device displays QR code containing:
     - Ephemeral X25519 public key
     - Connection info (local network or relay)
  2. New device scans QR code
  3. Devices establish encrypted channel (X25519 key exchange)
  4. Existing device sends: encrypted private key + identity metadata
  5. New device decrypts, stores locally, encrypted with its own passphrase
```

- No server involved
- Works on local network or via coordination server relay
- Same pattern Signal uses for device linking
- The common case for "I got a new laptop"

### Future: Tier 4 — Threshold Recovery (v2)

Kintsugi-style threshold OPRF across coordination servers:
- Password + cooperation of T-of-N servers the user has joined = key recovery
- No single server can brute-force the password alone
- No hardware enclaves required
- Built with libp2p (our stack)
- Formal security proofs (Kleppmann et al., 2025)

This replaces Tier 2's "any single server can serve the blob" (where a compromised server + weak passphrase = offline attack) with a cryptographically stronger model. But Tier 2 is good enough for v1.

---

## Layer 4: Server Authentication

Authentication to coordination servers uses **challenge-response**, not passwords:

```
Joining a server (first time):
  1. User clicks invite link → client connects to coordination server
  2. Server sends random nonce (32 bytes)
  3. Client signs nonce with Ed25519 private key
  4. Server verifies signature against presented public key
  5. Server stores: { public_key, fingerprint, display_name, roles, joined_at }
  6. Server stores encrypted identity backup blob (Layer 3, Tier 2)
  7. Server issues JWT (access token, 15min expiry) + refresh token (7-day expiry)

Returning to a server:
  1. Client presents JWT
  2. If expired, client signs a new challenge → server issues fresh JWT
  3. Normal session continues

New device, no existing device:
  1. Client connects to server, requests encrypted backup blob by fingerprint
  2. User enters passphrase → client decrypts blob → recovers keypair
  3. Client signs challenge → server verifies → session established
```

### JWT Sessions

- Access token: 15-minute expiry, contains fingerprint + server-local user ID + roles
- Refresh token: 7-day expiry, stored securely on client
- Standard JWT validation — no custom session management
- Server admin configures token lifetimes

### TOTP (Two-Factor Authentication)

Shipped as **default-on** in server configuration:

```toml
# Default server config
[auth]
require_totp = true       # TOTP required for all users
allow_admin_disable = true # Admin CAN turn it off
totp_algorithm = "SHA1"    # RFC 6238 standard
totp_digits = 6
totp_period_seconds = 30
```

- Standard TOTP compatible with Google Authenticator, Authy, etc.
- TOTP secret generated per-user, per-server (independent across servers)
- TOTP secret stored encrypted at rest in server database
- Protects against: stolen device with decrypted key (attacker needs phone too)
- Server admin can disable for their community

### What the Server Stores

| Data | Purpose | Can server read it? |
|------|---------|-------------------|
| Public key | Identity verification | Yes (it's public) |
| Fingerprint | User lookup | Yes (derived from public key) |
| Display name | UI | Yes |
| Roles/permissions | Authorization | Yes |
| Encrypted identity blob | Backup for user recovery | **No** (encrypted with user's passphrase) |
| TOTP secret | 2FA verification | Yes (must be shared for TOTP to work) |
| JWT refresh token hash | Session management | Yes (hashed, not plaintext) |

The server **never** stores: passwords, passphrases, private keys, or unencrypted identity material.

---

## Layer 5: Key Rotation

Keys can be compromised. The identity must survive key rotation.

### Identity Indirection

The stable identity is **not** the current public key. It's the fingerprint of the **genesis record**:

```
Genesis record (created once, at identity creation):
  {
    type: "genesis",
    public_key: <initial public key>,
    created_at: timestamp,
    signature: <self-signed by initial private key>
  }

Identity fingerprint = SHA-256(genesis_record), truncated to 20 bytes
```

This fingerprint never changes, even when keys rotate. Servers and peers resolve the fingerprint to the **current** public key via the rotation chain.

### Rotation Protocol

```
Key rotation:
  1. User generates new Ed25519 keypair
  2. Creates rotation record:
     {
       type: "rotation",
       prev_key: <old public key>,
       new_key: <new public key>,
       reason: "compromise" | "scheduled" | "device_loss",
       timestamp: <current time>,
       signature_old: <signed by old private key>,
       signature_new: <signed by new private key>
     }
  3. Broadcasts rotation record to all servers the user has joined
  4. Each server verifies both signatures and updates key mapping
  5. 72-hour challenge window begins (see below)
```

### 72-Hour Challenge Window

Inspired by Bluesky's rotation key mechanism:

- After a rotation is broadcast, the **old key** can submit a cancellation within 72 hours
- If the old key cancels, the rotation is reverted
- This protects against: attacker who steals the current key and immediately rotates to lock out the real user
- The real user has 72 hours to notice and cancel from any device that still has the old key
- After 72 hours with no cancellation, the rotation is final

### What Rotation Preserves

- Identity fingerprint (unchanged)
- Server memberships (servers update key mapping)
- Display names and roles (bound to fingerprint, not key)
- Reputation and history (bound to fingerprint)

### What Rotation Does NOT Preserve

- Active sessions (all JWTs invalidated, must re-authenticate with new key)
- TOTP secrets (must re-enroll on each server)
- Encrypted backup blobs (must re-encrypt and re-upload with new key)

---

## Threat Model

### What This Protects Against

| Threat | Protection |
|--------|-----------|
| **Server breach** | Server has no passwords/private keys. Encrypted backup blobs require passphrase to decrypt. TOTP secrets exposed but useless without the identity key. |
| **Server death** | Identity is on your device. Backup blobs on other servers. Mnemonic on paper. No single server dependency. |
| **Server admin bans you** | Your identity continues. You lose membership on that server only. Other servers unaffected. |
| **Device theft (locked)** | Private key encrypted with Argon2id(passphrase). Attacker must brute-force the passphrase. |
| **Device theft (unlocked app)** | TOTP blocks server authentication without the authenticator device. Attacker has limited window before session expires. |
| **Key compromise** | Key rotation with 72-hour challenge window. Rotate to new key, old key becomes invalid. |
| **Eavesdropping** | All server communication over TLS. Challenge-response auth — no password transmitted. |
| **Man-in-the-middle** | Ed25519 signatures are unforgeable. Server certificate pinning for additional protection. |

### What This Does NOT Protect Against

| Threat | Why | Mitigation |
|--------|-----|-----------|
| **Weak passphrase + server breach** | Attacker gets encrypted blob, brute-forces passphrase offline via Argon2id | Enforce minimum passphrase strength, tune Argon2id to be expensive |
| **Total device loss + no backup** | No mnemonic, no other device, no server access | UX must aggressively prompt for mnemonic backup during onboarding |
| **Compromised device (malware)** | Malware can extract decrypted private key from memory | Out of scope for app-level security (OS-level threat) |
| **Rubber hose cryptanalysis** | Physical coercion to reveal passphrase | Out of scope |
| **Quantum computing** | Ed25519 is not post-quantum | Industry-wide problem; migrate to Ed448 or PQ schemes when standardized |

### Comparison to Original Design

| Aspect | Original (SEC-01/SEC-02) | New Architecture |
|--------|--------------------------|------------------|
| Identity | Email + password on server | Ed25519 keypair on device |
| Auth | Password sent to server, Argon2id hash stored | Challenge-response, server never sees credentials |
| Session | JWT from password auth | JWT from signature verification |
| Recovery | Password reset via email | Mnemonic / encrypted backup on servers / device provisioning |
| Server breach exposure | Email + password hash | Encrypted blob (no credentials to steal) |
| Multi-server | Separate account per server | One keypair, present to any server |
| Key rotation | N/A | Signed rotation records, 72-hour window |
| Server dependency | Server holds your credentials | Server holds encrypted backup (optional convenience) |

---

## Requirement Changes

### SEC-01 (Revised)

**Old:** User can create an account with email and password; credentials hashed with Argon2id
**New:** User creates an identity by generating an Ed25519 keypair protected by a passphrase (Argon2id-encrypted). A 24-word mnemonic backup is displayed at creation. No email or password is stored on any server.

### SEC-02 (Revised)

**Old:** User session is managed via JWT tokens issued by the coordination server
**New:** User authenticates to servers via Ed25519 challenge-response signature. Server issues JWT tokens (15min access + 7-day refresh) after successful verification.

### New Requirements

- **SEC-09**: User's encrypted identity blob is stored on every server they join, enabling recovery from any server with the correct passphrase
- **SEC-10**: Servers ship with TOTP two-factor authentication enabled by default (RFC 6238 compatible, admin-configurable)
- **SEC-11**: User can rotate their identity key via signed rotation records broadcast to all joined servers, with a 72-hour cancellation window
- **SEC-12**: User can provision a new device by scanning a QR code from an existing device (direct encrypted key transfer, no server involvement)

---

## Implementation Notes

### Libraries (Rust server)

- **ed25519-dalek** — Ed25519 key generation, signing, verification
- **argon2** — Argon2id key derivation
- **aes-gcm** — AES-256-GCM encryption of identity blobs
- **jsonwebtoken** — JWT issuance and validation
- **totp-rs** — TOTP generation and verification
- **rand** — CSPRNG for key generation and nonces

### Libraries (Electron client)

- **sodium-native** — Ed25519, X25519, Argon2id (already in stack for crypto)
- **bip39** — Mnemonic generation and parsing (npm: `bip39`)
- **otpauth** — TOTP QR code generation for authenticator app enrollment
- **qrcode** — QR code display for device provisioning

### Key Storage Path (Client)

```
~/.united/
  identity.json           # Encrypted identity (public key, encrypted private key, salt, nonce)
  backup/
    mnemonic.txt.enc      # Optional: encrypted mnemonic (for users who want digital backup)
  servers/
    <server-fingerprint>/
      totp_secret.enc     # TOTP secret for this server (encrypted with identity key)
```

---

## v2 Upgrade Path

Features explicitly deferred from v1, with design hooks for future addition:

| Feature | v2 Approach | Why Deferred |
|---------|-------------|-------------|
| **Threshold recovery** | Kintsugi-style threshold OPRF across servers | Requires social features, complex protocol, research-stage |
| **OPAQUE backup retrieval** | Use OPAQUE for password-authenticated blob retrieval from servers | Marginal security gain over Argon2id blobs in self-hosted context |
| **DID compatibility** | Encode identity as `did:key:z6Mk...` for interop | No federation in v1, no external systems to interop with |
| **Passkey/WebAuthn** | Optional hardware-backed auth via PRF extension | Platform support still fragmented, Electron support unclear |
| **Global usernames** | SMT-based name registry or federated witness protocol | Requires cross-server infrastructure that doesn't exist in v1 |
| **Social proofs** | Keybase-style signed attestations linking external accounts | Nice-to-have, not core functionality |

---

## Research Sources

This design was informed by analysis of the following systems and protocols:

**Messaging Systems Analyzed:**
- Nostr (NIP-01, NIP-05, NIP-46) — keypair identity, no rotation, known UX failures
- Bluesky AT Protocol (did:plc) — rotation key hierarchy, 72-hour recovery window
- Matrix/Element — cross-signing, SSSS, homeserver failures and portability struggles
- Keybase — sigchain, per-device keys, social proofs, lessons from Zoom acquisition
- Signal — SVR/SVR3 multi-enclave recovery, PIN-based backup, device linking
- SimpleX — no identifiers at all, pairwise queues
- Briar — raw Ed25519, no recovery, no multi-device
- Session — 13-word seed (128-bit entropy compromise), removed forward secrecy
- Tox — NaCl keypairs, KCI vulnerability from homebrew crypto, project death
- Jami — keypair + DHT + optional name server, reliability issues

**Protocols Evaluated:**
- OPAQUE (RFC 9807) — password-authenticated key exchange, server never sees password. Rejected as core because advantages evaporate in self-hosted context.
- FROST (RFC 9591) — distributed key generation, threshold signatures. Earmarked for v2 social recovery.
- Kintsugi (Kleppmann et al., 2025) — decentralized threshold key recovery via libp2p. Earmarked for v2.
- DIDs (W3C) — formal objections from Google, Mozilla, Apple. 50+ incompatible methods. Deferred.
- Passkeys/WebAuthn PRF — promising but platform-dependent. Deferred.

---
*Defined: 2026-02-22*
*Last updated: 2026-02-22*
