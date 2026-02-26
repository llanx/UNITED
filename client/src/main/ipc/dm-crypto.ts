/**
 * DM Crypto Module: E2E encryption for direct messages.
 *
 * Handles X25519 key derivation from Ed25519 identity, shared secret
 * computation (X25519 + BLAKE2b), and XChaCha20-Poly1305 encrypt/decrypt.
 * All crypto operations use sodium-native.
 */

import sodium from 'sodium-native'
import { getSessionKeys, bufToHex, hexToBuf } from './crypto'
import { getAccessToken, getServerUrl } from './auth'

// ============================================================
// HTTP helpers (main process only -- CSP blocks renderer HTTP)
// ============================================================

async function apiGet<T>(url: string, path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${url}${path}`, { method: 'GET', headers })
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`API ${path} failed (${response.status}): ${errorText}`)
  }
  return response.json() as Promise<T>
}

async function apiPost<T>(url: string, path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${url}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`API ${path} failed (${response.status}): ${errorText}`)
  }
  return response.json() as Promise<T>
}

// ============================================================
// X25519 key derivation from Ed25519 identity
// ============================================================

/**
 * Derive X25519 keypair from the session Ed25519 keypair.
 * Used for DM key exchange -- X25519 for Diffie-Hellman, Ed25519 for signing.
 */
export function deriveX25519FromEd25519(): { publicKey: Buffer; secretKey: Buffer } {
  const keys = getSessionKeys()
  if (!keys) throw new Error('Identity not unlocked -- cannot derive X25519 keys')

  const x25519Pub = Buffer.alloc(sodium.crypto_scalarmult_BYTES) // 32 bytes
  const x25519Sec = Buffer.alloc(sodium.crypto_scalarmult_SCALARBYTES) // 32 bytes

  sodium.crypto_sign_ed25519_pk_to_curve25519(x25519Pub, keys.publicKey)
  sodium.crypto_sign_ed25519_sk_to_curve25519(x25519Sec, keys.secretKey)

  return { publicKey: x25519Pub, secretKey: x25519Sec }
}

// ============================================================
// Shared secret computation
// ============================================================

/**
 * Compute X25519 shared secret and hash with BLAKE2b.
 * Raw X25519 output should never be used directly as a symmetric key
 * (standard practice per NaCl/libsodium docs).
 */
export function computeSharedSecret(
  ourX25519Secret: Buffer,
  theirX25519Public: Buffer
): Buffer {
  const rawShared = Buffer.alloc(sodium.crypto_scalarmult_BYTES) // 32 bytes
  sodium.crypto_scalarmult(rawShared, ourX25519Secret, theirX25519Public)

  // Hash with BLAKE2b to derive the final symmetric key
  const derivedKey = Buffer.alloc(sodium.crypto_generichash_BYTES) // 32 bytes
  sodium.crypto_generichash(derivedKey, rawShared)

  // Zero the raw shared secret
  sodium.sodium_memzero(rawShared)

  return derivedKey
}

// ============================================================
// XChaCha20-Poly1305 encrypt/decrypt
// ============================================================

/**
 * Encrypt a DM message with XChaCha20-Poly1305.
 * Generates a random 24-byte nonce per message.
 */
export function encryptDmMessage(
  plaintext: string,
  sharedSecret: Buffer
): { encrypted: Buffer; nonce: Buffer } {
  const nonce = Buffer.alloc(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) // 24 bytes
  sodium.randombytes_buf(nonce)

  const plaintextBuf = Buffer.from(plaintext, 'utf-8')
  const ciphertext = Buffer.alloc(
    plaintextBuf.length + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES
  )

  sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    ciphertext,
    plaintextBuf,
    null, // no additional data
    null, // unused nsec
    nonce,
    sharedSecret
  )

  return { encrypted: ciphertext, nonce }
}

/**
 * Decrypt a DM message with XChaCha20-Poly1305.
 * Throws on decryption failure (tampered or wrong key).
 */
export function decryptDmMessage(
  encrypted: Buffer,
  nonce: Buffer,
  sharedSecret: Buffer
): string {
  const plaintext = Buffer.alloc(
    encrypted.length - sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES
  )

  sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    plaintext,
    null, // unused nsec
    encrypted,
    null, // no additional data
    nonce,
    sharedSecret
  )

  return plaintext.toString('utf-8')
}

// ============================================================
// Key publishing and fetching
// ============================================================

interface DmKeyResponse {
  x25519_pubkey: string
}

/**
 * Ensure the user's X25519 public key is published to the server.
 * Derives from Ed25519, POSTs to /api/dm/keys.
 * Returns the hex-encoded X25519 public key.
 */
export async function getOrPublishDmKey(serverUrl: string, token: string): Promise<string> {
  const { publicKey } = deriveX25519FromEd25519()
  const pubkeyHex = bufToHex(publicKey)

  await apiPost<DmKeyResponse>(
    serverUrl,
    '/api/dm/keys',
    { x25519_pubkey: pubkeyHex },
    token
  )

  return pubkeyHex
}

/**
 * Fetch a peer's X25519 public key from the server.
 * Returns the key as a Buffer, or null if the peer hasn't published one.
 */
export async function fetchPeerDmKey(
  serverUrl: string,
  token: string,
  peerEd25519Pubkey: string
): Promise<Buffer | null> {
  try {
    const result = await apiGet<DmKeyResponse>(
      serverUrl,
      `/api/dm/keys/${peerEd25519Pubkey}`,
      token
    )
    return hexToBuf(result.x25519_pubkey)
  } catch (err) {
    // 404 means peer hasn't published a key
    if (err instanceof Error && err.message.includes('404')) {
      return null
    }
    throw err
  }
}

// ============================================================
// Shared secret cache
// ============================================================

/** In-memory cache: conversation_id -> shared secret Buffer */
const sharedSecretCache = new Map<string, Buffer>()

/**
 * Get or compute the shared secret for a DM conversation.
 * Caches the result to avoid redundant X25519 computations.
 */
export async function getOrComputeSharedSecret(
  conversationId: string,
  peerEd25519Pubkey: string,
  serverUrl: string,
  token: string
): Promise<Buffer | null> {
  // Check cache first
  const cached = sharedSecretCache.get(conversationId)
  if (cached) return cached

  // Fetch peer's X25519 public key
  const peerX25519Pub = await fetchPeerDmKey(serverUrl, token, peerEd25519Pubkey)
  if (!peerX25519Pub) return null

  // Derive our X25519 secret key
  const { secretKey: ourX25519Sec } = deriveX25519FromEd25519()

  // Compute shared secret (X25519 + BLAKE2b)
  const secret = computeSharedSecret(ourX25519Sec, peerX25519Pub)

  // Zero the X25519 secret key after use
  sodium.sodium_memzero(ourX25519Sec)

  // Cache the shared secret
  sharedSecretCache.set(conversationId, secret)

  return secret
}

/**
 * Clear all cached shared secrets.
 * Zero each buffer before removing from cache.
 * Called on identity lock/quit.
 */
export function clearSharedSecretCache(): void {
  for (const [, secret] of sharedSecretCache) {
    sodium.sodium_memzero(secret)
  }
  sharedSecretCache.clear()
}
