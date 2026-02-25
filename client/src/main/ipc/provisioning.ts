import type { IpcMain } from 'electron'
import * as net from 'net'
import * as os from 'os'
import * as crypto from 'crypto'
import { IPC } from './channels'
import { getSessionKeys, bufToHex } from './crypto'
import * as queries from '../db/queries'

// ============================================================
// Constants
// ============================================================

/** Auto-cancel provisioning after 5 minutes */
const PROVISIONING_TIMEOUT_MS = 5 * 60 * 1000

/** HKDF salt for key derivation */
const HKDF_SALT = 'united-device-provisioning'

/** HKDF info for key derivation */
const HKDF_INFO = 'keypair-transfer'

/** AES-256-GCM IV size */
const IV_SIZE = 12

/** AES-256-GCM auth tag size */
const AUTH_TAG_SIZE = 16

/** X25519 public key size */
const X25519_PUB_SIZE = 32

/** HMAC confirmation size */
const HMAC_SIZE = 32

/** Length prefix size (4 bytes, uint32 big-endian) */
const LENGTH_PREFIX_SIZE = 4

/** X25519 SPKI DER header (12 bytes preceding the 32-byte raw key) */
const X25519_SPKI_HEADER = Buffer.from('302a300506032b656e032100', 'hex')

// ============================================================
// Active provisioning session state
// ============================================================

let activeServer: net.Server | null = null
let activeTimeout: ReturnType<typeof setTimeout> | null = null
let activeEphemeralPrivateKey: crypto.KeyObject | null = null

function cleanupProvisioning(): void {
  if (activeTimeout) {
    clearTimeout(activeTimeout)
    activeTimeout = null
  }
  if (activeServer) {
    try { activeServer.close() } catch { /* ignore */ }
    activeServer = null
  }
  activeEphemeralPrivateKey = null
}

// ============================================================
// Network helpers
// ============================================================

/**
 * Get the first non-internal IPv4 address from network interfaces.
 */
function getLocalIPv4(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name]
    if (!addrs) continue
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address
      }
    }
  }
  return '127.0.0.1'
}

/**
 * Import a raw 32-byte X25519 public key into a Node.js KeyObject.
 */
function importX25519PublicKey(rawBytes: Buffer): crypto.KeyObject {
  const spkiDer = Buffer.concat([X25519_SPKI_HEADER, rawBytes])
  return crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' })
}

/**
 * Export a Node.js X25519 KeyObject to raw 32 bytes.
 */
function exportX25519PublicKey(keyObj: crypto.KeyObject): Buffer {
  const der = keyObj.export({ type: 'spki', format: 'der' })
  return Buffer.from(der.subarray(der.length - X25519_PUB_SIZE))
}

// ============================================================
// Crypto helpers
// ============================================================

/**
 * Derive encryption key from X25519 shared secret via HKDF-SHA256.
 */
function deriveEncryptionKey(sharedSecret: Buffer): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', sharedSecret, HKDF_SALT, HKDF_INFO, 32)
  )
}

/**
 * Encrypt payload with AES-256-GCM.
 * Returns: IV (12 bytes) + auth tag (16 bytes) + ciphertext
 */
function aesGcmEncrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_SIZE)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext])
}

/**
 * Decrypt payload with AES-256-GCM.
 * Expects: IV (12 bytes) + auth tag (16 bytes) + ciphertext
 */
function aesGcmDecrypt(data: Buffer, key: Buffer): Buffer {
  const iv = data.subarray(0, IV_SIZE)
  const authTag = data.subarray(IV_SIZE, IV_SIZE + AUTH_TAG_SIZE)
  const ciphertext = data.subarray(IV_SIZE + AUTH_TAG_SIZE)

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// ============================================================
// Wire protocol
// ============================================================
//
// Step 1: Receiver connects, sends 32 bytes (ephemeral X25519 public key)
// Step 2: Sender reads 32 bytes, computes DH, encrypts payload
// Step 3: Sender sends: 4 bytes (payload length, big-endian uint32) + encrypted payload
// Step 4: Receiver reads length prefix + encrypted payload, decrypts
// Step 5: Receiver sends 32-byte HMAC-SHA256 confirmation
// Step 6: Sender reads HMAC, verifies, both sides close
//

// ============================================================
// Sender side: startProvisioning()
// ============================================================

/**
 * Start a device provisioning session on the existing device.
 *
 * Generates ephemeral X25519 keypair, starts TCP server on random port,
 * returns QR payload with local IP + port + ephemeral public key.
 */
async function startProvisioning(): Promise<{ qrPayload: string }> {
  cleanupProvisioning()

  const sessionKeys = getSessionKeys()
  if (!sessionKeys) {
    throw new Error('Identity not unlocked - cannot start provisioning')
  }

  const identity = queries.getIdentity()
  if (!identity) {
    throw new Error('No local identity found')
  }

  // Generate ephemeral X25519 keypair
  const { publicKey: ephPubKey, privateKey: ephPrivKey } = crypto.generateKeyPairSync('x25519')
  activeEphemeralPrivateKey = ephPrivKey
  const ephPubBytes = exportX25519PublicKey(ephPubKey)

  return new Promise<{ qrPayload: string }>((resolve, reject) => {
    const server = net.createServer((socket) => {
      // Accept only one connection, then stop listening
      server.close()

      let buffer = Buffer.alloc(0)
      let sentPayload = false
      let payloadJson = ''
      let encryptionKey: Buffer | null = null

      socket.on('data', (data: Buffer) => {
        buffer = Buffer.concat([buffer, data])

        // Step 2: Read receiver's ephemeral X25519 public key (32 bytes)
        if (!sentPayload && buffer.length >= X25519_PUB_SIZE) {
          sentPayload = true

          const receiverPubRaw = buffer.subarray(0, X25519_PUB_SIZE)
          buffer = buffer.subarray(X25519_PUB_SIZE)

          const receiverPubKey = importX25519PublicKey(receiverPubRaw)

          if (!activeEphemeralPrivateKey) {
            socket.destroy()
            return
          }

          // Compute shared secret
          const sharedSecret = crypto.diffieHellman({
            privateKey: activeEphemeralPrivateKey,
            publicKey: receiverPubKey
          })

          encryptionKey = deriveEncryptionKey(sharedSecret)

          // Build payload with identity data
          payloadJson = JSON.stringify({
            secretKey: bufToHex(sessionKeys.secretKey),
            publicKey: bufToHex(sessionKeys.publicKey),
            fingerprint: identity.fingerprint,
            encryptedPrivateKey: bufToHex(identity.encrypted_private_key),
            salt: bufToHex(identity.salt),
            nonce: bufToHex(identity.nonce),
            argon2MCost: identity.argon2_m_cost,
            argon2TCost: identity.argon2_t_cost,
            argon2PCost: identity.argon2_p_cost
          })

          // Step 3: Send length-prefixed encrypted payload
          const encrypted = aesGcmEncrypt(Buffer.from(payloadJson, 'utf-8'), encryptionKey)
          const lengthBuf = Buffer.alloc(LENGTH_PREFIX_SIZE)
          lengthBuf.writeUInt32BE(encrypted.length, 0)
          socket.write(Buffer.concat([lengthBuf, encrypted]))
        }

        // Step 6: Read HMAC confirmation (32 bytes after public key consumed)
        if (sentPayload && encryptionKey && buffer.length >= HMAC_SIZE) {
          const hmacReceived = buffer.subarray(0, HMAC_SIZE)

          const expectedHmac = crypto.createHmac('sha256', encryptionKey)
            .update(payloadJson, 'utf-8')
            .digest()

          if (crypto.timingSafeEqual(hmacReceived, expectedHmac)) {
            socket.end()
          } else {
            socket.destroy()
          }
          cleanupProvisioning()
        }
      })

      socket.on('error', () => {
        cleanupProvisioning()
      })

      socket.on('close', () => {
        cleanupProvisioning()
      })
    })

    activeServer = server

    server.on('error', (err) => {
      cleanupProvisioning()
      reject(new Error(`Provisioning server error: ${err.message}`))
    })

    server.listen(0, '0.0.0.0', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        cleanupProvisioning()
        reject(new Error('Failed to get server address'))
        return
      }

      const localIp = getLocalIPv4()
      const port = addr.port

      activeTimeout = setTimeout(() => {
        cleanupProvisioning()
      }, PROVISIONING_TIMEOUT_MS)

      const qrPayload = JSON.stringify({
        ip: localIp,
        port,
        pk: ephPubBytes.toString('hex')
      })

      resolve({ qrPayload })
    })
  })
}

// ============================================================
// Sender side: cancelProvisioning()
// ============================================================

function cancelProvisioning(): void {
  cleanupProvisioning()
}

// ============================================================
// Receiver side: receiveProvisioning()
// ============================================================

/**
 * Receive a keypair from an existing device via QR-based local TCP transfer.
 *
 * Parses QR payload, connects to sender, performs X25519 key exchange,
 * receives encrypted identity, decrypts, sends HMAC confirmation, stores locally.
 */
async function receiveProvisioning(qrPayload: string): Promise<{ fingerprint: string }> {
  let parsed: { ip: string; port: number; pk: string }
  try {
    parsed = JSON.parse(qrPayload)
  } catch {
    throw new Error('Invalid QR payload: not valid JSON')
  }

  if (!parsed.ip || !parsed.port || !parsed.pk) {
    throw new Error('Invalid QR payload: missing ip, port, or pk')
  }

  // Generate own ephemeral X25519 keypair
  const { publicKey: myPubKey, privateKey: myPrivKey } = crypto.generateKeyPairSync('x25519')
  const myPubBytes = exportX25519PublicKey(myPubKey)

  // Import sender's ephemeral public key from hex
  const senderPubRaw = Buffer.from(parsed.pk, 'hex')
  if (senderPubRaw.length !== X25519_PUB_SIZE) {
    throw new Error('Invalid QR payload: public key must be 32 bytes')
  }
  const senderPubKey = importX25519PublicKey(senderPubRaw)

  // Compute shared secret and derive encryption key
  const sharedSecret = crypto.diffieHellman({
    privateKey: myPrivKey,
    publicKey: senderPubKey
  })
  const encryptionKey = deriveEncryptionKey(sharedSecret)

  return new Promise<{ fingerprint: string }>((resolve, reject) => {
    const socket = net.createConnection(
      { host: parsed.ip, port: parsed.port },
      () => {
        // Step 1: Send our ephemeral public key
        socket.write(myPubBytes)
      }
    )

    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error('Provisioning connection timed out'))
    }, 30000)

    let buffer = Buffer.alloc(0)
    let payloadLength: number | null = null
    let resolved = false

    socket.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data])

      // Step 4: Read length prefix (4 bytes)
      if (payloadLength === null && buffer.length >= LENGTH_PREFIX_SIZE) {
        payloadLength = buffer.readUInt32BE(0)
        buffer = buffer.subarray(LENGTH_PREFIX_SIZE)
      }

      // Read encrypted payload
      if (payloadLength !== null && buffer.length >= payloadLength && !resolved) {
        resolved = true
        clearTimeout(timeout)

        const encryptedPayload = buffer.subarray(0, payloadLength)

        try {
          const decryptedJson = aesGcmDecrypt(encryptedPayload, encryptionKey).toString('utf-8')
          const payload = JSON.parse(decryptedJson) as {
            secretKey: string
            publicKey: string
            fingerprint: string
            encryptedPrivateKey: string
            salt: string
            nonce: string
            argon2MCost: number
            argon2TCost: number
            argon2PCost: number
          }

          // Step 5: Send HMAC confirmation
          const hmac = crypto.createHmac('sha256', encryptionKey)
            .update(decryptedJson, 'utf-8')
            .digest()
          socket.write(hmac)
          socket.end()

          // Store received identity locally
          queries.saveIdentity({
            fingerprint: payload.fingerprint,
            public_key: Buffer.from(payload.publicKey, 'hex'),
            encrypted_private_key: Buffer.from(payload.encryptedPrivateKey, 'hex'),
            salt: Buffer.from(payload.salt, 'hex'),
            nonce: Buffer.from(payload.nonce, 'hex'),
            argon2_m_cost: payload.argon2MCost,
            argon2_t_cost: payload.argon2TCost,
            argon2_p_cost: payload.argon2PCost
          })

          resolve({ fingerprint: payload.fingerprint })
        } catch (err) {
          socket.destroy()
          reject(new Error(
            `Failed to decrypt provisioning data: ${err instanceof Error ? err.message : 'unknown'}`
          ))
        }
      }
    })

    socket.on('error', (err) => {
      if (!resolved) {
        clearTimeout(timeout)
        reject(new Error(`Provisioning connection error: ${err.message}`))
      }
    })
  })
}

// ============================================================
// IPC handler registration
// ============================================================

export function registerProvisioningHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC.PROVISIONING_START, async (): Promise<{ qrPayload: string }> => {
    return startProvisioning()
  })

  ipcMain.handle(IPC.PROVISIONING_CANCEL, async (): Promise<void> => {
    cancelProvisioning()
  })

  ipcMain.handle(IPC.PROVISIONING_RECEIVE, async (_event, qrPayload: string): Promise<{ fingerprint: string }> => {
    return receiveProvisioning(qrPayload)
  })
}
