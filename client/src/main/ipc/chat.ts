/**
 * IPC handlers for chat message operations.
 *
 * Handles send, fetch history, edit, delete, reactions, and last-read tracking.
 * All REST calls go through the main process (CSP blocks renderer HTTP).
 */

import type { IpcMain } from 'electron'
import { IPC } from './channels'
import { getAccessToken, getServerUrl } from './auth'
import type { ChatMessage, ChatHistoryResponse, ReactionSummary } from '@shared/ipc-bridge'

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

async function apiDelete(url: string, path: string, token?: string): Promise<void> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${url}${path}`, { method: 'DELETE', headers })
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`API ${path} failed (${response.status}): ${errorText}`)
  }
}

// ============================================================
// IPC handlers
// ============================================================

export function registerChatHandlers(ipcMain: IpcMain): void {
  // Send a message to a channel
  ipcMain.handle(IPC.CHAT_SEND, async (
    _event,
    channelId: string,
    content: string,
    replyToId?: string
  ): Promise<ChatMessage> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    const body: Record<string, unknown> = { content }
    if (replyToId) body.reply_to_id = replyToId

    const raw = await apiPost<ChatMessage & { block_refs_json?: string | null }>(
      url,
      `/api/channels/${channelId}/messages`,
      body,
      token
    )
    return {
      ...raw,
      block_refs: raw.block_refs_json
        ? JSON.parse(raw.block_refs_json)
        : undefined,
    }
  })

  // Fetch paginated message history
  ipcMain.handle(IPC.CHAT_FETCH_HISTORY, async (
    _event,
    channelId: string,
    beforeSequence?: number,
    limit?: number
  ): Promise<ChatHistoryResponse> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    const params = new URLSearchParams()
    if (beforeSequence !== undefined) params.set('before', String(beforeSequence))
    if (limit !== undefined) params.set('limit', String(limit))
    const qs = params.toString()
    const path = `/api/channels/${channelId}/messages${qs ? `?${qs}` : ''}`

    const raw = await apiGet<{ messages: Array<ChatMessage & { block_refs_json?: string | null }>; has_more: boolean }>(url, path, token)
    return {
      ...raw,
      messages: raw.messages.map(msg => ({
        ...msg,
        block_refs: msg.block_refs_json
          ? JSON.parse(msg.block_refs_json)
          : undefined,
      }))
    }
  })

  // Edit a message
  ipcMain.handle(IPC.CHAT_EDIT, async (
    _event,
    channelId: string,
    messageId: string,
    newContent: string
  ): Promise<ChatMessage> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiPut<ChatMessage>(
      url,
      `/api/channels/${channelId}/messages/${messageId}`,
      { content: newContent },
      token
    )
  })

  // Delete a message
  ipcMain.handle(IPC.CHAT_DELETE, async (
    _event,
    channelId: string,
    messageId: string
  ): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiDelete(url, `/api/channels/${channelId}/messages/${messageId}`, token)
  })

  // Add a reaction
  ipcMain.handle(IPC.REACTIONS_ADD, async (
    _event,
    messageId: string,
    emoji: string
  ): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiPost<unknown>(
      url,
      `/api/messages/${messageId}/reactions`,
      { emoji },
      token
    )
  })

  // Remove a reaction
  ipcMain.handle(IPC.REACTIONS_REMOVE, async (
    _event,
    messageId: string,
    emoji: string
  ): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiDelete(
      url,
      `/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      token
    )
  })

  // Fetch reactions for a message
  ipcMain.handle(IPC.REACTIONS_FETCH, async (
    _event,
    messageId: string
  ): Promise<ReactionSummary[]> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiGet<ReactionSummary[]>(
      url,
      `/api/messages/${messageId}/reactions`,
      token
    )
  })

  // Update last-read position for a channel
  ipcMain.handle(IPC.LAST_READ_UPDATE, async (
    _event,
    channelId: string,
    lastSequence: number
  ): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiPut<unknown>(
      url,
      `/api/channels/${channelId}/last-read`,
      { last_sequence: lastSequence },
      token
    )
  })

  // Fetch last-read position for a channel
  ipcMain.handle(IPC.LAST_READ_FETCH, async (
    _event,
    channelId: string
  ): Promise<{ last_sequence: number }> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiGet<{ last_sequence: number }>(
      url,
      `/api/channels/${channelId}/last-read`,
      token
    )
  })
}
