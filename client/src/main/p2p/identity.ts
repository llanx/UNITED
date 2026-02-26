/**
 * Identity bridge: converts UNITED Ed25519 keys to libp2p format.
 *
 * UNITED stores Ed25519 secret keys as 64-byte sodium keys (32-byte seed + 32-byte pubkey).
 * libp2p's @libp2p/crypto v5 provides `generateKeyPairFromSeed('Ed25519', seed)` which
 * accepts the 32-byte seed directly.
 */

import { generateKeyPairFromSeed } from '@libp2p/crypto/keys'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { getSessionKeys } from '../ipc/crypto'
import type { Ed25519PrivateKey, Ed25519PeerId } from '@libp2p/interface'

/**
 * Convert a UNITED Ed25519 secret key (32-byte seed) to libp2p identity format.
 *
 * @param seedBytes - The 32-byte Ed25519 seed (first 32 bytes of sodium secret key)
 * @returns The libp2p private key and derived PeerId
 */
export async function unitedKeysToLibp2p(seedBytes: Uint8Array): Promise<{
  privateKey: Ed25519PrivateKey
  peerId: Ed25519PeerId
}> {
  if (seedBytes.length !== 32) {
    throw new Error(`Expected 32-byte Ed25519 seed, got ${seedBytes.length} bytes`)
  }

  // generateKeyPairFromSeed accepts a 32-byte seed and produces a full Ed25519 keypair
  const privateKey = await generateKeyPairFromSeed('Ed25519', seedBytes)
  const peerId = peerIdFromPrivateKey(privateKey)

  return { privateKey, peerId }
}

/**
 * Get the Ed25519 seed from the current session identity.
 *
 * The UNITED client stores Ed25519 keys as 64-byte sodium secret keys where
 * the first 32 bytes are the seed.
 *
 * @returns The 32-byte Ed25519 seed, or null if no identity is unlocked
 */
export function getIdentityKeySeed(): Uint8Array | null {
  const keys = getSessionKeys()
  if (!keys) return null

  // sodium secret key is 64 bytes: first 32 = seed, last 32 = public key
  const seed = new Uint8Array(keys.secretKey.buffer, keys.secretKey.byteOffset, 32)
  return seed
}
