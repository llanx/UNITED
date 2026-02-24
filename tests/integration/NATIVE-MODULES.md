# Native Module Rebuild Report

**Date:** 2026-02-24
**Electron:** 40.6.0 (Chromium 144, Node ABI 143)
**System Node:** 24.13.1 (ABI 137)

## Results

| Module | Rebuild | Status | Notes |
|--------|---------|--------|-------|
| better-sqlite3 | `@electron/rebuild --version 40.6.0` | OK | Rebuilt for Electron ABI 143. Correctly fails on system Node (ABI mismatch = proof of correct rebuild). |
| sodium-native | `@electron/rebuild --version 40.6.0` | OK | Uses prebuild-install, loads on both system Node and Electron. |

## Verification

- `electron-rebuild --version 40.6.0` completes without errors
- better-sqlite3 `.node` binary targets NODE_MODULE_VERSION 143 (Electron 40)
- sodium-native loads and reports correct key sizes (PUBLICKEYBYTES=32, SECRETKEYBYTES=64)

## Fallback Plan (if rebuild fails on other systems)

Per 01-RESEARCH.md Pitfall 1:

| Module | Fallback | Tradeoff |
|--------|----------|----------|
| sodium-native | libsodium-wrappers (WASM) | ~3x slower Argon2id, no native rebuild needed |
| better-sqlite3 | sql.js (WASM SQLite) | Slower, async API instead of sync |

## Rebuild Command

```bash
# From client/ directory
npx electron-rebuild --version $(node -e "console.log(require('electron/package.json').version)")
```

**Important:** Must specify `--version` with the Electron version, not rely on auto-detection (which may pick up system Node version instead).
