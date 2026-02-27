import type { IpcMain } from 'electron'
import { IPC } from './channels'
import {
  createIdentity,
  recoverIdentity,
  unlockIdentity,
  signChallenge,
  signGenesis,
  getEncryptedBlob,
  getSessionKeys,
  bufToHex,
  computeFingerprintBytes
} from './crypto'
import * as queries from '../db/queries'
import type {
  IdentityCreateResult,
  IdentityUnlockResult,
  RegisterResult,
  TotpEnrollResult
} from '@shared/ipc-bridge'
import type {
  RegisterResponseBody,
  TotpEnrollResponseBody,
  TotpConfirmResponseBody,
  RefreshResponseBody
} from '@shared/api'

// ============================================================
// Token storage (encrypted via Electron safeStorage)
// ============================================================

let currentAccessToken: string | null = null
let currentRefreshToken: string | null = null
let currentServerUrl: string | null = null

export function getAccessToken(): string | null {
  return currentAccessToken
}

export function getServerUrl(): string | null {
  return currentServerUrl
}

export function setServerUrl(url: string): void {
  currentServerUrl = url
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  currentAccessToken = accessToken
  currentRefreshToken = refreshToken
}

function clearTokens(): void {
  currentAccessToken = null
  currentRefreshToken = null
}

// ============================================================
// HTTP helpers (all REST calls go through main process — CSP blocks renderer HTTP)
// ============================================================

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

/**
 * Attempt to silently refresh the JWT tokens.
 */
export async function refreshTokens(): Promise<boolean> {
  if (!currentRefreshToken || !currentServerUrl) return false

  try {
    const result = await apiPost<RefreshResponseBody>(
      currentServerUrl,
      '/api/auth/refresh',
      { refresh_token: currentRefreshToken }
    )
    storeTokens(result.access_token, result.refresh_token)
    return true
  } catch {
    clearTokens()
    return false
  }
}

// ============================================================
// IPC handlers
// ============================================================

export function registerAuthHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC.IDENTITY_CREATE, async (_event, passphrase: string): Promise<IdentityCreateResult> => {
    const result = createIdentity(passphrase)

    // Persist to local SQLite
    queries.saveIdentity({
      fingerprint: result.fingerprint,
      public_key: result.publicKey,
      encrypted_private_key: result.encryptedPrivateKey,
      salt: result.salt,
      nonce: result.nonce,
      argon2_m_cost: 262144,
      argon2_t_cost: 3,
      argon2_p_cost: 4
    })

    return {
      fingerprint: result.fingerprint,
      publicKey: new Uint8Array(result.publicKey),
      mnemonic: result.mnemonic
    }
  })

  ipcMain.handle(IPC.IDENTITY_RECOVER, async (_event, words: string[], passphrase: string): Promise<IdentityCreateResult> => {
    const result = recoverIdentity(words, passphrase)

    // Persist to local SQLite
    queries.saveIdentity({
      fingerprint: result.fingerprint,
      public_key: result.publicKey,
      encrypted_private_key: result.encryptedPrivateKey,
      salt: result.salt,
      nonce: result.nonce,
      argon2_m_cost: 262144,
      argon2_t_cost: 3,
      argon2_p_cost: 4
    })

    return {
      fingerprint: result.fingerprint,
      publicKey: new Uint8Array(result.publicKey),
      mnemonic: result.mnemonic
    }
  })

  ipcMain.handle(IPC.IDENTITY_UNLOCK, async (_event, passphrase: string): Promise<IdentityUnlockResult> => {
    const identity = queries.getIdentity()
    if (!identity) throw new Error('No local identity found')

    const result = unlockIdentity(
      identity.encrypted_private_key,
      identity.salt,
      identity.nonce,
      identity.public_key,
      passphrase
    )

    return {
      fingerprint: result.fingerprint,
      publicKey: new Uint8Array(result.publicKey)
    }
  })

  ipcMain.handle(IPC.AUTH_REGISTER, async (_event, displayName: string, setupToken?: string): Promise<RegisterResult> => {
    if (!currentServerUrl) throw new Error('Not connected to a server')

    const keys = getSessionKeys()
    if (!keys) throw new Error('Identity not unlocked')

    const identity = queries.getIdentity()
    if (!identity) throw new Error('No local identity found')

    const genesisSignature = signGenesis()
    const encryptedBlob = getEncryptedBlob(
      identity.encrypted_private_key,
      identity.salt,
      identity.nonce
    )

    const fingerprintBytes = computeFingerprintBytes(keys.publicKey)

    const body: Record<string, unknown> = {
      public_key: bufToHex(keys.publicKey),
      fingerprint: bufToHex(fingerprintBytes),
      display_name: displayName,
      encrypted_blob: bufToHex(encryptedBlob),
      genesis_signature: bufToHex(genesisSignature)
    }

    if (setupToken) {
      body.setup_token = setupToken
    }

    const result = await apiPost<RegisterResponseBody>(
      currentServerUrl,
      '/api/auth/register',
      body
    )

    storeTokens(result.access_token, result.refresh_token)

    // Save server info with user ID
    const existingServer = queries.getServerByUrl(currentServerUrl)
    if (existingServer) {
      queries.upsertServer({
        ...existingServer,
        user_id: result.user_id,
        display_name: displayName,
        last_connected: new Date().toISOString()
      })
    }

    return {
      userId: result.user_id,
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      isOwner: result.is_owner
    }
  })

  ipcMain.handle(IPC.AUTH_SIGN_CHALLENGE, async (_event, challenge: Uint8Array): Promise<Uint8Array> => {
    const signature = signChallenge(Buffer.from(challenge))
    return new Uint8Array(signature)
  })

  ipcMain.handle(IPC.TOTP_ENROLL, async (): Promise<TotpEnrollResult> => {
    if (!currentServerUrl || !currentAccessToken) {
      throw new Error('Not authenticated — connect and register first')
    }

    const result = await apiPost<TotpEnrollResponseBody>(
      currentServerUrl,
      '/api/auth/totp/enroll',
      {},
      currentAccessToken
    )

    return {
      secret: result.secret,
      otpauthUri: result.otpauth_uri
    }
  })

  ipcMain.handle(IPC.TOTP_VERIFY, async (_event, code: string): Promise<boolean> => {
    if (!currentServerUrl || !currentAccessToken) {
      throw new Error('Not authenticated')
    }

    // TOTP has two-step flow: /enroll then /confirm
    const result = await apiPost<TotpConfirmResponseBody>(
      currentServerUrl,
      '/api/auth/totp/confirm',
      { code },
      currentAccessToken
    )

    return result.valid
  })
}
