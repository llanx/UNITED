# Phase 1: Foundation (Client) - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning
**Developer:** benzybones (Dev B) — Electron/React client

<domain>
## Phase Boundary

Electron/React desktop application foundation for UNITED. Users can create an Ed25519 keypair identity, authenticate to a coordination server via challenge-response, and see a working desktop app that loads instantly from cache on subsequent launches. Client handles identity creation/recovery, passphrase encryption, WebSocket connection management, IPC bridge between Electron main and renderer, local SQLite storage, and React app shell with Discord-style layout. The Rust coordination server is built separately by matts (Dev A) — this context covers benzybones' (Dev B) client-side work only.

**Requirements:** SEC-01, SEC-02, SEC-08, APP-01, SRVR-07 (client-facing aspects)
**Identity Architecture:** See IDENTITY-ARCHITECTURE.md for full design
**Parallel Dev Guide:** See PARALLEL-DEV.md for shared contracts and monorepo structure

</domain>

<decisions>
## Implementation Decisions

### Identity Creation & Auth UX
- First launch shows a centered welcome screen with two clear paths: "Create new identity" and "Recover existing identity"
- Identity creation and server connection are separate steps. Identity is created locally first (self-sovereign — exists before any server knows about it). "Join a server" is a distinct second step.
- Registration flow: Create identity (passphrase entry) → display 24-word mnemonic → verify mnemonic → done. Then separately: join a server.
- Mnemonic display: All 24 words shown at once in a grid. Mandatory verification step follows — user must select the correct words at 3 random positions before proceeding.
- Passphrase entry: Two fields (enter + confirm). 12-character minimum enforced. No strength meter.
- Returning user login: Passphrase only — app remembers the identity and last server. A "Connect to different server" link is available but not the primary path.
- Recovery flow: Enter 24 mnemonic words first (recover keypair locally), then connect to server to download identity blob and restore.
- TOTP 2FA enrollment: Optional and dismissible. Show once after account creation, user can dismiss permanently. Lowest friction approach.
- Server URL entry: Inline format validation (catches malformed URLs instantly) + full connection test when "Connect" button is clicked. Button shows loading state ("Connecting..."), then success or error.

### App Shell Layout & First Impression
- Discord-style triple column layout: Server rail (left) | Channel sidebar | Main content area
- Dark mode by default. Light mode available in settings.
- Loading strategy: Returning users see instant cached state from local SQLite (last-known channels, server info). First launch only shows skeleton shimmer until first server response. No spinner anywhere, ever.
- Branding: Welcome/login screen has UNITED logo and tagline. Once inside the app, minimal branding — the server identity takes over.
- Server rail: Always visible, even with a single server. Shows server icon. Establishes the pattern for multi-server later.
- Default channel: Server auto-creates a #general text channel on first boot. Client shows it in sidebar, selected by default. No channel creation/editing UI until Phase 2.
- Main content area (Phase 1): When #general is selected with no messages (chat is Phase 4), show a welcome message from the server — server name, description, "Welcome to [server]."
- User settings: Basic settings panel accessible via gear icon. Includes: display name change, avatar upload placeholder, passphrase change, TOTP enrollment, logout.

### Server Info & Admin Display
- Server name displayed as header above channel list in the sidebar. Server icon (or letter fallback) shown in the left server rail.
- Default server icon (no custom upload): First letter of each word in server name, max 3 characters. "Apple" → A, "Apple Juice" → AJ, "My Cool Server" → MCS. Displayed in a colored circle (color derived from server name hash).
- Admin access: Click server name in sidebar header → dropdown menu. Admins see "Server Settings" option. Non-admins see the dropdown with fewer options. Pattern extends naturally in Phase 2.
- Server Settings panel (admin-only): Editable fields are server name, icon upload, description, and registration mode toggle (open/invite-only). Registration toggle included because server already supports it via API.

### Connection & Error States
- WebSocket status: Always-visible small colored dot (green = connected, yellow = reconnecting, red = disconnected). Persistent ambient awareness.
- Server unreachable: Show cached content in read-only mode. Disable all actions. Banner/dot indicates server is unreachable.
- Reconnection: Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, 16s, capped at 30s) + manual "Retry now" button that resets backoff and attempts immediately.
- Auth error handling (severity-based):
  - Recoverable form errors (wrong passphrase, invalid display name): Red inline text under the field
  - Silent fixes (token refresh): Invisible to user. Only surface if auto-fix fails.
  - Session-ending (refresh failed, session revoked): Redirect to login screen with explanation
  - Account-level (banned): Full-screen message with details
- WebSocket close code mapping (severity-based):
  - 4001 (expired): Silent refresh attempt. Only show "Session expired — please sign in again" if refresh also fails.
  - 4002 (invalid): Redirect to login with "Your session is no longer valid. Please sign in again."
  - 4003 (banned): Full-screen: "You've been removed from this server by an admin." with option to connect to a different server.

### Claude's Discretion
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

</decisions>

<specifics>
## Specific Ideas

- Discord-style triple column is the explicit reference for layout — server rail | channel sidebar | main content
- "No spinner anywhere, ever" — success criterion says instant load, skeleton shimmer is the only acceptable loading pattern
- Identity is self-sovereign: exists before any server. The UI flow must reinforce this (create identity → THEN join server, not the reverse)
- Server icon initials: first letter of each word, max 3 chars, colored circle with color from name hash
- Slack-style connection indicator was rejected in favor of always-visible status dot for ambient awareness
- Severity-based error handling throughout: inline for form errors, silent for auto-fixable, redirect for session loss, full-screen for bans

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation (client)*
*Context gathered: 2026-02-23*
