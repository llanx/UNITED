# Phase 1: Foundation - Research

**Researched:** 2026-02-23
**Domain:** Rust coordination server (tokio/axum), Electron/React client, Ed25519 identity, JWT auth, protobuf IPC
**Confidence:** HIGH (server stack) / HIGH (client stack) / MEDIUM (cross-boundary integration)

## Summary

Phase 1 establishes two parallel codebases — a Rust coordination server and an Electron/React desktop client — connected by protobuf-encoded WebSocket messages and shared REST API contracts. The server provides Ed25519 challenge-response authentication, JWT session management, TOTP 2FA, identity blob storage, key rotation records, and server settings. The client provides identity creation (keypair + mnemonic), passphrase-protected local storage, auth UI, a Discord-style triple-column layout, instant cached loading, and a secure IPC bridge between Electron's main and renderer processes.

Both tracks use mature, well-maintained libraries with no experimental dependencies. The Rust ecosystem around axum 0.8 + tokio is production-stable. The Electron 40 + React + Vite stack is standard. The main integration risk is native module rebuilds for Electron (sodium-native, better-sqlite3) and ensuring protobuf serialization compatibility between prost (Rust) and @bufbuild/protobuf (TypeScript).

**Primary recommendation:** Pin all dependency versions from day one. Validate native module rebuilds and protobuf round-trip serialization as the very first tasks before writing any application logic.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions — Server (Dev A / matts)

- First identity to authenticate on a fresh server becomes admin (via setup token printed to console on first boot)
- JWT strategy: 15-minute access token + 7-day refresh token. Client auto-refreshes silently.
- Passphrase policy: 12-character minimum enforced by client. Server never sees or stores passphrases.
- Registration mode: Configurable toggle between open and invite-only. Default open. Admin can change via API at runtime.
- Rate limiting: Basic IP-based rate limiting on challenge-response auth endpoint (e.g., 5 attempts per minute per IP)
- Sessions: Multiple active sessions allowed. Each device has its own refresh token. No single-session enforcement.
- Display name: Required at identity registration. Unique per server.
- Message encoding: Protobuf binary from day 1 (prost for Rust, @bufbuild/protobuf for TypeScript). No JSON.
- WebSocket auth failure close codes: 4001=token expired, 4002=token invalid, 4003=banned
- Config file: `./united.toml` default, `--config <path>` override, env var override (`UNITED_PORT=8080`). Precedence: CLI > env > config > defaults.
- No auto-generate config on boot. `united-server --generate-config` outputs commented TOML template.
- Default port: 1984. Bind: 0.0.0.0.
- Logging: Human-readable default, `--json-logs` for structured JSON.
- Docker: Multi-stage Dockerfile ships with Phase 1.
- Admin bootstrap: Setup token on first boot. Owner tier above admin. `united-server reset-admin` for recovery.
- TOTP enrollment: Prompted during admin setup, skippable. Persistent warning until enrolled.
- Encrypted blob access: Public by fingerprint with rate limiting.
- Key rotation: Immediate switch. Old key can only cancel within 72 hours.
- TOTP secret: Encrypted with server-side key in database.
- Rotation chain: Full chain persisted (genesis + all rotations).

### Locked Decisions — Client (Dev B / benzybones)

- First launch: Centered welcome screen with "Create new identity" and "Recover existing identity"
- Identity creation and server connection are separate steps. Identity exists before any server.
- Registration flow: Create identity (passphrase) -> display 24-word mnemonic -> verify mnemonic -> done. Then separately: join server.
- Mnemonic display: All 24 words shown in grid. Mandatory verification: select correct words at 3 random positions.
- Passphrase entry: Two fields (enter + confirm). 12-character minimum. No strength meter.
- Returning user: Passphrase only. App remembers identity and last server.
- Recovery flow: Enter 24 mnemonic words -> recover keypair locally -> connect to server -> download blob -> restore.
- TOTP 2FA enrollment: Optional, dismissible. Show once after account creation.
- Server URL: Inline format validation + connection test on "Connect" click. Loading state button.
- Discord-style triple column: Server rail | Channel sidebar | Main content
- Dark mode default. Light mode in settings.
- Loading: Cached state from local SQLite for returning users. Skeleton shimmer for first launch. No spinner ever.
- Server rail always visible even with single server.
- Default #general channel auto-created by server. Selected by default.
- Main content: Welcome message when #general selected with no messages.
- User settings: Display name, avatar placeholder, passphrase change, TOTP enrollment, logout.
- Server icon: First letter of each word, max 3 chars, colored circle from name hash.
- Admin dropdown: Click server name -> dropdown with "Server Settings" for admins.
- Server Settings panel: Name, icon upload, description, registration mode toggle.
- WebSocket status: Always-visible colored dot (green/yellow/red).
- Reconnection: Exponential backoff (1s-30s cap) + manual retry button.
- Error handling severity-based: inline for form errors, silent for auto-fixable, redirect for session loss, full-screen for bans.
- WebSocket close code mapping: 4001 -> silent refresh, 4002 -> redirect to login, 4003 -> full-screen ban message.

### Claude's Discretion — Server

- WebSocket heartbeat/keepalive strategy
- Actor-per-connection pattern details (reader/writer tokio tasks, mpsc channels)
- Exact WebSocket close code assignments beyond 4001/4002/4003
- Argon2id parameters for server-side operations
- JWT signing key management
- SQLite schema details and migration strategy
- Exact rate limiting implementation (tower middleware, in-memory counters, etc.)
- Docker base image choice and caching strategy

### Claude's Discretion — Client

- Electron security configuration details (CSP rules, contextIsolation setup, preload script structure)
- IPC bridge typed API design (channel names, request-response patterns, push event patterns)
- Zustand store slice architecture (auth, connection, server, channels, settings, UI)
- Local SQLite schema design and migration strategy
- React component architecture and folder structure
- Keyboard shortcuts and accessibility patterns
- CSS/styling approach (CSS modules, Tailwind, styled-components, etc.)
- Exact skeleton shimmer component implementation
- JWT storage mechanism (Electron safeStorage details)
- Virtualized list scaffolding setup
- Local HTTP content server skeleton implementation

### Deferred Ideas (OUT OF SCOPE)

None — both discussions stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-01 | User creates Ed25519 keypair identity protected by passphrase (Argon2id), 24-word mnemonic backup, no email/password on server | **Server:** ed25519-dalek 2.2.0 for key verification, argon2 0.5.3 for server-side operations, aes-gcm for blob encryption. **Client:** sodium-native for Ed25519 keygen + Argon2id + AES-256-GCM, @scure/bip39 for mnemonic generation. See Standard Stack. |
| SEC-02 | User authenticates via Ed25519 challenge-response, server issues JWT (15min access + 7-day refresh) | **Server:** ed25519-dalek for signature verification, jsonwebtoken 10.3.0 for JWT issuance. Challenge-response pattern documented in Code Examples. **Client:** sodium-native for signing, JWT storage via Electron safeStorage API. |
| SEC-08 | Electron renderer uses strict CSP, content sanitization, contextIsolation, nodeIntegration disabled | electron-vite default config enables contextIsolation. CSP must be configured manually — see Pitfalls for Vite inline script issues. Preload script via contextBridge exposes minimal API. |
| SEC-09 | Encrypted identity blob stored on every joined server, recoverable with passphrase | **Server:** SQLite `identity_blobs` table stores AES-256-GCM encrypted blobs keyed by fingerprint. GET endpoint with rate limiting. **Client:** Encrypts blob locally before upload, decrypts on recovery. |
| SEC-10 | TOTP 2FA enabled by default (RFC 6238), admin-configurable | **Server:** totp-rs 5.7.0 for TOTP generation/verification. TOTP secret encrypted with server key in SQLite. **Client:** otpauth 9.4.1 for TOTP URI generation + qrcode.react 4.2.0 for QR display. |
| SEC-11 | Key rotation via signed rotation records, 72-hour cancellation window | **Server:** Rotation chain stored in SQLite. Dual-signature verification (old + new key). Time-window enforcement. **Client:** Generates new keypair, signs rotation record with both keys, broadcasts to all servers. |
| SEC-12 | Device provisioning via QR code (direct encrypted key transfer) | **Client-side only in Phase 1:** X25519 key exchange via sodium-native, QR code via qrcode.react. Ephemeral channel over local network or server relay. Server provides relay endpoint. |
| APP-01 | App shell loads from local cache, instant DOM swap routing, no full page reload | electron-vite builds optimized bundle. Local SQLite caches last-known state. HashRouter or MemoryRouter for SPA routing. Zustand stores hydrated from SQLite on launch. |
| SRVR-07 | Server admin can configure server name, icon, description | **Server:** `server_settings` SQLite table. REST API `GET/PUT /api/server/info`. Admin-only authorization via JWT role claim. **Client:** Server Settings panel with form fields, API calls on save. |
</phase_requirements>

## Standard Stack

### Server Core (Rust — Dev A / matts)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tokio | 1.x (latest) | Async runtime | The Rust async runtime. Used by axum, tungstenite, and every async crate in this stack. |
| axum | 0.8.8 | HTTP + WebSocket framework | Built by the Tokio team. Tower middleware ecosystem. WebSocket support via built-in extractors. |
| rusqlite | 0.38.0 | SQLite access | Synchronous SQLite bindings. Appropriate for single-server coordination (no connection pool needed). |
| rusqlite_migration | 2.4.0 | Schema migrations | Uses SQLite `user_version` pragma — no migration table. Fast compilation, no macros. |
| ed25519-dalek | 2.2.0 | Ed25519 sign/verify | Pure Rust, constant-time, zeroize on drop. Stable 2.x API. |
| argon2 | 0.5.3 | Argon2id key derivation | RustCrypto project. Pure Rust. Supports Argon2id variant for server-side blob verification. |
| aes-gcm | 0.10.x | AES-256-GCM encryption | RustCrypto project. Audited by NCC Group. Hardware acceleration on x86. |
| jsonwebtoken | 10.3.0 | JWT issuance/validation | Most-used Rust JWT crate. Supports HS256 (suitable for single-server). |
| totp-rs | 5.7.0 | TOTP generation/verification | RFC 6238 compliant. QR URI generation. Configurable algorithm, digits, period. |
| prost | 0.14.1 | Protobuf codegen (Rust) | Tokio project. Generates idiomatic Rust from .proto files via build.rs. |
| prost-build | 0.14.x | Protobuf build-time codegen | Companion to prost. Requires system `protoc`. |
| clap | 4.x | CLI argument parsing | Derive macro API. Env var fallback via `#[arg(env = "...")]`. |
| figment | 0.10.x | Hierarchical config | Merges defaults + TOML file + env vars + CLI. Used by Rocket. Serde integration. |
| serde + serde_json | 1.x | Serialization | Universal Rust serialization. Used by figment, jsonwebtoken, rusqlite. |
| toml | 0.8.x | TOML parsing | For `united.toml` config file reading. |
| tracing + tracing-subscriber | 0.1.x / 0.3.x | Structured logging | Tokio ecosystem standard. Supports pretty-print and JSON output. |
| rand | 0.9.x | CSPRNG | OS entropy source. Nonce generation, challenge bytes, setup tokens. |
| tower-governor | latest | Rate limiting | Governor-based Tower middleware. IP-based rate limiting for auth endpoints. |
| uuid | 1.x | UUID generation | UUIDv7 for time-sortable IDs. |

### Client Core (TypeScript/Electron — Dev B / benzybones)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 40.x | Desktop runtime | Latest stable. Chromium 144, Node 24.11.1. |
| electron-vite | latest | Build tooling | First-class Electron support. Separate configs for main/preload/renderer. Hot reload. |
| @electron/rebuild | latest | Native module rebuild | Rebuilds native addons against Electron's Node headers. Required for sodium-native, better-sqlite3. |
| react | 19.x | UI framework | Project decision. |
| react-dom | 19.x | DOM rendering | Paired with React. |
| sodium-native | latest | Ed25519, X25519, Argon2id, AES-256-GCM | Native libsodium bindings. Single library for all client crypto. Needs Electron rebuild. |
| @scure/bip39 | 2.0.1 | BIP39 mnemonic generation | Audited by Ethereum Foundation. Minimal dependencies. Signed releases. Prefer over `bip39` npm package. |
| better-sqlite3 | 12.6.2 | Local SQLite | Synchronous, fast. Needs Electron rebuild + asar unpack. |
| zustand | 5.0.8 | State management | Minimal API, no Provider wrapper, slices pattern for modularity. |
| @tanstack/react-virtual | 3.13.18 | Virtualized lists | Headless virtualizer. Required for message list scaffolding. |
| @bufbuild/protobuf | 2.11.0 | Protobuf runtime (TypeScript) | Full conformance. Generates TypeScript from .proto files. |
| @bufbuild/protoc-gen-es | 2.11.0 | Protobuf codegen plugin | Generates `_pb.ts` files from `.proto` input. |
| otpauth | 9.4.1 | TOTP URI generation | RFC 6238. Generates otpauth:// URIs for authenticator apps. |
| qrcode.react | 4.2.0 | QR code rendering | SVG-based QR codes for TOTP enrollment and device provisioning. |
| electron-store | latest | Persistent key-value storage | Config persistence. Combined with safeStorage for sensitive data. |

### Shared

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| protobuf (protoc) | 3.x+ | Schema compiler | Required by both prost-build and @bufbuild/protoc-gen-es. |
| .proto definitions | N/A | Shared contract | `shared/proto/auth.proto` etc. Single source of truth for wire format. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| rusqlite | sqlx | sqlx is async but adds compile-time query checking complexity. Rusqlite is simpler for single-server SQLite. |
| figment | config-rs | config-rs is popular but figment has better error messages and Serde integration. |
| jsonwebtoken | jwt-compact | jwt-compact has explicit EdDSA support, but jsonwebtoken is more widely used. HS256 is fine for single-server. |
| tower-governor | axum_gcra | axum_gcra uses GCRA algorithm which is theoretically better, but tower-governor is more established. |
| @scure/bip39 | bip39 (npm) | bip39 npm is older, larger, less audited. @scure/bip39 is audited, minimal, signed. |
| better-sqlite3 | sql.js (WASM) | sql.js avoids native rebuild issues but is slower. Keep as fallback if native rebuild fails. |
| sodium-native | libsodium-wrappers (WASM) | WASM avoids native rebuild but is ~3x slower for Argon2id. Keep as fallback. |
| zustand | Redux Toolkit | RTK is more established but zustand is simpler, faster, no boilerplate. Project decision is zustand. |
| HashRouter | MemoryRouter | MemoryRouter is cleaner but HashRouter allows Electron main process to control navigation. |

### Installation

**Server (Cargo.toml dependencies):**
```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
axum = { version = "0.8", features = ["ws"] }
rusqlite = { version = "0.38", features = ["bundled"] }
rusqlite_migration = "2.4"
ed25519-dalek = { version = "2.2", features = ["rand_core"] }
argon2 = "0.5"
aes-gcm = "0.10"
jsonwebtoken = "10.3"
totp-rs = { version = "5.7", features = ["qr", "gen_secret"] }
prost = "0.14"
clap = { version = "4", features = ["derive", "env"] }
figment = { version = "0.10", features = ["toml", "env"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["json", "env-filter"] }
rand = "0.9"
tower-governor = "0.6"
uuid = { version = "1", features = ["v7"] }

[build-dependencies]
prost-build = "0.14"
```

**Client (package.json core dependencies):**
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.8",
    "@tanstack/react-virtual": "^3.13.18",
    "@bufbuild/protobuf": "^2.11.0",
    "@scure/bip39": "^2.0.1",
    "otpauth": "^9.4.1",
    "qrcode.react": "^4.2.0",
    "better-sqlite3": "^12.6.2",
    "sodium-native": "^4.0.0",
    "electron-store": "^10.0.0"
  },
  "devDependencies": {
    "electron": "^40.0.0",
    "electron-vite": "latest",
    "@electron/rebuild": "latest",
    "@bufbuild/protoc-gen-es": "^2.11.0",
    "typescript": "^5.7.0"
  }
}
```

## Architecture Patterns

### Recommended Project Structure

```
UNITED/
├── server/                          # Rust coordination server (matts)
│   ├── Cargo.toml
│   ├── build.rs                     # prost-build protobuf codegen
│   ├── Dockerfile
│   ├── src/
│   │   ├── main.rs                  # Entry: CLI parsing, config loading, server start
│   │   ├── config.rs                # Figment config: TOML + env + CLI merging
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── migrations.rs        # rusqlite_migration definitions
│   │   │   └── models.rs            # Row types for users, settings, blobs, rotations
│   │   ├── auth/
│   │   │   ├── mod.rs
│   │   │   ├── challenge.rs         # Challenge-response flow
│   │   │   ├── jwt.rs               # Token issuance, validation, refresh
│   │   │   ├── totp.rs              # TOTP enrollment, verification
│   │   │   └── middleware.rs        # Axum extractor for JWT claims
│   │   ├── identity/
│   │   │   ├── mod.rs
│   │   │   ├── blob.rs              # Encrypted blob storage/retrieval
│   │   │   ├── rotation.rs          # Key rotation chain management
│   │   │   └── registration.rs      # New identity registration
│   │   ├── admin/
│   │   │   ├── mod.rs
│   │   │   ├── setup.rs             # First-boot setup token, owner establishment
│   │   │   └── settings.rs          # Server name/icon/description CRUD
│   │   ├── ws/
│   │   │   ├── mod.rs
│   │   │   ├── handler.rs           # WebSocket upgrade + actor spawn
│   │   │   ├── actor.rs             # Per-connection reader/writer tasks
│   │   │   └── protocol.rs          # Protobuf message dispatch
│   │   ├── routes.rs                # Axum router assembly
│   │   └── proto/                   # Generated prost types (build.rs output)
│   │       └── united.rs
│   └── tests/
│       ├── auth_test.rs
│       └── ws_test.rs
├── client/                          # Electron + React (benzybones)
│   ├── package.json
│   ├── electron.vite.config.ts
│   ├── src/
│   │   ├── main/                    # Electron main process
│   │   │   ├── index.ts             # App lifecycle, BrowserWindow creation
│   │   │   ├── ipc/                 # IPC handlers
│   │   │   │   ├── auth.ts          # Identity creation, signing, challenge-response
│   │   │   │   ├── crypto.ts        # Keypair ops, mnemonic, passphrase
│   │   │   │   ├── storage.ts       # SQLite read/write, safeStorage
│   │   │   │   └── connection.ts    # WebSocket management
│   │   │   ├── db/
│   │   │   │   ├── schema.ts        # SQLite schema + migrations
│   │   │   │   └── queries.ts       # Typed query functions
│   │   │   └── ws/
│   │   │       ├── client.ts        # WebSocket client + reconnect
│   │   │       └── protocol.ts      # Protobuf encode/decode
│   │   ├── preload/
│   │   │   └── index.ts             # contextBridge.exposeInMainWorld('united', {...})
│   │   └── renderer/                # React app
│   │       ├── index.html
│   │       ├── src/
│   │       │   ├── App.tsx           # Router + layout shell
│   │       │   ├── stores/           # Zustand slices
│   │       │   │   ├── auth.ts
│   │       │   │   ├── connection.ts
│   │       │   │   ├── server.ts
│   │       │   │   ├── channels.ts
│   │       │   │   ├── settings.ts
│   │       │   │   └── ui.ts
│   │       │   ├── pages/
│   │       │   │   ├── Welcome.tsx   # First-launch / login screen
│   │       │   │   ├── CreateIdentity.tsx
│   │       │   │   ├── RecoverIdentity.tsx
│   │       │   │   ├── JoinServer.tsx
│   │       │   │   └── Main.tsx      # Triple-column layout
│   │       │   ├── components/
│   │       │   │   ├── ServerRail.tsx
│   │       │   │   ├── ChannelSidebar.tsx
│   │       │   │   ├── MainContent.tsx
│   │       │   │   ├── ConnectionDot.tsx
│   │       │   │   ├── ServerIcon.tsx
│   │       │   │   ├── MnemonicGrid.tsx
│   │       │   │   ├── MnemonicVerify.tsx
│   │       │   │   ├── TotpEnrollment.tsx
│   │       │   │   ├── ServerSettings.tsx
│   │       │   │   └── SkeletonShimmer.tsx
│   │       │   └── hooks/
│   │       │       ├── useAuth.ts
│   │       │       ├── useConnection.ts
│   │       │       └── useServer.ts
│   │       └── styles/
├── shared/                          # Jointly owned
│   ├── proto/
│   │   ├── auth.proto               # Challenge/Verify/Refresh/Register messages
│   │   ├── identity.proto           # IdentityBlob, RotationRecord, GenesisRecord
│   │   ├── server.proto             # ServerInfo, ServerSettings
│   │   └── ws.proto                 # WebSocket envelope, close codes
│   └── types/
│       ├── api.ts                   # REST endpoint request/response types
│       ├── ws-protocol.ts           # WebSocket message union type
│       └── ipc-bridge.ts            # window.united API type definitions
└── tests/
    └── integration/
        └── auth-e2e.ts              # Cross-boundary auth test
```

### Pattern 1: Actor-Per-Connection (Server WebSocket)

**What:** Each WebSocket connection spawns two tokio tasks — a reader and a writer — connected by an mpsc channel. The writer task owns the WebSocket sender half. Other parts of the system send messages to the client by cloning the mpsc sender.

**When to use:** Every WebSocket connection in the server.

**Why:** WebSocket `send()` requires `&mut self`. You cannot share a mutable reference across tasks. The mpsc pattern gives you a cloneable sender that any task can use to push messages to the client.

**Example:**
```rust
// Source: axum WebSocket examples + tokio patterns
use axum::extract::ws::{WebSocket, Message};
use tokio::sync::mpsc;

async fn handle_connection(ws: WebSocket, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Writer task: forwards mpsc messages to WebSocket
    let writer = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Reader task: processes incoming WebSocket messages
    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Binary(data) => {
                // Decode protobuf, dispatch to handler
                // Handler can use tx.clone() to send responses
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    writer.abort();
    // Clean up connection state
}
```

### Pattern 2: Figment Hierarchical Config (Server)

**What:** Layer configuration from multiple sources with clear precedence: built-in defaults < TOML file < env vars < CLI args.

**When to use:** Server startup configuration.

**Example:**
```rust
// Source: figment docs + clap derive pattern
use figment::{Figment, providers::{Serialized, Toml, Env, Format}};
use clap::Parser;
use serde::{Deserialize, Serialize};

#[derive(Parser, Serialize, Deserialize, Clone)]
struct Config {
    #[arg(long, env = "UNITED_PORT", default_value = "1984")]
    port: u16,

    #[arg(long, env = "UNITED_BIND", default_value = "0.0.0.0")]
    bind_address: String,

    #[arg(long, default_value = "./united.toml")]
    config: String,

    #[arg(long)]
    json_logs: bool,

    #[arg(long)]
    generate_config: bool,
}

fn load_config() -> Result<Config, figment::Error> {
    let cli = Config::parse();
    let config_path = cli.config.clone();

    Figment::new()
        .merge(Serialized::defaults(Config::default()))
        .merge(Toml::file(&config_path))
        .merge(Env::prefixed("UNITED_"))
        .merge(Serialized::defaults(cli))  // CLI overrides all
        .extract()
}
```

### Pattern 3: Secure IPC Bridge (Client)

**What:** Expose a minimal, typed API from Electron main process to renderer via contextBridge. No raw ipcRenderer access. Each method maps to a specific ipcMain.handle handler.

**When to use:** All communication between renderer (React) and main process (Node.js/Electron).

**Example:**
```typescript
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Identity
  createIdentity: (passphrase: string) =>
    ipcRenderer.invoke('identity:create', passphrase),
  recoverFromMnemonic: (words: string[], passphrase: string) =>
    ipcRenderer.invoke('identity:recover-mnemonic', words, passphrase),
  unlockIdentity: (passphrase: string) =>
    ipcRenderer.invoke('identity:unlock', passphrase),

  // Auth
  connectToServer: (url: string) =>
    ipcRenderer.invoke('auth:connect', url),
  register: (displayName: string) =>
    ipcRenderer.invoke('auth:register', displayName),
  signChallenge: (challenge: Uint8Array) =>
    ipcRenderer.invoke('auth:sign-challenge', challenge),

  // TOTP
  enrollTotp: () => ipcRenderer.invoke('totp:enroll'),
  verifyTotp: (code: string) => ipcRenderer.invoke('totp:verify', code),

  // Server
  getServerInfo: () => ipcRenderer.invoke('server:info'),
  updateServerSettings: (settings: ServerSettings) =>
    ipcRenderer.invoke('server:update-settings', settings),

  // Push events from main -> renderer
  onConnectionStatus: (cb: (status: string) => void) => {
    const listener = (_: any, status: string) => cb(status);
    ipcRenderer.on('connection:status', listener);
    return () => ipcRenderer.removeListener('connection:status', listener);
  },
  onAuthError: (cb: (code: number, message: string) => void) => {
    const listener = (_: any, code: number, msg: string) => cb(code, msg);
    ipcRenderer.on('auth:error', listener);
    return () => ipcRenderer.removeListener('auth:error', listener);
  },
};

contextBridge.exposeInMainWorld('united', api);

// Type declaration for renderer
// shared/types/ipc-bridge.ts
export interface UnitedAPI {
  createIdentity(passphrase: string): Promise<{ fingerprint: string; publicKey: Uint8Array; mnemonic: string[] }>;
  // ... etc
}

declare global {
  interface Window {
    united: UnitedAPI;
  }
}
```

### Pattern 4: Zustand Slice Composition (Client)

**What:** Split state into domain-specific slices, compose into a single store. Each slice manages its own state and actions.

**When to use:** All client-side state management.

**Example:**
```typescript
// stores/auth.ts
import { StateCreator } from 'zustand';

export interface AuthSlice {
  isUnlocked: boolean;
  fingerprint: string | null;
  publicKey: Uint8Array | null;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
}

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
  isUnlocked: false,
  fingerprint: null,
  publicKey: null,
  unlock: async (passphrase) => {
    const result = await window.united.unlockIdentity(passphrase);
    set({ isUnlocked: true, fingerprint: result.fingerprint, publicKey: result.publicKey });
  },
  lock: () => set({ isUnlocked: false, fingerprint: null, publicKey: null }),
});

// stores/index.ts — compose slices
import { create } from 'zustand';
import { createAuthSlice, AuthSlice } from './auth';
import { createConnectionSlice, ConnectionSlice } from './connection';

type Store = AuthSlice & ConnectionSlice; // & ServerSlice & ...

export const useStore = create<Store>()((...a) => ({
  ...createAuthSlice(...a),
  ...createConnectionSlice(...a),
}));
```

### Anti-Patterns to Avoid

- **Exposing raw ipcRenderer to renderer:** Security vulnerability. Always use contextBridge with specific method wrappers.
- **Storing JWT in localStorage/sessionStorage:** Accessible to any script in the renderer. Use Electron safeStorage API in main process instead.
- **Sharing WebSocket sender across tasks without mpsc:** Leads to `&mut self` borrow conflicts. Always use the mpsc channel pattern.
- **Synchronous SQLite calls blocking the Electron renderer:** All SQLite access must go through IPC to the main process. Never import better-sqlite3 in the renderer.
- **Hand-rolling protobuf serialization:** Always generate from .proto files. Manual encoding will drift between Rust and TypeScript.
- **Using BrowserRouter in Electron:** Fails with file:// protocol. Use HashRouter or MemoryRouter.
- **Putting middleware on individual Zustand slices:** Apply middleware (like persist) only on the composed store, not individual slices.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BIP39 mnemonic encoding | Custom word list or entropy mapping | @scure/bip39 | BIP39 has checksum bits, specific word list requirements, and subtle entropy mapping. Audited implementation required for security. |
| Argon2id key derivation | Custom KDF | argon2 crate (server) / sodium-native (client) | Side-channel attacks, memory-hardness tuning, timing attacks. Use battle-tested implementations. |
| JWT creation/validation | Custom token format | jsonwebtoken (Rust) / manual decode in client | Token format, expiry checking, signature verification, clock skew handling. Libraries handle edge cases. |
| TOTP generation/verification | Custom OTP | totp-rs (server) / otpauth (client) | Time drift handling, code reuse prevention, algorithm compat with authenticator apps. |
| Protobuf encode/decode | Custom binary protocol | prost + @bufbuild/protobuf | Schema evolution, backward compatibility, cross-language compat. Protobuf is explicitly the locked decision. |
| Config precedence merging | Custom config loader | figment | Edge cases in type coercion, env var naming, nested config, error messages. |
| Rate limiting | In-memory counter HashMap | tower-governor | Token bucket/GCRA algorithms handle burst patterns. IP extraction from headers (X-Forwarded-For) has gotchas. |
| Ed25519 key operations | Custom crypto | ed25519-dalek / sodium-native | Constant-time operations, proper nonce generation, zeroization. Never hand-roll crypto. |
| SQLite migrations | Manual ALTER TABLE | rusqlite_migration / custom versioned migration runner | Migration ordering, rollback safety, version tracking. |
| Exponential backoff | Custom retry loop | Built-in with jitter | Without jitter, all disconnected clients reconnect simultaneously (thundering herd). |

**Key insight:** Every item in this list has subtle edge cases that cause security vulnerabilities, data corruption, or production outages when hand-rolled. The libraries exist because smart people got burned by the edge cases.

## Common Pitfalls

### Pitfall 1: Native Module Rebuild Failure (Client — CRITICAL)

**What goes wrong:** sodium-native and better-sqlite3 are compiled against system Node.js headers. Electron uses its own V8/Node version (Node 24.11.1 in Electron 40). The module crashes at runtime with `NODE_MODULE_VERSION` mismatch.

**Why it happens:** Electron bundles its own Node.js, which has a different ABI version than the system Node.js.

**How to avoid:** Run `@electron/rebuild` as a postinstall script. Test immediately on a clean install. Configure `asarUnpack` for native `.node` files in electron-builder config.

**Warning signs:** `Module was compiled against a different Node.js version` error. App crashes on launch.

**Fallback plan:** If sodium-native fails, fall back to `libsodium-wrappers` (WASM, ~3x slower for Argon2id but no native dependency). If better-sqlite3 fails, fall back to `sql.js` (WASM SQLite).

### Pitfall 2: CSP Blocks Vite Inline Scripts (Client)

**What goes wrong:** Vite inlines small JS/CSS by default. A strict CSP with no `unsafe-inline` blocks these inlined assets, causing a blank white screen.

**Why it happens:** Vite's `assetsInlineLimit` defaults to a non-zero value, inlining assets below that threshold.

**How to avoid:** Set `assetsInlineLimit: 0` in Vite config. Use nonce-based CSP where possible. Test CSP in production builds, not just dev mode (dev mode uses different asset loading).

**Warning signs:** App works in dev but shows blank screen in production build. Console shows `Refused to execute inline script` errors.

### Pitfall 3: BIP39 Entropy-to-Mnemonic Is Not Reversible via mnemonicToSeed (Client)

**What goes wrong:** Developer uses `mnemonicToSeed()` to recover the key and gets a 512-bit PBKDF2 output instead of the original 256-bit entropy.

**Why it happens:** BIP39 has two paths: `entropyToMnemonic()` / `mnemonicToEntropy()` (lossless round-trip of raw bytes) and `mnemonicToSeed()` (one-way PBKDF2 derivation for HD wallets). UNITED needs the former, not the latter.

**How to avoid:** For recovery, use `mnemonicToEntropy()` to get back the original 32 bytes (the Ed25519 private key seed). Never use `mnemonicToSeed()` — that's for BIP32 HD wallet derivation, not raw key recovery.

**Warning signs:** Recovered key doesn't match original. Key is 64 bytes instead of 32.

### Pitfall 4: JWT HS256 Key Must Be Cryptographically Random (Server)

**What goes wrong:** Developer uses a human-readable string as the HMAC secret. Attacker brute-forces the secret and can forge tokens.

**Why it happens:** HS256 security depends entirely on secret strength. Unlike RSA/EdDSA, there's no mathematical hardness — just the secret's entropy.

**How to avoid:** Generate a 256-bit random key on first server boot. Store it in the server's data directory (not in the config file). Regenerate on admin reset. Use `rand::thread_rng().gen::<[u8; 32]>()`.

**Warning signs:** JWT secret is a readable string in a config file. Secret is shorter than 32 bytes.

### Pitfall 5: WebSocket Connection Leak (Server)

**What goes wrong:** Client disconnects abruptly (network loss, process kill). Server reader task hangs on `ws_receiver.next()`, and the connection entry in the connection registry is never cleaned up. Memory grows over time.

**Why it happens:** TCP FIN may never arrive. WebSocket ping/pong timeout is not configured.

**How to avoid:** Implement server-side WebSocket ping at a fixed interval (e.g., every 30 seconds). If pong is not received within 10 seconds, close the connection and clean up. Use `tokio::select!` with a timeout in the reader loop.

**Warning signs:** Server memory grows steadily over days. Connection count in registry exceeds active client count.

### Pitfall 6: Thundering Herd on Server Restart (Client)

**What goes wrong:** Server restarts. All connected clients detect disconnect simultaneously and immediately attempt to reconnect. Server is overwhelmed before it finishes booting.

**Why it happens:** Exponential backoff without jitter means all clients use the same retry schedule.

**How to avoid:** Add random jitter to the backoff interval. E.g., `delay = base * 2^attempt + random(0, base)`. The client context already specifies exponential backoff (1s, 2s, 4s, 8s, 16s, capped at 30s) — add jitter on top.

**Warning signs:** Server crashes immediately after restart with connection spike.

### Pitfall 7: Protobuf Field Number Collision (Shared)

**What goes wrong:** Both developers independently add fields to the same `.proto` message with the same field number. Deserialization produces corrupt data silently.

**Why it happens:** Protobuf identifies fields by number, not name. Two fields with the same number are silently merged during decode.

**How to avoid:** Shared proto changes go through the `shared/contracts` branch with mutual review. Reserve field number ranges per developer if working on the same message. Use `buf lint` to catch issues.

**Warning signs:** Protobuf decode produces unexpected values. Fields contain data from the wrong field.

### Pitfall 8: Argon2id Parameter Mismatch Between Client and Server (Cross-Boundary)

**What goes wrong:** Client encrypts identity blob with Argon2id(m=256MB, t=3, p=4). Server tries to verify or re-derive with different parameters. Decryption fails.

**Why it happens:** Argon2id parameters must match exactly. Client and server use different libraries (sodium-native vs argon2 crate) which may have different defaults.

**How to avoid:** Store Argon2id parameters alongside the encrypted blob. The blob format should include: `{ salt, m_cost, t_cost, p_cost, nonce, ciphertext }`. Both sides read parameters from the blob, never assume defaults.

**Warning signs:** Recovery from a different client version fails. "Decryption failed" errors during identity blob recovery.

## Code Examples

### Challenge-Response Authentication Flow (Server)

```rust
// Source: IDENTITY-ARCHITECTURE.md + ed25519-dalek docs
use ed25519_dalek::{VerifyingKey, Signature, Verifier};
use rand::Rng;

// POST /api/auth/challenge
async fn issue_challenge(
    State(state): State<AppState>,
) -> Json<ChallengeResponse> {
    let challenge: [u8; 32] = rand::thread_rng().gen();
    let challenge_id = Uuid::now_v7();

    // Store challenge with expiry (e.g., 60 seconds)
    state.challenges.insert(challenge_id, Challenge {
        bytes: challenge,
        expires_at: Utc::now() + Duration::seconds(60),
    });

    Json(ChallengeResponse {
        challenge_id: challenge_id.to_string(),
        challenge: challenge.to_vec(),
    })
}

// POST /api/auth/verify
async fn verify_challenge(
    State(state): State<AppState>,
    Json(req): Json<VerifyRequest>,
) -> Result<Json<AuthTokens>, StatusCode> {
    // Retrieve and consume the challenge
    let challenge = state.challenges.remove(&req.challenge_id)
        .ok_or(StatusCode::BAD_REQUEST)?;

    if challenge.expires_at < Utc::now() {
        return Err(StatusCode::GONE);
    }

    // Verify Ed25519 signature
    let public_key_bytes: [u8; 32] = req.public_key.try_into()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let verifying_key = VerifyingKey::from_bytes(&public_key_bytes)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let signature = Signature::from_bytes(&req.signature.try_into()
        .map_err(|_| StatusCode::BAD_REQUEST)?);

    verifying_key.verify(&challenge.bytes, &signature)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Issue JWT
    let access_token = issue_access_token(&state, &req.fingerprint)?;
    let refresh_token = issue_refresh_token(&state, &req.fingerprint)?;

    Ok(Json(AuthTokens { access_token, refresh_token }))
}
```

### Identity Creation (Client Main Process)

```typescript
// Source: sodium-native docs + @scure/bip39 docs
import sodium from 'sodium-native';
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

interface IdentityResult {
  fingerprint: string;
  publicKey: Buffer;
  mnemonic: string[];
}

function createIdentity(passphrase: string): IdentityResult {
  // 1. Generate Ed25519 keypair
  const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
  const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
  sodium.crypto_sign_keypair(publicKey, secretKey);

  // 2. Extract 32-byte seed from secret key (first 32 bytes)
  const seed = secretKey.subarray(0, 32);

  // 3. Generate BIP39 mnemonic from seed bytes
  const mnemonic = entropyToMnemonic(seed, wordlist).split(' ');

  // 4. Derive encryption key from passphrase via Argon2id
  const salt = Buffer.alloc(16);
  sodium.randombytes_buf(salt);
  const derivedKey = Buffer.alloc(32);
  sodium.crypto_pwhash(
    derivedKey, Buffer.from(passphrase),
    salt,
    3,                                          // t_cost (ops limit)
    256 * 1024 * 1024,                          // m_cost (256 MB)
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  // 5. Encrypt secret key with AES-256-GCM
  const nonce = Buffer.alloc(sodium.crypto_aead_aes256gcm_NPUBBYTES);
  sodium.randombytes_buf(nonce);
  const encrypted = Buffer.alloc(secretKey.length + sodium.crypto_aead_aes256gcm_ABYTES);
  sodium.crypto_aead_aes256gcm_encrypt(encrypted, secretKey, null, null, nonce, derivedKey);

  // 6. Compute fingerprint: SHA-256(publicKey), truncated to 20 bytes
  const hash = Buffer.alloc(32);
  sodium.crypto_hash_sha256(hash, publicKey);
  const fingerprint = hash.subarray(0, 20);

  // 7. Zero sensitive data
  sodium.sodium_memzero(secretKey);
  sodium.sodium_memzero(derivedKey);
  sodium.sodium_memzero(seed);

  // 8. Store to disk
  // { fingerprint, publicKey, salt, nonce, encrypted, argon2_params: { m: 256MB, t: 3, p: 4 } }

  return {
    fingerprint: formatFingerprint(fingerprint),
    publicKey,
    mnemonic,
  };
}

// Recovery from mnemonic
function recoverFromMnemonic(words: string[], newPassphrase: string): IdentityResult {
  const mnemonicStr = words.join(' ');
  const seed = Buffer.from(mnemonicToEntropy(mnemonicStr, wordlist)); // Returns original 32 bytes

  // Reconstruct keypair from seed
  const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
  const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
  sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed);

  // Re-encrypt with new passphrase (same flow as createIdentity step 4-8)
  // ...
}
```

### WebSocket Protobuf Envelope (Shared)

```protobuf
// shared/proto/ws.proto
syntax = "proto3";
package united.ws;

message Envelope {
  string request_id = 1;    // Client-generated, echoed in response
  oneof payload {
    // Auth
    ChallengeRequest challenge_request = 10;
    ChallengeResponse challenge_response = 11;
    AuthResult auth_result = 12;

    // Server
    ServerInfoRequest server_info_request = 20;
    ServerInfoResponse server_info_response = 21;

    // Identity
    BlobStoreRequest blob_store_request = 30;
    BlobStoreResponse blob_store_response = 31;

    // Errors
    ErrorResponse error = 99;
  }
}

message ErrorResponse {
  uint32 code = 1;
  string message = 2;
}
```

### SQLite Schema (Server)

```sql
-- Server-side schema (rusqlite_migration)
-- Migration 1: Initial schema

CREATE TABLE users (
    id TEXT PRIMARY KEY,           -- UUIDv7
    public_key BLOB NOT NULL,      -- 32 bytes, current active key
    fingerprint TEXT NOT NULL UNIQUE, -- Base32-encoded, from genesis record
    display_name TEXT NOT NULL,
    roles INTEGER NOT NULL DEFAULT 0, -- Bitfield
    is_owner BOOLEAN NOT NULL DEFAULT FALSE,
    totp_secret_encrypted BLOB,    -- AES-256-GCM encrypted with server key
    totp_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,       -- ISO 8601
    updated_at TEXT NOT NULL
);

CREATE TABLE identity_blobs (
    fingerprint TEXT PRIMARY KEY,
    encrypted_blob BLOB NOT NULL,  -- Client-encrypted, server cannot decrypt
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE rotation_records (
    id TEXT PRIMARY KEY,           -- UUIDv7
    fingerprint TEXT NOT NULL,     -- Links to user identity
    record_type TEXT NOT NULL,     -- 'genesis' or 'rotation'
    prev_key BLOB,                 -- NULL for genesis
    new_key BLOB NOT NULL,
    reason TEXT,                   -- 'compromise', 'scheduled', 'device_loss'
    signature_old BLOB,            -- NULL for genesis
    signature_new BLOB NOT NULL,
    cancellation_deadline TEXT,    -- NULL for genesis, ISO 8601 for rotations
    cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    FOREIGN KEY (fingerprint) REFERENCES users(fingerprint)
);

CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash, not plaintext
    device_info TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE server_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Initial settings: 'name', 'description', 'icon_data', 'registration_mode', 'setup_complete'

CREATE TABLE challenges (
    id TEXT PRIMARY KEY,
    challenge_bytes BLOB NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX idx_rotation_fingerprint ON rotation_records(fingerprint);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

### Electron BrowserWindow Security Config (Client)

```typescript
// main/index.ts
import { BrowserWindow } from 'electron';
import path from 'path';

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 940,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,       // REQUIRED: isolate preload from renderer
      nodeIntegration: false,        // REQUIRED: no Node.js in renderer
      sandbox: true,                 // REQUIRED: OS-level sandboxing
      webSecurity: true,             // REQUIRED: enforce same-origin
      allowRunningInsecureContent: false,
      // CSP set via session.defaultSession.webRequest
    },
    backgroundColor: '#1a1a2e',      // Dark mode default, prevents white flash
    show: false,                      // Show after ready-to-show for instant feel
  });

  // Set strict CSP
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +  // Required for some CSS-in-JS
          "img-src 'self' data: blob:; " +
          "connect-src 'self' ws: wss:; " +
          "font-src 'self'; " +
          "object-src 'none'; " +
          "base-uri 'self'"
        ]
      }
    });
  });

  win.once('ready-to-show', () => win.show());
  return win;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `#[async_trait]` in axum handlers | Native `impl Future` in traits (Rust 1.75+) | axum 0.8 (Jan 2025) | Remove async_trait dependency from handler traits |
| axum path params `/:id` | axum path params `/{id}` | axum 0.8 (Jan 2025) | Update all route definitions to use curly braces |
| `Option<T>` extractor auto-working | `OptionalFromRequestParts` trait required | axum 0.8 (Jan 2025) | Custom extractors may need trait impl update |
| electron-rebuild (npm) | @electron/rebuild (scoped) | 2023 | Use scoped package name in scripts |
| keytar for secret storage | Electron safeStorage API | Electron 15+ | No external dependency for OS-level encryption |
| bip39 (npm, bitcoinjs) | @scure/bip39 (audited, minimal) | 2022 | Smaller, audited, signed releases |
| @bufbuild/protobuf v1 | @bufbuild/protobuf v2 | 2024 | Full Protobuf Editions support, better TypeScript types |
| Zustand v4 | Zustand v5 | 2024 | Cleaner TypeScript types, React 19 compatibility |

**Deprecated/outdated:**
- `electron-rebuild` (unscoped): Replaced by `@electron/rebuild`
- `keytar`: Replaced by Electron's built-in safeStorage API
- axum `/:param` syntax: Must use `/{param}` in axum 0.8+
- `#[async_trait]` on axum handlers: No longer needed with Rust 1.75+ trait syntax

## Open Questions

1. **JWT signing algorithm: HS256 or EdDSA?**
   - What we know: HS256 is simpler for a single-server deployment (shared secret, no key pair needed). EdDSA is the modern best practice and aligns with the project's Ed25519 identity system. The `jsonwebtoken` crate supports HS256 natively; EdDSA support is less documented.
   - What's unclear: Whether the added complexity of EdDSA JWT signing is justified when the server is the only signer and verifier.
   - **Recommendation:** Use HS256 for v1. The JWT secret never leaves the server. HS256 is simpler, faster, and well-supported. EdDSA JWTs would matter if external services needed to verify tokens (not the case here). Generate a 256-bit random secret on first boot, store it alongside the SQLite database.

2. **Argon2id parameters for server-side TOTP secret encryption**
   - What we know: The client uses Argon2id with m=256MB, t=3, p=4 for passphrase-derived key (per IDENTITY-ARCHITECTURE.md). The server needs to encrypt TOTP secrets with a server-side key, but Argon2id is for password hashing, not key wrapping.
   - What's unclear: Whether to use Argon2id or a simpler KDF for the server-side encryption key.
   - **Recommendation:** For server-side TOTP secret encryption, generate a random 256-bit AES key on first boot (same pattern as JWT secret). Use AES-256-GCM directly with this key. No need for Argon2id on the server side — Argon2id is for deriving keys from low-entropy passwords, not for wrapping secrets with a random key.

3. **CSS/styling approach for the client**
   - What we know: The project needs a dark-mode-first theme with Discord-style layout. Options include Tailwind CSS, CSS Modules, or styled-components.
   - What's unclear: Developer preference and build integration with electron-vite.
   - **Recommendation:** Tailwind CSS is the pragmatic choice — it works with Vite out of the box, supports dark mode natively (`dark:` prefix), has Discord-like UI utility classes, and avoids runtime CSS-in-JS overhead. However, this is Claude's discretion per the context doc.

4. **`unsafe-inline` in CSP for styles**
   - What we know: A fully strict CSP blocks inline styles. Some React patterns (style attributes, CSS-in-JS) require `unsafe-inline` for styles.
   - What's unclear: Whether the chosen CSS approach will require `style-src 'unsafe-inline'`.
   - **Recommendation:** If using Tailwind (class-based), `unsafe-inline` for styles may not be needed. If using CSS-in-JS, it likely is. Test the chosen approach with strict CSP early in development. `style-src 'unsafe-inline'` is a much lower risk than `script-src 'unsafe-inline'` — the security-critical constraint is on scripts.

## Sources

### Primary (HIGH confidence)
- [axum 0.8.0 release announcement](https://tokio.rs/blog/2025-01-01-announcing-axum-0-8-0) — axum 0.8 breaking changes
- [axum GitHub releases](https://github.com/tokio-rs/axum/releases) — axum 0.8.8 current
- [ed25519-dalek on crates.io](https://crates.io/crates/ed25519-dalek) — version 2.2.0
- [jsonwebtoken on crates.io](https://crates.io/crates/jsonwebtoken) — version 10.3.0
- [totp-rs on crates.io](https://crates.io/crates/totp-rs) — version 5.7.0
- [argon2 on crates.io](https://crates.io/crates/argon2) — version 0.5.3
- [aes-gcm on crates.io](https://crates.io/crates/aes-gcm) — audited by NCC Group
- [prost on crates.io](https://crates.io/crates/prost) — version 0.14.1
- [rusqlite on crates.io](https://crates.io/crates/rusqlite) — version 0.38.0
- [rusqlite_migration on crates.io](https://crates.io/crates/rusqlite_migration) — version 2.4.0
- [Electron 40 release](https://progosling.com/en/dev-digest/2026-01/electron-40-release-chromium-144-node-24) — Chromium 144, Node 24.11.1
- [Electron security docs](https://www.electronjs.org/docs/latest/tutorial/security) — contextIsolation, CSP
- [Electron safeStorage docs](https://www.electronjs.org/docs/latest/api/safe-storage) — OS-level encryption API
- [electron-vite docs](https://electron-vite.org/guide/dev) — project structure, conventions
- [@bufbuild/protobuf npm](https://www.npmjs.com/package/@bufbuild/protobuf) — version 2.11.0
- [@scure/bip39 GitHub](https://github.com/paulmillr/scure-bip39) — version 2.0.1, audited
- [zustand GitHub](https://github.com/pmndrs/zustand) — version 5.0.8
- [@tanstack/react-virtual npm](https://www.npmjs.com/package/@tanstack/react-virtual) — version 3.13.18
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) — version 12.6.2
- [otpauth npm](https://www.npmjs.com/package/otpauth) — version 9.4.1
- [qrcode.react npm](https://www.npmjs.com/package/qrcode.react) — version 4.2.0
- [figment docs](https://docs.rs/figment/latest/figment/) — version 0.10
- [tower-governor GitHub](https://github.com/benwis/tower-governor) — IP-based rate limiting

### Secondary (MEDIUM confidence)
- [cargo-chef Docker caching](https://www.lpalmieri.com/posts/fast-rust-docker-builds/) — Rust Docker build optimization
- [axum WebSocket discussion #1159](https://github.com/tokio-rs/axum/discussions/1159) — mpsc channel pattern for concurrent writes
- [Vite CSP issue #16749](https://github.com/vitejs/vite/issues/16749) — inline script blocking with strict CSP
- [react-router Electron discussion](https://github.com/remix-run/react-router/discussions/10724) — HashRouter vs BrowserRouter
- [HMAC vs RSA vs ECDSA for JWT](https://workos.com/blog/hmac-vs-rsa-vs-ecdsa-which-algorithm-should-you-use-to-sign-jwts) — algorithm selection guidance

### Tertiary (LOW confidence)
- None — all findings verified with at least official docs or multiple sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All versions verified on crates.io/npm, official docs reviewed
- Architecture: HIGH — Patterns from official examples (axum WebSocket, electron-vite, zustand slices)
- Pitfalls: HIGH — Native rebuild issues, CSP issues, BIP39 entropy confusion all well-documented
- Cross-boundary: MEDIUM — Protobuf round-trip between prost and @bufbuild/protobuf needs validation testing before assumptions are confirmed

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (30 days — stable ecosystem, no rapid-moving dependencies)
