---
phase: 02-server-management
plan: 05
subsystem: auth
tags: [x25519, aes-256-gcm, hkdf, tcp, qr-code, device-provisioning, electron-ipc]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Ed25519 identity system, crypto IPC module, IPC bridge pattern"
provides:
  - "Device-to-device keypair transfer via local TCP with X25519 + AES-256-GCM"
  - "QR code display for provisioning payload"
  - "IPC provisioning module (startProvisioning, cancelProvisioning, receiveProvisioning)"
  - "DeviceProvisioning page with Send and Receive modes"
affects: [03-p2p-networking, client-identity-flow]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Length-prefixed TCP wire protocol with HMAC confirmation", "X25519 SPKI DER import/export for Node.js crypto"]

key-files:
  created:
    - client/src/main/ipc/provisioning.ts
    - client/src/renderer/src/pages/DeviceProvisioning.tsx
    - client/src/renderer/src/components/ProvisioningQR.tsx
  modified:
    - client/src/main/ipc/channels.ts
    - client/src/main/index.ts
    - shared/types/ipc-bridge.ts
    - client/src/preload/index.ts
    - client/src/renderer/src/App.tsx
    - client/src/renderer/src/pages/Welcome.tsx

key-decisions:
  - "Length-prefixed wire protocol (4-byte uint32 BE + payload) to avoid TCP read/write deadlocks"
  - "X25519 SPKI DER header (302a300506032b656e032100) for Node.js crypto key import/export"
  - "Transfer encrypted identity blob alongside raw session keys for new device storage"
  - "Text input fallback for QR payload since Electron desktop lacks camera scanning"

patterns-established:
  - "TCP provisioning wire protocol: pubkey (32B) -> length-prefixed encrypted payload -> HMAC (32B)"
  - "QR payload format: JSON with ip, port, pk (hex) fields"

requirements-completed: [SEC-12]

# Metrics
duration: 6min
completed: 2026-02-25
---

# Phase 2 Plan 5: Device Provisioning Summary

**QR-based local device-to-device identity transfer using X25519 key exchange, HKDF-SHA256 key derivation, and AES-256-GCM encryption over TCP**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-25T02:59:34Z
- **Completed:** 2026-02-25T03:05:42Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Full SEC-12 implementation: existing device generates QR with ephemeral X25519 key and local address, new device connects via TCP, keypair transferred encrypted
- Zero server involvement in any provisioning code path -- purely local TCP between co-located devices
- UI supports both Send mode (existing device, QR display) and Receive mode (new device, text input with clipboard paste)

## Task Commits

Each task was committed atomically:

1. **Task 1: IPC provisioning module with TCP listener and crypto** - `ebe2c52` (feat)
2. **Task 2: Device provisioning UI (QR display and receive flow)** - `ff1467c` (feat)

## Files Created/Modified
- `client/src/main/ipc/provisioning.ts` - TCP listener, X25519 key exchange, HKDF key derivation, AES-256-GCM encrypted keypair transfer, IPC handler registration
- `client/src/main/ipc/channels.ts` - Added PROVISIONING_START, PROVISIONING_CANCEL, PROVISIONING_RECEIVE channel constants
- `client/src/main/index.ts` - Registered provisioning IPC handlers
- `shared/types/ipc-bridge.ts` - Extended UnitedAPI with provisioning namespace (3 methods)
- `client/src/preload/index.ts` - Exposed provisioning methods via contextBridge
- `client/src/renderer/src/components/ProvisioningQR.tsx` - QR code display with copiable text fallback
- `client/src/renderer/src/pages/DeviceProvisioning.tsx` - Two-mode page (Send/Receive) with full state management
- `client/src/renderer/src/App.tsx` - Added /device-provisioning route
- `client/src/renderer/src/pages/Welcome.tsx` - Added "Transfer from Device" button for new users

## Decisions Made
- **Length-prefixed wire protocol:** Sender writes 4-byte big-endian uint32 length prefix before encrypted payload. This avoids the TCP read/write deadlock that would occur if receiver waited for socket 'end' event before sending HMAC (sender waits for HMAC, receiver waits for end = deadlock).
- **X25519 SPKI DER import/export:** Node.js crypto module requires SPKI DER format for X25519 keys. Used known 12-byte header `302a300506032b656e032100` to wrap/unwrap raw 32-byte keys.
- **Transfer full identity blob:** Sender transfers encrypted private key blob + argon2 params alongside raw session keys, so the receiving device can store the identity in the same format and unlock it with the same passphrase.
- **Text input fallback for QR:** Since Electron desktop does not have camera scanning capability, the QR payload is also displayed as copiable text. The payload is compact enough (JSON with IP + port + 64-char hex key) for manual clipboard transfer between devices.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TCP protocol deadlock in receiver flow**
- **Found during:** Task 1 (IPC provisioning module)
- **Issue:** Initial implementation had receiver wait for socket 'end' event to read all data, but sender waits for HMAC before ending. This creates a deadlock.
- **Fix:** Implemented length-prefixed framing protocol -- sender writes 4-byte length prefix, receiver reads exact payload size from stream, sends HMAC while connection still open.
- **Files modified:** client/src/main/ipc/provisioning.ts
- **Verification:** Protocol flow analysis confirms no deadlock: receiver reads length+payload, sends HMAC, sender reads HMAC, both close.
- **Committed in:** ebe2c52 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Protocol deadlock fix was essential for correctness. No scope creep.

## Issues Encountered
- Pre-existing TypeScript type errors (shared types rootDir, sodium-native declarations) are not caused by this plan's changes. The electron-vite bundler resolves these correctly at build time.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SEC-12 device provisioning is complete and ready for integration testing when two Electron instances are available
- The provisioning module uses no server APIs and is fully independent of other Phase 2 plans
- Future enhancement: camera-based QR scanning can be added to the Receive mode without protocol changes

## Self-Check: PASSED

- All 9 files verified present on disk
- Commit ebe2c52 (Task 1) verified in git log
- Commit ff1467c (Task 2) verified in git log
- electron-vite build succeeds (main, preload, renderer)

---
*Phase: 02-server-management*
*Completed: 2026-02-25*
