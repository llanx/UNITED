import type { IpcMain } from 'electron'
import sodium from 'sodium-native'
import { createHash } from 'crypto'
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { initBlockStoreKey, clearBlockStoreKey } from '../blocks/crypto'
import { getBlockStoreSalt, initBlockStore } from '../blocks/store'

// ============================================================
// Constants
// ============================================================

/** Argon2id parameters per IDENTITY-ARCHITECTURE.md */
const ARGON2_M_COST = 262144 // 256 MB in KiB
const ARGON2_T_COST = 3
const ARGON2_P_COST = 4

/** XChaCha20-Poly1305 nonce size: 24 bytes */
const NONCE_SIZE = 24
/** Argon2id salt size */
const SALT_SIZE = 16
/** Derived key size for XChaCha20-Poly1305 */
const KEY_SIZE = 32

// ============================================================
// In-memory session key (zeroed on lock/quit)
// ============================================================

let sessionSecretKey: Buffer | null = null
let sessionPublicKey: Buffer | null = null

export function getSessionKeys(): { secretKey: Buffer; publicKey: Buffer } | null {
  if (!sessionSecretKey || !sessionPublicKey) return null
  return { secretKey: sessionSecretKey, publicKey: sessionPublicKey }
}

export function clearSessionKeys(): void {
  if (sessionSecretKey) {
    sodium.sodium_memzero(sessionSecretKey)
    sessionSecretKey = null
  }
  if (sessionPublicKey) {
    sodium.sodium_memzero(sessionPublicKey)
    sessionPublicKey = null
  }
  // Also clear block store key on lock/quit
  clearBlockStoreKey()
}

// ============================================================
// Hex encoding helpers
// ============================================================

export function bufToHex(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('hex')
}

export function hexToBuf(hex: string): Buffer {
  return Buffer.from(hex, 'hex')
}

// ============================================================
// Core crypto operations
// ============================================================

/**
 * Compute raw fingerprint bytes: SHA-256(public_key), truncated to 20 bytes.
 * Used for wire-format (hex-encoded) fingerprint sent to server.
 */
export function computeFingerprintBytes(publicKey: Buffer): Buffer {
  const hash = createHash('sha256').update(publicKey).digest()
  return Buffer.from(hash.subarray(0, 20))
}

/**
 * Compute fingerprint: SHA-256(public_key), truncated to 20 bytes, base32-encoded.
 * Display format: UNITED-XXXXX-XXXXX-XXXXX-XXXXX
 */
export function computeFingerprint(publicKey: Buffer): string {
  const truncated = computeFingerprintBytes(publicKey)
  // Encode as base32 (RFC 4648, no padding)
  const base32 = base32Encode(truncated)
  // Format as UNITED-XXXXX-XXXXX-XXXXX-XXXXX (first 20 base32 chars = 4 groups of 5)
  const groups = base32.substring(0, 20).match(/.{1,5}/g)!
  return `UNITED-${groups.join('-')}`
}

function base32Encode(data: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let result = ''
  let bits = 0
  let value = 0

  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i]
    bits += 8
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31]
  }
  return result
}

/**
 * Derive an encryption key from passphrase using Argon2id.
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  const key = Buffer.alloc(KEY_SIZE)
  const passphraseBuffer = Buffer.from(passphrase, 'utf-8')

  sodium.crypto_pwhash(
    key,
    passphraseBuffer,
    salt,
    ARGON2_T_COST,
    ARGON2_M_COST * 1024, // sodium expects bytes, m_cost is in KiB
    sodium.crypto_pwhash_ALG_ARGON2ID13
  )

  return key
}

/**
 * Encrypt data with XChaCha20-Poly1305.
 */
function encrypt(
  plaintext: Buffer,
  key: Buffer,
  nonce: Buffer
): Buffer {
  const ciphertext = Buffer.alloc(plaintext.length + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES)
  sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    ciphertext,
    plaintext,
    null, // no additional data
    null, // unused nsec
    nonce,
    key
  )
  return ciphertext
}

/**
 * Decrypt data with XChaCha20-Poly1305.
 */
function decrypt(
  ciphertext: Buffer,
  key: Buffer,
  nonce: Buffer
): Buffer {
  const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES)
  sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    plaintext,
    null, // unused nsec
    ciphertext,
    null, // no additional data
    nonce,
    key
  )
  return plaintext
}

/**
 * Generate a new Ed25519 keypair, encrypt private key, create mnemonic.
 */
export function createIdentity(passphrase: string): {
  fingerprint: string
  publicKey: Buffer
  mnemonic: string[]
  encryptedPrivateKey: Buffer
  salt: Buffer
  nonce: Buffer
} {
  // 1. Generate Ed25519 keypair
  const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
  const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES) // 64 bytes (seed + pubkey)
  sodium.crypto_sign_keypair(publicKey, secretKey)

  // 2. Extract seed (first 32 bytes of secret key)
  const seed = secretKey.subarray(0, 32)

  // 3. Generate BIP39 mnemonic from seed entropy
  // Use entropyToMnemonic (NOT mnemonicToSeed — Pitfall 3)
  const mnemonic = entropyToMnemonic(new Uint8Array(seed), wordlist).split(' ')

  // 4. Derive encryption key from passphrase
  const salt = Buffer.alloc(SALT_SIZE)
  sodium.randombytes_buf(salt)
  const derivedKey = deriveKey(passphrase, salt)

  // 5. Encrypt secret key with XChaCha20-Poly1305
  const nonce = Buffer.alloc(NONCE_SIZE)
  sodium.randombytes_buf(nonce)
  const encryptedPrivateKey = encrypt(secretKey, derivedKey, nonce)

  // 6. Compute fingerprint
  const fingerprint = computeFingerprint(publicKey)

  // 7. Set session keys (keep in memory for session)
  sessionPublicKey = Buffer.alloc(publicKey.length)
  publicKey.copy(sessionPublicKey)
  sessionSecretKey = Buffer.alloc(secretKey.length)
  secretKey.copy(sessionSecretKey)

  // 8. Zero sensitive intermediaries
  sodium.sodium_memzero(derivedKey)
  // Don't zero secretKey yet — it's still referenced by sessionSecretKey copy
  // Zero the seed view only if needed, but it's part of secretKey buffer

  return {
    fingerprint,
    publicKey,
    mnemonic,
    encryptedPrivateKey,
    salt,
    nonce
  }
}

/**
 * Recover identity from BIP39 mnemonic words.
 * Uses mnemonicToEntropy to get original 32-byte seed.
 */
export function recoverIdentity(words: string[], passphrase: string): {
  fingerprint: string
  publicKey: Buffer
  mnemonic: string[]
  encryptedPrivateKey: Buffer
  salt: Buffer
  nonce: Buffer
} {
  const phrase = words.join(' ')
  if (!validateMnemonic(phrase, wordlist)) {
    throw new Error('Invalid mnemonic phrase')
  }

  // 1. Get raw entropy (32 bytes) from mnemonic
  const entropy = mnemonicToEntropy(phrase, wordlist)
  const seed = Buffer.from(entropy)

  // 2. Derive Ed25519 keypair from seed
  const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
  const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)
  sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed)

  // 3. Re-encrypt with new passphrase
  const salt = Buffer.alloc(SALT_SIZE)
  sodium.randombytes_buf(salt)
  const derivedKey = deriveKey(passphrase, salt)

  const nonce = Buffer.alloc(NONCE_SIZE)
  sodium.randombytes_buf(nonce)
  const encryptedPrivateKey = encrypt(secretKey, derivedKey, nonce)

  // 4. Compute fingerprint
  const fingerprint = computeFingerprint(publicKey)

  // 5. Set session keys
  sessionPublicKey = Buffer.alloc(publicKey.length)
  publicKey.copy(sessionPublicKey)
  sessionSecretKey = Buffer.alloc(secretKey.length)
  secretKey.copy(sessionSecretKey)

  // 6. Zero intermediaries
  sodium.sodium_memzero(derivedKey)
  sodium.sodium_memzero(seed)

  return {
    fingerprint,
    publicKey,
    mnemonic: words,
    encryptedPrivateKey,
    salt,
    nonce
  }
}

/**
 * Unlock stored identity with passphrase.
 */
export function unlockIdentity(
  encryptedPrivateKey: Buffer,
  salt: Buffer,
  nonce: Buffer,
  publicKey: Buffer,
  passphrase: string
): { fingerprint: string; publicKey: Buffer } {
  const derivedKey = deriveKey(passphrase, salt)

  let secretKey: Buffer
  try {
    secretKey = decrypt(encryptedPrivateKey, derivedKey, nonce)
  } catch {
    sodium.sodium_memzero(derivedKey)
    throw new Error('Incorrect passphrase')
  }

  sodium.sodium_memzero(derivedKey)

  // Set session keys
  sessionPublicKey = Buffer.alloc(publicKey.length)
  publicKey.copy(sessionPublicKey)
  sessionSecretKey = Buffer.alloc(secretKey.length)
  secretKey.copy(sessionSecretKey)

  const fingerprint = computeFingerprint(publicKey)

  // Initialize block store key alongside session keys
  try {
    initBlockStore()
    const blockStoreSalt = getBlockStoreSalt()
    initBlockStoreKey(passphrase, blockStoreSalt)
  } catch {
    // Block store init may fail if DB migration hasn't run yet (first launch)
    // This is non-fatal -- block store will be initialized on next successful unlock
  }

  return { fingerprint, publicKey }
}

/**
 * Sign a challenge with the session secret key (crypto_sign_detached).
 */
export function signChallenge(challenge: Buffer): Buffer {
  if (!sessionSecretKey) throw new Error('Identity not unlocked')
  const signature = Buffer.alloc(sodium.crypto_sign_BYTES)
  sodium.crypto_sign_detached(signature, challenge, sessionSecretKey)
  return signature
}

/**
 * Sign the public key bytes with the secret key to produce genesis_signature.
 */
export function signGenesis(): Buffer {
  if (!sessionSecretKey || !sessionPublicKey) throw new Error('Identity not unlocked')
  const signature = Buffer.alloc(sodium.crypto_sign_BYTES)
  sodium.crypto_sign_detached(signature, sessionPublicKey, sessionSecretKey)
  return signature
}

/**
 * Build the encrypted identity blob for server registration.
 * Returns the full encrypted blob as a single buffer (nonce + salt + ciphertext).
 */
export function getEncryptedBlob(
  encryptedPrivateKey: Buffer,
  salt: Buffer,
  nonce: Buffer
): Buffer {
  return Buffer.concat([nonce, salt, encryptedPrivateKey])
}

/**
 * Register crypto utility IPC handlers.
 * crypto.ts exports functions used by auth.ts — no direct IPC handlers needed here.
 */
export function registerCryptoHandlers(_ipcMain: IpcMain): void {
  // All crypto operations are invoked via auth.ts IPC handlers.
  // This module exports the functions directly for auth.ts to call.
}
