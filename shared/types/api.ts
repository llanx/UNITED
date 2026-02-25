/**
 * REST API type definitions for UNITED server endpoints.
 *
 * These types define the request/response shapes for all HTTP endpoints.
 * The actual wire format uses protobuf for WebSocket and JSON for REST.
 * Both server (Rust) and client (TypeScript) implement these contracts.
 *
 * IMPORTANT: The Rust server uses hex encoding for all binary fields
 * (hex::encode / hex::decode). All binary fields below are hex-encoded strings.
 */

// ============================================================
// Auth endpoints
// ============================================================

/** POST /api/auth/challenge — takes empty body */
export interface ChallengeRequestBody {
  // Server's /api/auth/challenge takes empty body
}

export interface ChallengeResponseBody {
  /** Server-generated unique ID for this challenge */
  challenge_id: string;
  /** Hex-encoded random 32 bytes to be signed */
  challenge_bytes: string;
}

/** POST /api/auth/verify */
export interface VerifyRequestBody {
  /** Challenge ID from ChallengeResponse */
  challenge_id: string;
  /** Hex-encoded Ed25519 public key (32 bytes) */
  public_key: string;
  /** Hex-encoded Ed25519 signature of challenge_bytes (64 bytes) */
  signature: string;
  /** Hex-encoded fingerprint for user lookup */
  fingerprint: string;
}

export interface VerifyResponseBody {
  /** JWT access token (15-minute expiry) */
  access_token: string;
  /** JWT refresh token (7-day expiry) */
  refresh_token: string;
}

/** POST /api/auth/refresh */
export interface RefreshRequestBody {
  /** Current refresh token */
  refresh_token: string;
}

export interface RefreshResponseBody {
  /** New JWT access token */
  access_token: string;
  /** New JWT refresh token (rotation) */
  refresh_token: string;
}

/** POST /api/auth/register */
export interface RegisterRequestBody {
  /** Hex-encoded Ed25519 public key (32 bytes) */
  public_key: string;
  /** Hex-encoded public key fingerprint */
  fingerprint: string;
  /** Server-local display name (unique per server) */
  display_name: string;
  /** Hex-encoded client-encrypted identity blob */
  encrypted_blob: string;
  /** Hex-encoded genesis signature (public_key signed with secret key) */
  genesis_signature: string;
  /** Optional: setup token for admin bootstrap (first user) */
  setup_token?: string;
}

export interface RegisterResponseBody {
  /** Server-assigned user ID (UUIDv7) */
  user_id: string;
  /** JWT access token */
  access_token: string;
  /** JWT refresh token */
  refresh_token: string;
  /** Whether this user is the server owner (first registered) */
  is_owner: boolean;
}

// ============================================================
// TOTP endpoints
// ============================================================

/** POST /api/auth/totp/enroll (requires auth) */
export interface TotpEnrollResponseBody {
  /** TOTP secret (base32-encoded) */
  secret: string;
  /** otpauth:// URI for authenticator apps — QR generated client-side */
  otpauth_uri: string;
}

/** POST /api/auth/totp/confirm (requires auth) — confirms enrollment */
export interface TotpConfirmRequestBody {
  /** 6-digit TOTP code from authenticator app */
  code: string;
}

export interface TotpConfirmResponseBody {
  /** Whether the code was valid and enrollment confirmed */
  valid: boolean;
}

// ============================================================
// Identity endpoints
// ============================================================

/** GET /api/identity/blob/{fingerprint} (rate-limited, no auth required) */
export interface GetBlobResponseBody {
  /** Hex-encoded encrypted identity blob */
  encrypted_blob: string;
  /** Hex-encoded Argon2id salt */
  salt: string;
  /** Hex-encoded AES-256-GCM nonce */
  nonce: string;
  /** Argon2id parameters used for key derivation */
  argon2_params: Argon2ParamsBody;
}

export interface Argon2ParamsBody {
  /** Memory cost in KiB (e.g., 262144 for 256 MB) */
  m_cost: number;
  /** Time cost / iterations (e.g., 3) */
  t_cost: number;
  /** Parallelism (e.g., 4) */
  p_cost: number;
}

/** PUT /api/identity/blob (requires auth) */
export interface PutBlobRequestBody {
  /** Hex-encoded encrypted identity blob */
  encrypted_blob: string;
  /** Hex-encoded Argon2id salt */
  salt: string;
  /** Hex-encoded AES-256-GCM nonce */
  nonce: string;
  /** Argon2id parameters */
  argon2_params: Argon2ParamsBody;
}

/** POST /api/identity/rotate (requires auth) */
export interface RotateKeyRequestBody {
  /** Hex-encoded previous public key */
  prev_key: string;
  /** Hex-encoded new public key */
  new_key: string;
  /** Reason for rotation */
  reason: 'compromise' | 'scheduled' | 'device_loss';
  /** Hex-encoded signature by old key */
  signature_old: string;
  /** Hex-encoded signature by new key */
  signature_new: string;
}

export interface RotateKeyResponseBody {
  /** Whether the rotation was accepted */
  accepted: boolean;
  /** ISO 8601 deadline for cancellation (72 hours from now) */
  cancellation_deadline: string;
}

/** POST /api/identity/rotate/cancel (requires auth with old key) */
export interface CancelRotationRequestBody {
  /** Fingerprint of the identity */
  fingerprint: string;
  /** Hex-encoded signature by the OLD key */
  signature_old_key: string;
}

export interface CancelRotationResponseBody {
  /** Whether the cancellation was accepted */
  cancelled: boolean;
}

// ============================================================
// Server endpoints
// ============================================================

/** GET /api/server/info (no auth required) */
export interface ServerInfoResponseBody {
  /** Server display name */
  name: string;
  /** Server description */
  description: string;
  /** Hex-encoded server icon PNG (optional) */
  icon_data?: string;
  /** Registration mode */
  registration_mode: 'open' | 'invite_only';
  /** Server version */
  version: string;
}

/** PUT /api/server/settings (requires admin auth) */
export interface UpdateSettingsRequestBody {
  /** Server display name */
  name?: string;
  /** Server description */
  description?: string;
  /** Hex-encoded server icon PNG */
  icon_data?: string;
  /** Registration mode */
  registration_mode?: 'open' | 'invite_only';
}

export interface UpdateSettingsResponseBody {
  /** Updated server settings */
  name: string;
  description: string;
  icon_data?: string;
  registration_mode: 'open' | 'invite_only';
}

// ============================================================
// Common types
// ============================================================

/** Standard API error response */
export interface ApiErrorResponse {
  /** HTTP-like error code */
  code: number;
  /** Human-readable error message */
  message: string;
  /** Optional field-level validation errors */
  field_errors?: Record<string, string>;
}
