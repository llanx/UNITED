import type { IpcMain } from 'electron'
import { IPC } from './channels'
import { getAccessToken, getServerUrl, setServerUrl } from './auth'
import type {
  ChannelListResponse,
  RoleResponse
} from '@shared/ipc-bridge'
import type { JoinResult, InviteValidateResult } from '@shared/ipc-bridge'

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

// ============================================================
// Invite code validation
// ============================================================

const INVITE_CODE_REGEX = /^[a-zA-Z0-9]{8}$/

function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_REGEX.test(code)
}

/**
 * Parse an invite input which can be:
 * - A bare code: "abc12345"
 * - A full URL: "https://server.example.com:1984/invite/abc12345"
 * - A united:// deep link: "united://invite/abc12345?server=https://server.example.com:1984"
 *
 * Returns { serverUrl?: string, inviteCode: string }
 */
export function parseInviteInput(input: string): { serverUrl?: string; inviteCode: string } {
  const trimmed = input.trim()

  // Try parsing as united:// deep link
  if (trimmed.startsWith('united://')) {
    const url = new URL(trimmed)
    const pathParts = url.pathname.split('/').filter(Boolean)
    if (pathParts[0] === 'invite' && pathParts[1]) {
      return {
        serverUrl: url.searchParams.get('server') || undefined,
        inviteCode: pathParts[1]
      }
    }
  }

  // Try parsing as HTTP(S) URL with /invite/ path
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const pathParts = url.pathname.split('/').filter(Boolean)
      const inviteIndex = pathParts.indexOf('invite')
      if (inviteIndex >= 0 && pathParts[inviteIndex + 1]) {
        const serverUrl = `${url.protocol}//${url.host}`
        return {
          serverUrl,
          inviteCode: pathParts[inviteIndex + 1]
        }
      }
    }
  } catch {
    // Not a valid URL -- treat as bare code below
  }

  // Bare invite code
  return { inviteCode: trimmed }
}

// ============================================================
// IPC handlers
// ============================================================

export function registerInviteHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    IPC.INVITE_VALIDATE,
    async (_event, serverUrl: string, inviteCode: string): Promise<InviteValidateResult> => {
      if (!isValidInviteCode(inviteCode)) {
        return { valid: false }
      }

      try {
        const result = await apiGet<{ server_name?: string }>(
          serverUrl,
          `/api/invites/${inviteCode}`
        )
        return {
          valid: true,
          serverName: result.server_name
        }
      } catch (err) {
        // 404 or other error means invalid invite
        return { valid: false }
      }
    }
  )

  ipcMain.handle(
    IPC.INVITE_JOIN,
    async (_event, serverUrl: string, inviteCode: string): Promise<JoinResult> => {
      if (!isValidInviteCode(inviteCode)) {
        throw new Error('Invalid invite code format. Must be 8 alphanumeric characters.')
      }

      // Set the server URL so auth handlers can use it
      setServerUrl(serverUrl)

      // The actual registration with invite code is handled by the existing
      // auth:register flow -- the renderer will call register() with the invite code.
      // This handler fetches channels and roles after the user is authenticated.

      const token = getAccessToken()
      if (!token) {
        throw new Error('Not authenticated. Complete registration first.')
      }

      // Fetch channel list and role list after join
      const [channelList, roles] = await Promise.all([
        apiGet<ChannelListResponse>(serverUrl, '/api/channels', token),
        apiGet<RoleResponse[]>(serverUrl, '/api/roles', token)
      ])

      return {
        serverUrl,
        channels: channelList,
        roles
      }
    }
  )
}
