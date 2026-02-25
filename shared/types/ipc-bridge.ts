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
