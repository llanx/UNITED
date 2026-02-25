import type { IpcMain } from 'electron'
import { IPC } from './channels'
import { getAccessToken, getServerUrl } from './auth'
import type {
  ChannelListResponse,
  ChannelResponse,
  CategoryResponse
} from '@shared/ipc-bridge'

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

export function registerChannelHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC.CHANNELS_FETCH, async (): Promise<ChannelListResponse> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiGet<ChannelListResponse>(url, '/api/channels', token)
  })

  ipcMain.handle(IPC.CHANNELS_CREATE, async (_event, name: string, channelType: string, categoryId: string): Promise<ChannelResponse> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiPost<ChannelResponse>(url, '/api/channels', {
      name,
      channel_type: channelType,
      category_id: categoryId
    }, token)
  })

  ipcMain.handle(IPC.CHANNELS_UPDATE, async (_event, id: string, name: string): Promise<ChannelResponse> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiPut<ChannelResponse>(url, `/api/channels/${id}`, { name }, token)
  })

  ipcMain.handle(IPC.CHANNELS_DELETE, async (_event, id: string): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiDelete(url, `/api/channels/${id}`, token)
  })

  ipcMain.handle(IPC.CHANNELS_REORDER, async (_event, channels: Array<{ id: string; position: number }>): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiPut<unknown>(url, '/api/channels/reorder', { channels }, token)
  })

  ipcMain.handle(IPC.CATEGORIES_CREATE, async (_event, name: string): Promise<CategoryResponse> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiPost<CategoryResponse>(url, '/api/categories', { name }, token)
  })

  ipcMain.handle(IPC.CATEGORIES_UPDATE, async (_event, id: string, name: string): Promise<CategoryResponse> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiPut<CategoryResponse>(url, `/api/categories/${id}`, { name }, token)
  })

  ipcMain.handle(IPC.CATEGORIES_DELETE, async (_event, id: string): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiDelete(url, `/api/categories/${id}`, token)
  })

  ipcMain.handle(IPC.CATEGORIES_REORDER, async (_event, categories: Array<{ id: string; position: number }>): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiPut<unknown>(url, '/api/categories/reorder', { categories }, token)
  })
}
