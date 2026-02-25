---
phase: 01-foundation
plan: 06
subsystem: client
tags: [react, sodium-native, bip39, ed25519, xchacha20-poly1305, totp, qrcode, argon2id, websocket]

# Dependency graph
requires: [01-05]
provides:
  - "Real Ed25519 keypair generation and BIP39 mnemonic backup via sodium-native"
  - "Argon2id key derivation (m=256MB, t=3, p=4) with XChaCha20-Poly1305 secret key encryption"
  - "Challenge-response authentication and registration against server REST API"
  - "Identity recovery from 24-word mnemonic with re-encryption"
  - "TOTP 2FA enrollment with QR code (qrcode.react) and dismissible prompt"
  - "Server settings admin panel (name, description, registration mode)"
  - "Connection UX with WebSocket close code handling (4001/4002/4003)"
  - "Returning user passphrase-only unlock flow"
affects: [02-01]

# Tech tracking
tech-stack:
  added: [qrcode.react, "@scure/bip39"]
  patterns: [entropyToMnemonic (not mnemonicToSeed), XChaCha20-Poly1305 (not AES-256-GCM), 3-position mnemonic verification quiz, severity-based error UX, IPC-to-REST bridge pattern]

key-files:
  created:
    - client/src/renderer/src/pages/CreateIdentity.tsx
    - client/src/renderer/src/pages/RecoverIdentity.tsx
    - client/src/renderer/src/pages/JoinServer.tsx
    - client/src/renderer/src/components/MnemonicGrid.tsx
    - client/src/renderer/src/components/MnemonicVerify.tsx
    - client/src/renderer/src/components/TotpEnrollment.tsx
    - client/src/renderer/src/components/ServerSettings.tsx
    - client/src/renderer/src/hooks/useAuth.ts
    - client/src/renderer/src/hooks/useConnection.ts
    - client/src/renderer/src/hooks/useServer.ts
  modified:
    - client/src/main/ipc/crypto.ts
    - client/src/main/ipc/auth.ts
    - client/src/main/ipc/connection.ts
    - client/src/renderer/src/App.tsx
    - client/src/renderer/src/pages/Welcome.tsx
    - client/src/renderer/src/pages/Main.tsx
    - client/src/renderer/src/components/ChannelSidebar.tsx
    - client/src/renderer/src/components/MainContent.tsx
    - client/src/renderer/src/stores/auth.ts
    - shared/types/api.ts
    - shared/types/ipc-bridge.ts

key-decisions:
  - "XChaCha20-Poly1305 instead of AES-256-GCM for client-side encryption (more portable, no AES-NI dependency, 24-byte nonces eliminate collision risk)"
  - "entropyToMnemonic from @scure/bip39 (NOT mnemonicToSeed which produces 512-bit PBKDF2 output for HD wallets)"
  - "3-position mnemonic verification quiz: user selects correct word from 4 options at 3 random positions"
  - "Severity-based error UX: 4001 silent refresh, 4002 redirect with explanation, 4003 full-screen ban message"
  - "QR code generated client-side via qrcode.react (removed qr_png from server TotpEnrollResult)"
  - "ChallengeRequestBody is empty body (fingerprint in URL path, not body)"
  - "Hex encoding for public keys and signatures (not base64)"

requirements-completed: [SEC-01, SEC-02, SEC-10, SRVR-07]

# Metrics
completed: 2026-02-24
---

# Phase 1 Plan 6: Client Auth Flows Summary

**Real crypto identity creation/recovery, challenge-response auth, TOTP enrollment, server settings admin, and connection UX — completing the full Phase 1 client deliverable**

## Accomplishments
- Replaced all IPC stubs with real sodium-native Ed25519 keypair generation, Argon2id key derivation, and XChaCha20-Poly1305 encryption
- BIP39 mnemonic generation via entropyToMnemonic with mandatory 3-position verification quiz
- Challenge-response authentication and registration against server REST API with JWT storage
- Identity recovery from 24-word mnemonic with re-encryption under new passphrase
- TOTP 2FA enrollment component with QR code via qrcode.react (two-step: /enroll then /confirm)
- Server settings admin panel (name, description, registration mode toggle) accessible via server name dropdown
- Connection management hooks with WebSocket close code severity handling
- Returning user passphrase-only unlock flow on Welcome page
- Crypto refactor from AES-256-GCM to XChaCha20-Poly1305 for portability

## Task Commits

1. **Task 1: Identity creation, recovery, and auth** - `cc482d3` (feat)
2. **Task 2: TOTP enrollment, server settings, connection UX** - `e40d031` (feat)
3. **Crypto refactor: AES-256-GCM to XChaCha20-Poly1305** - `a2bf16f` (refactor)

## Files Created/Modified
- `client/src/main/ipc/crypto.ts` - Real sodium-native Ed25519, BIP39, Argon2id, XChaCha20-Poly1305
- `client/src/main/ipc/auth.ts` - Challenge signing, registration, JWT storage via Electron safeStorage
- `client/src/main/ipc/connection.ts` - WebSocket connection with auth and protobuf handling
- `client/src/renderer/src/pages/CreateIdentity.tsx` - Two-step identity creation (passphrase + mnemonic verification)
- `client/src/renderer/src/pages/RecoverIdentity.tsx` - 24-word mnemonic entry and re-encryption
- `client/src/renderer/src/pages/JoinServer.tsx` - Server URL validation, connection test, registration
- `client/src/renderer/src/components/MnemonicGrid.tsx` - 4x6 word grid display
- `client/src/renderer/src/components/MnemonicVerify.tsx` - 3-position verification quiz
- `client/src/renderer/src/components/TotpEnrollment.tsx` - QR code enrollment with 6-digit confirmation
- `client/src/renderer/src/components/ServerSettings.tsx` - Admin panel for server configuration
- `client/src/renderer/src/hooks/useAuth.ts` - Orchestrated login flow
- `client/src/renderer/src/hooks/useConnection.ts` - WS lifecycle and close code handling
- `client/src/renderer/src/hooks/useServer.ts` - Server info fetch and admin state
- `shared/types/api.ts` - Hex encoding, expanded RegisterResult, genesis_signature

## Self-Check: PASSED

All tasks completed. Commits verified in git log. Phase 1 client work complete.

---
*Phase: 01-foundation*
*Completed: 2026-02-24*
