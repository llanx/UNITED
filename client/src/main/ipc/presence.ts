/**
 * IPC handlers for presence and typing indicators.
 *
 * Handles user presence status updates and idle detection.
 * Uses Electron's powerMonitor for system idle time tracking.
 */

import { type IpcMain, powerMonitor } from 'electron'
import { IPC } from './channels'
import { getAccessToken, getServerUrl } from './auth'

// ============================================================
// HTTP helpers
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

// ============================================================
// Idle detection state
// ============================================================

/** 15 minutes in seconds */
const IDLE_THRESHOLD_SECONDS = 15 * 60

let idleCheckInterval: ReturnType<typeof setInterval> | null = null
let wasIdle = false
let manualStatus: string | null = null

/**
 * Start idle detection. Checks system idle time every 30 seconds.
 * When idle > 15 minutes, auto-sets status to 'away'.
 * When activity resumes, auto-sets back to 'online' (unless user manually set DND).
 */
function startIdleDetection(): void {
  if (idleCheckInterval) return

  idleCheckInterval = setInterval(() => {
    const idleSeconds = powerMonitor.getSystemIdleTime()

    if (idleSeconds >= IDLE_THRESHOLD_SECONDS && !wasIdle) {
      // User went idle -- auto-set to 'away' unless manually set to DND
      if (manualStatus !== 'dnd') {
        wasIdle = true
        sendPresenceUpdate('away').catch(err => {
          console.error('[Presence] Failed to auto-set away:', err)
        })
      }
    } else if (idleSeconds < IDLE_THRESHOLD_SECONDS && wasIdle) {
      // User resumed activity -- auto-set back to 'online' unless manually set to DND
      wasIdle = false
      if (manualStatus !== 'dnd' && manualStatus !== 'offline') {
        sendPresenceUpdate('online').catch(err => {
          console.error('[Presence] Failed to auto-set online:', err)
        })
      }
    }
  }, 30_000) // Check every 30 seconds
}

function stopIdleDetection(): void {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval)
    idleCheckInterval = null
  }
}

async function sendPresenceUpdate(status: string): Promise<void> {
  const url = getServerUrl()
  const token = getAccessToken()
  if (!url || !token) return

  try {
    await apiPost<unknown>(url, '/api/presence', { status }, token)
  } catch {
    // Silently fail -- presence updates are best-effort
  }
}

// ============================================================
// IPC handlers
// ============================================================

export interface PresenceState {
  userPubkey: string
  status: 'online' | 'away' | 'dnd' | 'offline'
  displayName: string
}

export function registerPresenceHandlers(ipcMain: IpcMain): void {
  // Set user presence status
  ipcMain.handle(IPC.PRESENCE_SET, async (
    _event,
    status: 'online' | 'away' | 'dnd' | 'offline'
  ): Promise<void> => {
    manualStatus = status
    await sendPresenceUpdate(status)
  })

  // Fetch all online users' presence
  ipcMain.handle(IPC.PRESENCE_FETCH, async (): Promise<PresenceState[]> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiGet<PresenceState[]>(url, '/api/presence', token)
  })

  // Start idle detection when presence handlers are registered
  startIdleDetection()
}

/**
 * Cleanup presence state on app shutdown.
 */
export function cleanupPresence(): void {
  stopIdleDetection()
  manualStatus = null
  wasIdle = false
}
