/**
 * WebSocket protocol type definitions for UNITED.
 *
 * All WebSocket messages use protobuf binary encoding (Envelope type).
 * These TypeScript types provide additional type safety on top of
 * the generated protobuf types.
 */

// ============================================================
// WebSocket close codes
// Custom close codes per RFC 6455 (4000-4999 range)
// See 01-CONTEXT.md and 01-CONTEXT-CLIENT.md decisions
// ============================================================

export const WS_CLOSE_CODES = {
  /** Token expired - client should silently refresh and reconnect */
  TOKEN_EXPIRED: 4001,
  /** Token invalid - client should redirect to login */
  TOKEN_INVALID: 4002,
  /** User banned - client should show full-screen ban message */
  BANNED: 4003,
  /** Server shutting down - client should reconnect with backoff */
  SERVER_SHUTDOWN: 4004,
  /** Rate limited - client should back off */
  RATE_LIMITED: 4005,
  /** Protocol error - malformed message */
  PROTOCOL_ERROR: 4006,
} as const;

export type WsCloseCode = (typeof WS_CLOSE_CODES)[keyof typeof WS_CLOSE_CODES];

// ============================================================
// WebSocket message types (union of all payload types)
// Maps to the oneof payload in ws.proto Envelope
// ============================================================

export type WsPayloadType =
  // Auth
  | 'challenge_request'
  | 'challenge_response'
  | 'verify_request'
  | 'verify_response'
  // Server info
  | 'server_info_request'
  | 'server_info_response'
  // Identity blob
  | 'store_blob_request'
  | 'store_blob_response'
  | 'get_blob_request'
  | 'get_blob_response'
  // Key rotation
  | 'rotate_key_request'
  | 'rotate_key_response'
  | 'cancel_rotation_request'
  | 'cancel_rotation_response'
  // Error
  | 'error';

// ============================================================
// Connection state
// ============================================================

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

/** Reconnection configuration */
export interface ReconnectConfig {
  /** Base delay in milliseconds (default: 1000) */
  baseDelay: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelay: number;
  /** Maximum number of reconnection attempts (default: Infinity) */
  maxAttempts: number;
}

/** Default reconnection config per CONTEXT-CLIENT.md */
export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  baseDelay: 1000,
  maxDelay: 30000,
  maxAttempts: Infinity,
};

/**
 * Calculate reconnection delay with jitter.
 * Uses exponential backoff with random jitter to prevent thundering herd.
 * See 01-RESEARCH.md Pitfall 6.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Reconnection configuration
 * @returns Delay in milliseconds
 */
export function calculateReconnectDelay(
  attempt: number,
  config: ReconnectConfig = DEFAULT_RECONNECT_CONFIG
): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  // Add random jitter (0 to baseDelay) to prevent thundering herd
  const jitter = Math.random() * config.baseDelay;
  return cappedDelay + jitter;
}
