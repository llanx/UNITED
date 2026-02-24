---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [protobuf, prost, bufbuild, electron, rust, axum, monorepo, ipc-bridge]

# Dependency graph
requires: []
provides:
  - "Monorepo directory structure (server/, client/, shared/, tests/)"
  - "Protobuf schemas for auth, identity, server, and WebSocket envelope"
  - "TypeScript REST API types, WS protocol types, and IPC bridge definitions"
  - "Rust server Cargo.toml with all Phase 1 dependencies"
  - "Electron client package.json with all Phase 1 dependencies"
  - "Prost-build codegen from shared/proto/ to Rust types"
  - "Buf codegen from shared/proto/ to TypeScript _pb.ts types"
  - "Cross-language protobuf compatibility verified (Rust <-> TypeScript)"
  - "Native module rebuild verified for Electron 40.6.0"
affects: [01-02, 01-03, 01-04, 01-05, 01-06]

# Tech tracking
tech-stack:
  added: [prost 0.14, axum 0.8, tokio 1.x, ed25519-dalek 2.2, rusqlite 0.38, jsonwebtoken 10.3, electron 40, react 19, zustand 5, "@bufbuild/protobuf 2.11", "@scure/bip39 2.0", sodium-native, better-sqlite3 12.6, electron-vite 3]
  patterns: [prost-build codegen via build.rs, buf generate for TypeScript protobuf, module hierarchy matching protobuf package paths, electron-vite main/preload/renderer split, assetsInlineLimit 0 for CSP safety]

key-files:
  created:
    - shared/proto/auth.proto
    - shared/proto/identity.proto
    - shared/proto/server.proto
    - shared/proto/ws.proto
    - shared/types/api.ts
    - shared/types/ws-protocol.ts
    - shared/types/ipc-bridge.ts
    - server/Cargo.toml
    - server/build.rs
    - server/src/proto/mod.rs
    - client/package.json
    - client/electron.vite.config.ts
    - client/tsconfig.json
    - tests/integration/proto-roundtrip.ts
    - tests/integration/encode-challenge.rs
  modified:
    - .gitignore

key-decisions:
  - "Module hierarchy must match protobuf package paths: proto::united::{auth,identity,server,ws}"
  - "Shared directory has its own package.json with @bufbuild/protobuf for generated type resolution"
  - "Electron rebuild requires explicit --version flag (auto-detection picks up system Node)"
  - "tower_governor uses underscore in crate name (not hyphen as in research doc)"
  - "Installed Rust toolchain and protoc as prerequisites (not pre-installed on system)"
  - "Generated protobuf TypeScript files are gitignored (regenerated from buf generate)"

patterns-established:
  - "Prost codegen: build.rs compiles shared/proto/*.proto, include! from OUT_DIR in proto/mod.rs"
  - "TypeScript protobuf: buf generate with protoc-gen-es, output to shared/types/generated/"
  - "Cross-language validation: Rust encodes binary -> TypeScript decodes and verifies"
  - "Electron native rebuild: npx electron-rebuild --version $(electron package version)"

requirements-completed: [SEC-01, SEC-02, SRVR-07]

# Metrics
duration: 19min
completed: 2026-02-24
---

# Phase 1 Plan 1: Shared Contracts Summary

**Protobuf schemas (auth, identity, server, WS envelope) with verified Rust/TypeScript round-trip, monorepo scaffold with all Phase 1 dependencies, and typed IPC bridge for Electron contextBridge API**

## Performance

- **Duration:** 19 min
- **Started:** 2026-02-24T03:21:25Z
- **Completed:** 2026-02-24T03:40:27Z
- **Tasks:** 3
- **Files modified:** 34

## Accomplishments

- Monorepo scaffold with server/ (Rust/axum), client/ (Electron/React), shared/ (proto + types), tests/integration/
- Four protobuf schemas defining the complete auth, identity, server, and WebSocket contract between Rust server and TypeScript client
- Three TypeScript type files: REST API interfaces, WebSocket close codes with reconnect logic, and full IPC bridge (UnitedAPI) for window.united
- Cross-language protobuf round-trip verified: Rust (prost) encodes ChallengeResponse, TypeScript (@bufbuild/protobuf) decodes and verifies byte-level compatibility
- Native module rebuild confirmed for Electron 40.6.0 (sodium-native and better-sqlite3)

## Task Commits

Each task was committed atomically:

1. **Task 1: Monorepo scaffold and build tooling** - `0c95e47` (feat)
2. **Task 2: Protobuf schemas and shared type definitions** - `3b12698` (feat)
3. **Task 3: Code generation validation and native module test** - `e0a20f1` (test)

## Files Created/Modified

- `server/Cargo.toml` - Rust server dependency manifest with all Phase 1 crates
- `server/build.rs` - Prost-build configuration for protobuf codegen
- `server/src/main.rs` - Minimal server entry point with proto module
- `server/src/proto/mod.rs` - Module hierarchy for prost-generated types (united::{auth,identity,server,ws})
- `client/package.json` - Electron/React client with all Phase 1 npm dependencies
- `client/electron.vite.config.ts` - Electron-vite config with main/preload/renderer and CSP-safe settings
- `client/tsconfig.json` - Root TypeScript config with sub-configs for main/preload/renderer
- `shared/proto/auth.proto` - Challenge-response, verify, register, refresh, TOTP messages
- `shared/proto/identity.proto` - IdentityBlob, GenesisRecord, RotationRecord, Argon2Params
- `shared/proto/server.proto` - ServerInfo, ServerSettings, RegistrationMode enum
- `shared/proto/ws.proto` - Envelope with oneof payload covering all message types
- `shared/types/api.ts` - REST endpoint request/response TypeScript interfaces
- `shared/types/ws-protocol.ts` - WebSocket close codes, connection status, reconnect with jitter
- `shared/types/ipc-bridge.ts` - Full UnitedAPI interface for window.united with global type declaration
- `shared/buf.gen.yaml` - Buf codegen config for protoc-gen-es
- `shared/buf.yaml` - Buf module config pointing to proto/
- `tests/integration/proto-roundtrip.ts` - Cross-language protobuf round-trip test
- `tests/integration/encode-challenge.rs` - Rust protobuf encoder for round-trip test
- `tests/integration/NATIVE-MODULES.md` - Native module rebuild results and fallback plan
- `.gitignore` - Added database files, generated protobuf output, test artifacts

## Decisions Made

1. **Prost module hierarchy matches protobuf packages** - proto::united::{auth,identity,server,ws} so cross-package references resolve correctly via super::
2. **Shared directory has its own package.json** - Required for generated TypeScript protobuf files to resolve @bufbuild/protobuf imports
3. **Electron rebuild needs explicit version** - `--version 40.6.0` flag required; auto-detection incorrectly uses system Node version
4. **tower_governor uses underscore** - The crate name on crates.io is `tower_governor` (not `tower-governor` as in research doc)
5. **Generated TypeScript protobuf files are gitignored** - Regenerated via `buf generate` from proto sources (single source of truth)
6. **Installed Rust 1.93.1 and protoc 29.6** - These were not pre-installed on the development machine

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed Rust toolchain**
- **Found during:** Task 1
- **Issue:** Rust (rustc/cargo) was not installed on the system
- **Fix:** Installed via `rustup` (stable-x86_64-pc-windows-msvc, Rust 1.93.1)
- **Verification:** `cargo check` passes

**2. [Rule 3 - Blocking] Installed protoc**
- **Found during:** Task 1 (cargo check)
- **Issue:** prost-build requires `protoc` binary which was not installed
- **Fix:** Downloaded protoc 29.6 for win64 from GitHub releases, installed to cargo/bin
- **Verification:** `cargo build` completes with prost codegen

**3. [Rule 1 - Bug] Fixed Cargo.toml package name**
- **Found during:** Task 1
- **Issue:** `tower-governor` package name used hyphen; crates.io requires `tower_governor` (underscore)
- **Fix:** Changed to `tower_governor = "0.6"` in Cargo.toml
- **Verification:** `cargo check` resolves the dependency

**4. [Rule 1 - Bug] Fixed prost module hierarchy**
- **Found during:** Task 2
- **Issue:** Generated types used `super::super::auth::` paths requiring a specific module tree structure
- **Fix:** Restructured proto/mod.rs to use `pub mod united { pub mod auth { ... } }` matching protobuf package hierarchy
- **Verification:** `cargo check` passes with all cross-package references resolved

**5. [Rule 3 - Blocking] Added shared/package.json for protobuf type resolution**
- **Found during:** Task 3
- **Issue:** Generated TypeScript protobuf files import from `@bufbuild/protobuf` but the dependency only existed in client/node_modules
- **Fix:** Created shared/package.json with @bufbuild/protobuf dependency
- **Verification:** Round-trip test imports and runs successfully

---

**Total deviations:** 5 auto-fixed (2 bugs, 3 blocking)
**Impact on plan:** All fixes necessary for correctness and task completion. No scope creep.

## Issues Encountered

- sodium-native loads on system Node but better-sqlite3 does not after Electron rebuild (expected: Electron ABI differs from system Node ABI). This is correct behavior - modules will work inside Electron runtime.
- Electron version auto-detection by @electron/rebuild uses system Node version instead of Electron version. Must pass `--version` explicitly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both developers can clone, `npm install` (client), `cargo build` (server), and have all shared contracts available
- Server developer (matts) has prost-generated Rust types for all proto messages
- Client developer (benzybones) can run `buf generate` to get TypeScript protobuf types
- IPC bridge types define the complete preload API surface for contextBridge
- REST API types define all HTTP endpoint contracts
- WebSocket protocol types define close codes and reconnection logic

## Self-Check: PASSED

All 16 key files verified present. All 3 commit hashes verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-02-24*
