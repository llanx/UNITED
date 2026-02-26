/**
 * Block store cryptographic operations.
 *
 * - Argon2id key derivation for block store encryption key (separate from identity key)
 * - AES-256-GCM encryption (with XChaCha20-Poly1305 fallback if AES-NI unavailable)
 * - Version-tagged ciphertext for algorithm detection on decrypt
 * - Content-derived HKDF keys for server block communication
 */

import sodium from 'sodium-native'
import { createHash, hkdfSync } from 'crypto'

// ============================================================
// Constants
// ============================================================

/** Argon2id parameters — same as identity derivation */
const ARGON2_M_COST = 262144  // 256 MB in KiB
const ARGON2_T_COST = 3
const KEY_SIZE = 32

/** Version tags prepended to encrypted blocks */
const VERSION_AES_GCM = 0x01
const VERSION_XCHACHA20 = 0x02

/** AES-256-GCM nonce size */
const AES_GCM_NONCE_SIZE = 12
/** XChaCha20-Poly1305 nonce size */
const XCHACHA_NONCE_SIZE = 24

// ============================================================
// Module-level block store key (zeroed on lock/quit)
// ============================================================

let blockStoreKey: Buffer | null = null

/**
 * Derive the block store encryption key from passphrase and salt.
 * Uses Argon2id with the same parameters as identity derivation but
 * a SEPARATE salt dedicated to the block store.
 */
export function deriveBlockStoreKey(passphrase: string, salt: Buffer): Buffer {
  const key = Buffer.alloc(KEY_SIZE)
  const passphraseBuffer = Buffer.from(passphrase, 'utf-8')

  sodium.crypto_pwhash(
    key,
    passphraseBuffer,
    salt,
    ARGON2_T_COST,
    ARGON2_M_COST * 1024, // sodium expects bytes
    sodium.crypto_pwhash_ALG_ARGON2ID13
  )

  return key
}

/**
 * Derive and store the block store key in module-level variable.
 * Called during identity unlock alongside session key derivation.
 */
export function initBlockStoreKey(passphrase: string, salt: Buffer): void {
  if (blockStoreKey) {
    sodium.sodium_memzero(blockStoreKey)
  }
  blockStoreKey = deriveBlockStoreKey(passphrase, salt)
}

/**
 * Securely zero and clear the block store key.
 * Called on identity lock or app quit.
 */
export function clearBlockStoreKey(): void {
  if (blockStoreKey) {
    sodium.sodium_memzero(blockStoreKey)
    blockStoreKey = null
  }
}

/**
 * Get the current block store key, or null if not derived.
 */
export function getBlockStoreKey(): Buffer | null {
  return blockStoreKey
}

/**
 * Encrypt a block with AES-256-GCM (preferred) or XChaCha20-Poly1305 (fallback).
 * Returns: version_byte || nonce || ciphertext+tag
 */
export function encryptBlock(data: Buffer, key: Buffer): Buffer {
  if (sodium.crypto_aead_aes256gcm_is_available()) {
    // AES-256-GCM path
    const nonce = Buffer.alloc(AES_GCM_NONCE_SIZE)
    sodium.randombytes_buf(nonce)

    const ciphertext = Buffer.alloc(data.length + sodium.crypto_aead_aes256gcm_ABYTES)
    sodium.crypto_aead_aes256gcm_encrypt(
      ciphertext,
      data,
      null, // no additional data
      null, // unused nsec
      nonce,
      key
    )

    // version || nonce || ciphertext
    return Buffer.concat([Buffer.from([VERSION_AES_GCM]), nonce, ciphertext])
  } else {
    // XChaCha20-Poly1305 fallback
    const nonce = Buffer.alloc(XCHACHA_NONCE_SIZE)
    sodium.randombytes_buf(nonce)

    const ciphertext = Buffer.alloc(data.length + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES)
    sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      ciphertext,
      data,
      null, // no additional data
      null, // unused nsec
      nonce,
      key
    )

    // version || nonce || ciphertext
    return Buffer.concat([Buffer.from([VERSION_XCHACHA20]), nonce, ciphertext])
  }
}

/**
 * Decrypt a block by reading the version byte to determine the algorithm.
 */
export function decryptBlock(encrypted: Buffer, key: Buffer): Buffer {
  if (encrypted.length < 2) {
    throw new Error('Encrypted block too short')
  }

  const version = encrypted[0]

  if (version === VERSION_AES_GCM) {
    const nonce = encrypted.subarray(1, 1 + AES_GCM_NONCE_SIZE)
    const ciphertext = encrypted.subarray(1 + AES_GCM_NONCE_SIZE)
    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_aead_aes256gcm_ABYTES)
    sodium.crypto_aead_aes256gcm_decrypt(
      plaintext,
      null, // unused nsec
      ciphertext,
      null, // no additional data
      nonce,
      key
    )
    return plaintext
  } else if (version === VERSION_XCHACHA20) {
    const nonce = encrypted.subarray(1, 1 + XCHACHA_NONCE_SIZE)
    const ciphertext = encrypted.subarray(1 + XCHACHA_NONCE_SIZE)
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
  } else {
    throw new Error(`Unknown block encryption version: 0x${version.toString(16)}`)
  }
}

/**
 * Compute the SHA-256 hash of block data.
 * Returns the hex-encoded hash string used as the content address.
 */
export function computeBlockHash(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Derive a content-derived encryption key using HKDF.
 * Used for server-side block encryption where authorized peers
 * (who know the content hash) can derive the decryption key.
 */
export function deriveContentKey(contentHashHex: string): Buffer {
  const hashBytes = Buffer.from(contentHashHex, 'hex')
  const derived = hkdfSync(
    'sha256',
    hashBytes,
    'united-content-derived-key-v1',     // salt
    'united-server-block-encryption',     // info
    32                                     // key length
  )
  return Buffer.from(derived)
}
