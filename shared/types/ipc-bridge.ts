/**
 * IPC Bridge type definitions for UNITED Electron client.
 *
 * Defines the complete window.united API surface exposed by the preload script
 * via contextBridge.exposeInMainWorld(). All renderer-to-main communication
 * goes through these typed methods.
 *
 * Security: No raw ipcRenderer access. Each method maps to a specific
 * ipcMain.handle handler. See 01-RESEARCH.md Pattern 3.
 */

import type { ConnectionStatus } from './ws-protocol';

// ============================================================
// Identity types
// ============================================================

export interface IdentityCreateResult {
  /** Base32-encoded fingerprint (UNITED-XXXXX-XXXXX-XXXXX-XXXXX) */
  fingerprint: string;
  /** Ed25519 public key (32 bytes) */
  publicKey: Uint8Array;
  /** BIP39 24-word mnemonic (the raw key encoded as words) */
  mnemonic: string[];
}

export interface IdentityUnlockResult {
  /** Base32-encoded fingerprint */
  fingerprint: string;
  /** Ed25519 public key (32 bytes) */
  publicKey: Uint8Array;
}

// ============================================================
// Auth types
// ============================================================

export interface ConnectResult {
  /** Whether connection was successful */
  connected: boolean;
  /** Server info received on connection */
  serverInfo: {
    name: string;
    description: string;
    iconData?: Uint8Array;
    registrationMode: 'open' | 'invite_only';
    version: string;
  };
}

export interface RegisterResult {
  /** Server-assigned user ID */
  userId: string;
  /** JWT access token */
  accessToken: string;
  /** JWT refresh token */
  refreshToken: string;
  /** Whether this user is the server owner (first registered) */
  isOwner: boolean;
}

// ============================================================
// TOTP types
// ============================================================

export interface TotpEnrollResult {
  /** TOTP secret (base32-encoded) */
  secret: string;
  /** otpauth:// URI for authenticator apps — QR generated client-side via qrcode.react */
  otpauthUri: string;
}

// ============================================================
// Server types
// ============================================================

export interface ServerInfo {
  name: string;
  description: string;
  iconData?: Uint8Array;
  registrationMode: 'open' | 'invite_only';
  version: string;
}

export interface ServerSettings {
  name?: string;
  description?: string;
  iconData?: Uint8Array;
  registrationMode?: 'open' | 'invite_only';
}

// ============================================================
// Channel & Category types
// ============================================================

export interface ChannelResponse {
  id: string;
  name: string;
  channel_type: string;
  category_id: string;
  position: number;
  topic: string | null;
}

export interface CategoryResponse {
  id: string;
  name: string;
  position: number;
}

export interface CategoryWithChannelsResponse {
  category: CategoryResponse;
  channels: ChannelResponse[];
}

export interface ChannelListResponse {
  categories: CategoryWithChannelsResponse[];
}

// ============================================================
// Role types
// ============================================================

export interface RoleResponse {
  id: string;
  name: string;
  permissions: number;
  color: string | null;
  is_default: boolean;
}

export interface MemberResponse {
  id: string;
  display_name: string;
  is_owner: boolean;
  pubkey: string;
  role_ids: string[];
}

// ============================================================
// Invite types
// ============================================================

export interface JoinResult {
  serverUrl: string;
  channels: ChannelListResponse;
  roles: RoleResponse[];
}

export interface InviteValidateResult {
  valid: boolean;
  serverName?: string;
}

// ============================================================
// Push event types
// ============================================================

export interface ChannelEvent {
  type: 'created' | 'updated' | 'deleted' | 'reordered';
  channel?: ChannelResponse;
  category?: CategoryResponse;
  id?: string;
}

export interface RoleEvent {
  type: 'created' | 'updated' | 'deleted' | 'assigned' | 'removed';
  role?: RoleResponse;
  userId?: string;
  roleId?: string;
}

// ============================================================
// Chat types
// ============================================================

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_pubkey: string;
  sender_display_name: string;
  content: string;
  timestamp: string;
  server_sequence: number;
  reply_to_id: string | null;
  reply_to_preview: string | null;
  edited_at: string | null;
  reactions: ReactionSummary[];
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  user_pubkeys: string[];
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  has_more: boolean;
}

export interface ChatEvent {
  type: 'new' | 'edited' | 'deleted' | 'reaction-added' | 'reaction-removed' | 'navigate';
  message?: ChatMessage;
  messageId?: string;
  channelId?: string;
  newContent?: string;
  editTimestamp?: string;
  userPubkey?: string;
  emoji?: string;
}

export interface PresenceUpdate {
  userPubkey: string;
  displayName: string;
  status: 'online' | 'away' | 'dnd' | 'offline';
}

export interface TypingEvent {
  channelId: string;
  userId: string;
  displayName: string;
}

export interface NotificationPrefs {
  muted: boolean;
  notifyAll: boolean;
}

// ============================================================
// P2P types
// ============================================================

export interface P2PPeerInfo {
  unitedId: string;
  peerId: string;
  multiaddrs: string[];
  channels: string[];
  natType: 'public' | 'private' | 'unknown';
  latencyMs?: number;
  connectionType?: 'direct' | 'relayed';
}

export interface P2PTopicStats {
  topic: string;
  messageCount: number;
  lastReceived?: number;
}

export interface P2PStats {
  peers: P2PPeerInfo[];
  topics: P2PTopicStats[];
  natType: string;
  isConnected: boolean;
  serverPeerId: string;
}

// ============================================================
// Storage types (renderer-side mirrors of SQLite row shapes)
// ============================================================

export interface CachedServerInfo {
  id: string;
  url: string;
  name: string;
  description: string;
  registrationMode: string;
  displayName: string | null;
  userId: string | null;
}

export interface CachedChannel {
  id: string;
  serverId: string;
  name: string;
  category: string | null;
  position: number;
}

export interface StorageAPI {
  /** Check whether a local identity exists in SQLite */
  hasIdentity(): Promise<boolean>;
  /** Get the active server (last connected), or null */
  getActiveServer(): Promise<CachedServerInfo | null>;
  /** Get channels for a given server ID */
  getChannels(serverId: string): Promise<CachedChannel[]>;
  /** Get a cached state value by key */
  getCachedState<T>(key: string): Promise<T | null>;
  /** Set a cached state value by key */
  setCachedState(key: string, value: unknown): Promise<void>;
}

// ============================================================
// Main API interface
// ============================================================

/**
 * The complete IPC API surface exposed as window.united.
 *
 * All methods return Promises (backed by ipcRenderer.invoke).
 * Push events use callback registration with cleanup functions.
 */
export interface UnitedAPI {
  // ---- Identity ----

  /**
   * Create a new Ed25519 identity protected by passphrase.
   * Generates keypair, encrypts with Argon2id-derived key, creates mnemonic.
   * @param passphrase - User-chosen passphrase (12+ characters)
   */
  createIdentity(passphrase: string): Promise<IdentityCreateResult>;

  /**
   * Recover identity from BIP39 mnemonic words.
   * Uses mnemonicToEntropy (NOT mnemonicToSeed) to get original 32-byte seed.
   * See 01-RESEARCH.md Pitfall 3.
   * @param words - 24-word BIP39 mnemonic
   * @param passphrase - New passphrase for re-encryption
   */
  recoverFromMnemonic(words: string[], passphrase: string): Promise<IdentityCreateResult>;

  /**
   * Unlock a stored identity with passphrase.
   * Derives key via Argon2id, decrypts private key, holds in memory for session.
   * @param passphrase - User's passphrase
   */
  unlockIdentity(passphrase: string): Promise<IdentityUnlockResult>;

  // ---- Connection & Auth ----

  /**
   * Connect to a coordination server.
   * Validates URL, establishes WebSocket, retrieves server info.
   * @param url - Server URL (e.g., "https://server.example.com:1984")
   */
  connectToServer(url: string): Promise<ConnectResult>;

  /**
   * Register identity on the connected server.
   * Sends public key + display name + encrypted blob.
   * @param displayName - Server-local display name (unique per server)
   * @param setupToken - Optional admin bootstrap token
   */
  register(displayName: string, setupToken?: string): Promise<RegisterResult>;

  /**
   * Sign a challenge with the unlocked identity's private key.
   * Used in challenge-response authentication flow.
   * @param challenge - Challenge bytes from server
   */
  signChallenge(challenge: Uint8Array): Promise<Uint8Array>;

  // ---- TOTP ----

  /**
   * Begin TOTP enrollment for the current server.
   * Returns secret, URI, and QR code for authenticator app setup.
   */
  enrollTotp(): Promise<TotpEnrollResult>;

  /**
   * Verify a TOTP code to complete enrollment or authenticate.
   * @param code - 6-digit TOTP code from authenticator app
   */
  verifyTotp(code: string): Promise<boolean>;

  // ---- Server ----

  /**
   * Get current server information.
   */
  getServerInfo(): Promise<ServerInfo>;

  /**
   * Update server settings (admin-only).
   * @param settings - Partial settings to update
   */
  updateServerSettings(settings: ServerSettings): Promise<ServerInfo>;

  // ---- Channels ----

  /** Channel CRUD operations (all go through main process IPC) */
  channels: {
    fetch(): Promise<ChannelListResponse>;
    create(name: string, channelType: string, categoryId: string): Promise<ChannelResponse>;
    update(id: string, name: string): Promise<ChannelResponse>;
    delete(id: string): Promise<void>;
    reorder(channels: Array<{ id: string; position: number }>): Promise<void>;
  };

  // ---- Categories ----

  /** Category CRUD operations */
  categories: {
    create(name: string): Promise<CategoryResponse>;
    update(id: string, name: string): Promise<CategoryResponse>;
    delete(id: string): Promise<void>;
    reorder(categories: Array<{ id: string; position: number }>): Promise<void>;
  };

  // ---- Members ----

  /** Member listing operations */
  members: {
    fetch(): Promise<MemberResponse[]>;
  };

  // ---- Roles ----

  /** Role CRUD and assignment operations */
  roles: {
    fetch(): Promise<RoleResponse[]>;
    create(name: string, permissions: number, color?: string): Promise<RoleResponse>;
    update(id: string, name?: string, permissions?: number, color?: string): Promise<RoleResponse>;
    delete(id: string): Promise<void>;
    assign(userId: string, roleId: string): Promise<void>;
    remove(userId: string, roleId: string): Promise<void>;
    getUserRoles(userId: string): Promise<RoleResponse[]>;
  };

  // ---- Invites ----

  /** Invite join and validation operations */
  invite: {
    /** Validate an invite code against a server */
    validateInvite(serverUrl: string, inviteCode: string): Promise<InviteValidateResult>;
    /** Join a server via invite code (fetches channels/roles after auth) */
    joinViaInvite(serverUrl: string, inviteCode: string): Promise<JoinResult>;
  };

  // ---- Chat ----

  /** Chat message operations (all go through main process IPC) */
  chat: {
    /** Send a message to a channel */
    send(channelId: string, content: string, replyToId?: string): Promise<ChatMessage>;
    /** Fetch paginated message history */
    fetchHistory(channelId: string, beforeSequence?: number, limit?: number): Promise<ChatHistoryResponse>;
    /** Edit one of your own messages */
    edit(channelId: string, messageId: string, content: string): Promise<ChatMessage>;
    /** Delete one of your own messages */
    delete(channelId: string, messageId: string): Promise<void>;
  };

  // ---- Reactions ----

  /** Emoji reaction operations */
  reactions: {
    add(messageId: string, emoji: string): Promise<void>;
    remove(messageId: string, emoji: string): Promise<void>;
    fetch(messageId: string): Promise<ReactionSummary[]>;
  };

  // ---- Presence ----

  /** Presence status operations */
  presence: {
    set(status: 'online' | 'away' | 'dnd' | 'offline'): Promise<void>;
  };

  // ---- Last Read ----

  /** Last-read tracking for unread indicators */
  lastRead: {
    update(channelId: string, lastSequence: number): Promise<void>;
    fetch(channelId: string): Promise<{ last_sequence: number }>;
  };

  // ---- Notifications ----

  /** Notification preference and display operations */
  notifications: {
    setPrefs(channelId: string, prefs: NotificationPrefs): Promise<void>;
    show(opts: { title: string; body: string; channelId: string; serverName?: string }): Promise<void>;
  };

  // ---- Device Provisioning (SEC-12) ----

  /** Device provisioning for local keypair transfer via QR + TCP */
  provisioning: {
    /**
     * Start provisioning session on existing device.
     * Generates ephemeral X25519 keypair, starts TCP server.
     * @returns QR payload JSON string with local IP, port, and ephemeral public key
     */
    startProvisioning: () => Promise<{ qrPayload: string }>

    /**
     * Cancel an active provisioning session.
     * Closes TCP server and destroys ephemeral keys.
     */
    cancelProvisioning: () => Promise<void>

    /**
     * Receive identity from existing device (new device side).
     * Connects to sender via TCP, performs X25519 key exchange, receives encrypted keypair.
     * @param qrPayload - QR payload string from existing device
     * @returns Fingerprint of the received identity
     */
    receiveProvisioning: (qrPayload: string) => Promise<{ fingerprint: string }>
  }

  // ---- P2P ----

  /** P2P mesh control and monitoring */
  p2p: {
    /** Start the P2P mesh (connects to server, subscribes to channels, discovers peers) */
    startMesh(): Promise<{ peerId: string }>;
    /** Stop the P2P mesh */
    stopMesh(): Promise<void>;
    /** Send a test gossipsub message to a topic */
    sendTestMessage(topic: string, text: string): Promise<void>;
    /** Ping a peer and return RTT */
    pingPeer(peerId: string): Promise<{ rttMs: number }>;
    /** Force disconnect and reconnect to all peers */
    forceReconnect(): Promise<void>;
    /** Get current P2P stats snapshot */
    getStats(): Promise<P2PStats>;
    /** Subscribe to P2P stats updates (returns cleanup function) */
    onStatsUpdate(callback: (stats: P2PStats) => void): () => void;
    /** Notify main process that dev panel is open */
    openPanel(): void;
    /** Notify main process that dev panel is closed */
    closePanel(): void;
  };

  // ---- Storage ----

  /** Local SQLite storage access for cache hydration */
  storage: StorageAPI;

  // ---- Push events (main -> renderer) ----

  /**
   * Subscribe to connection status changes.
   * @returns Cleanup function to unsubscribe
   */
  onConnectionStatus(callback: (status: ConnectionStatus) => void): () => void;

  /**
   * Subscribe to authentication errors (WS close codes).
   * @param callback - Receives close code and human-readable message
   * @returns Cleanup function to unsubscribe
   */
  onAuthError(callback: (code: number, message: string) => void): () => void;

  /**
   * Subscribe to server info updates (e.g., admin changed settings).
   * @returns Cleanup function to unsubscribe
   */
  onServerInfoUpdate(callback: (info: ServerInfo) => void): () => void;

  /**
   * Subscribe to channel events (created, updated, deleted, reordered).
   * @returns Cleanup function to unsubscribe
   */
  onChannelEvent(callback: (event: ChannelEvent) => void): () => void;

  /**
   * Subscribe to role events (created, updated, deleted, assigned, removed).
   * @returns Cleanup function to unsubscribe
   */
  onRoleEvent(callback: (event: RoleEvent) => void): () => void;

  /**
   * Subscribe to deep link invite events (united:// protocol handler).
   * @param callback - Receives the invite code and optional server URL
   * @returns Cleanup function to unsubscribe
   */
  onDeepLinkInvite(callback: (inviteCode: string, serverUrl?: string) => void): () => void;

  /**
   * Subscribe to chat events (new message, edit, delete, reactions).
   * @returns Cleanup function to unsubscribe
   */
  onChatEvent(callback: (event: ChatEvent) => void): () => void;

  /**
   * Subscribe to typing indicator events.
   * @returns Cleanup function to unsubscribe
   */
  onTypingEvent(callback: (event: TypingEvent) => void): () => void;

  /**
   * Subscribe to presence update events.
   * @returns Cleanup function to unsubscribe
   */
  onPresenceEvent(callback: (event: PresenceUpdate) => void): () => void;
}

// ============================================================
// Global type declaration
// ============================================================

declare global {
  interface Window {
    /** UNITED IPC bridge - exposed by preload script via contextBridge */
    united: UnitedAPI;
  }
}
