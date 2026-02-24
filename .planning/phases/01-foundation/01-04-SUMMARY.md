---
phase: 01-foundation
plan: 04
subsystem: client
tags: [electron, sqlite, websocket, ipc, preload]

# Dependency graph
requires: [01-01]
provides:
  - "SQLite schema with versioned migrations (local_identity, servers, channels, cached_state)"
  - "Typed query functions for all tables"
  - "WebSocket client with exponential backoff and close code handling"
  - "IPC handler stubs with mock data for all UnitedAPI channels"
  - "Main process entry with BrowserWindow, CSP, and handler registration"
  - "Preload bridge exposing typed window.united API via contextBridge"
  - "@shared path alias across all three build targets (main, preload, renderer)"
affects: [01-05, 01-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [electron-vite externalizeDepsPlugin, @shared path alias, IPC channel constants, WAL journal mode, contextBridge sandbox]

key-files:
  created:
    - client/src/main/db/schema.ts
    - client/src/main/db/queries.ts
    - client/src/main/ws/client.ts
    - client/src/main/ws/protocol.ts
    - client/src/main/ipc/channels.ts
    - client/src/main/ipc/auth.ts
    - client/src/main/ipc/crypto.ts
    - client/src/main/ipc/storage.ts
    - client/src/main/ipc/connection.ts
  modified:
    - client/src/main/index.ts
    - client/src/preload/index.ts
    - client/electron.vite.config.ts
    - client/tsconfig.main.json
    - client/tsconfig.preload.json
---

## What was built

Electron infrastructure for the UNITED client: SQLite database with versioned migrations and typed queries, WebSocket client with exponential backoff reconnection and auth close code handling (4001/4002/4003), IPC handler stubs returning mock data for all UnitedAPI methods, main process entry with BrowserWindow configuration and CSP headers, and a secure preload bridge exposing the typed window.united API via contextBridge.

## Self-Check: PASSED

All tasks completed. Build passes, typecheck clean, app launches.
