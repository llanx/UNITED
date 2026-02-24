import { BrowserWindow, type IpcMain } from 'electron'
import { IPC } from './channels'
import { wsClient } from '../ws/client'
import {
  getAccessToken,
  getServerUrl,
  setServerUrl,
  refreshTokens
} from './auth'
import {
  getSessionKeys,
  bufToHex,
  hexToBuf,
  signChallenge,
  computeFingerprint,
  computeFingerprintBytes
} from './crypto'
import * as queries from '../db/queries'
import type { ConnectionStatus } from '@shared/ws-protocol'
import { WS_CLOSE_CODES } from '@shared/ws-protocol'
import type { ConnectResult, ServerInfo, ServerSettings } from '@shared/ipc-bridge'
import type {
  ServerInfoResponseBody,
  UpdateSettingsResponseBody,
  ChallengeResponseBody,
  VerifyResponseBody
} from '@shared/api'

// ============================================================
// HTTP helpers (main process only — CSP blocks renderer HTTP)
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

async function apiPut<T>(url: string, path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${url}${path}`, {
    method: 'PUT',
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
// Challenge-response authentication
// ============================================================

async function performChallengeResponse(serverUrl: string): Promise<{ accessToken: string; refreshToken: string }> {
  const keys = getSessionKeys()
  if (!keys) throw new Error('Identity not unlocked')

  // Step 1: Request challenge (empty body)
  const challenge = await apiPost<ChallengeResponseBody>(
    serverUrl,
    '/api/auth/challenge',
    {}
  )

  // Step 2: Sign challenge bytes
  const challengeBytes = hexToBuf(challenge.challenge_bytes)
  const signature = signChallenge(challengeBytes)
  const fingerprint = computeFingerprint(keys.publicKey)

  // Step 3: Verify signature
  const result = await apiPost<VerifyResponseBody>(
    serverUrl,
    '/api/auth/verify',
    {
      challenge_id: challenge.challenge_id,
      public_key: bufToHex(keys.publicKey),
      signature: bufToHex(signature),
      fingerprint: bufToHex(computeFingerprintBytes(keys.publicKey))
    }
  )

  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token
  }
}

// ============================================================
// WebSocket connection with JWT auth
// ============================================================

function connectWebSocket(serverUrl: string, token: string): void {
  // Convert http(s) URL to ws(s) URL
  const wsUrl = serverUrl
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:')

  wsClient.connect(`${wsUrl}/ws?token=${encodeURIComponent(token)}`)
}

// ============================================================
// IPC handlers
// ============================================================

export function registerConnectionHandlers(ipcMain: IpcMain): void {
  // Forward WebSocket status changes to renderer
  wsClient.on('status', (status: ConnectionStatus) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.PUSH_CONNECTION_STATUS, status)
    }
  })

  wsClient.on('auth-error', async (code: number, message: string) => {
    // Handle token expired — attempt silent refresh
    if (code === WS_CLOSE_CODES.TOKEN_EXPIRED) {
      const refreshed = await refreshTokens()
      if (refreshed) {
        const token = getAccessToken()
        const url = getServerUrl()
        if (token && url) {
          connectWebSocket(url, token)
          return // Don't propagate the error — we're reconnecting
        }
      }
    }

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.PUSH_AUTH_ERROR, code, message)
    }
  })

  // Connect to server: fetch info, optionally authenticate
  ipcMain.handle(IPC.AUTH_CONNECT, async (_event, url: string): Promise<ConnectResult> => {
    // Normalize URL (remove trailing slash)
    const normalizedUrl = url.replace(/\/+$/, '')
    setServerUrl(normalizedUrl)

    // Fetch server info via REST
    const info = await apiGet<ServerInfoResponseBody>(normalizedUrl, '/api/server/info')

    const serverInfo: ServerInfo = {
      name: info.name,
      description: info.description,
      registrationMode: info.registration_mode,
      version: info.version
    }

    // Cache server info in SQLite
    const serverId = normalizedUrl // Use URL as server ID until we get a real one
    queries.upsertServer({
      id: serverId,
      url: normalizedUrl,
      name: info.name,
      description: info.description,
      icon_data: null,
      registration_mode: info.registration_mode,
      last_connected: new Date().toISOString(),
      display_name: null,
      user_id: null
    })
    queries.setCachedState('active_server_id', serverId)

    return { connected: true, serverInfo }
  })

  // Get server info
  ipcMain.handle(IPC.SERVER_INFO, async (): Promise<ServerInfo> => {
    const url = getServerUrl()
    if (!url) throw new Error('Not connected to a server')

    const info = await apiGet<ServerInfoResponseBody>(url, '/api/server/info')
    return {
      name: info.name,
      description: info.description,
      registrationMode: info.registration_mode,
      version: info.version
    }
  })

  // Update server settings (admin only)
  ipcMain.handle(IPC.SERVER_UPDATE_SETTINGS, async (_event, settings: ServerSettings): Promise<ServerInfo> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    const body: Record<string, unknown> = {}
    if (settings.name !== undefined) body.name = settings.name
    if (settings.description !== undefined) body.description = settings.description
    if (settings.registrationMode !== undefined) body.registration_mode = settings.registrationMode

    const result = await apiPut<UpdateSettingsResponseBody>(
      url,
      '/api/server/settings',
      body,
      token
    )

    const updatedInfo: ServerInfo = {
      name: result.name,
      description: result.description,
      registrationMode: result.registration_mode,
      version: '' // Not returned by update endpoint
    }

    // Push update to all renderer windows
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.PUSH_SERVER_INFO_UPDATE, updatedInfo)
    }

    // Update SQLite cache
    const serverId = url
    const existing = queries.getServer(serverId)
    if (existing) {
      queries.upsertServer({
        ...existing,
        name: result.name,
        description: result.description,
        registration_mode: result.registration_mode
      })
    }

    return updatedInfo
  })
}
