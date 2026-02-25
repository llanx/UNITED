import type { IpcMain } from 'electron'
import { IPC } from './channels'
import { getAccessToken, getServerUrl } from './auth'
import type { RoleResponse, MemberResponse } from '@shared/ipc-bridge'

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

export function registerRoleHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC.MEMBERS_FETCH, async (): Promise<MemberResponse[]> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiGet<MemberResponse[]>(url, '/api/members', token)
  })

  ipcMain.handle(IPC.ROLES_FETCH, async (): Promise<RoleResponse[]> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiGet<RoleResponse[]>(url, '/api/roles', token)
  })

  ipcMain.handle(IPC.ROLES_CREATE, async (_event, name: string, permissions: number, color?: string): Promise<RoleResponse> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    const body: Record<string, unknown> = { name, permissions }
    if (color) body.color = color

    return apiPost<RoleResponse>(url, '/api/roles', body, token)
  })

  ipcMain.handle(IPC.ROLES_UPDATE, async (_event, id: string, name?: string, permissions?: number, color?: string): Promise<RoleResponse> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    const body: Record<string, unknown> = {}
    if (name !== undefined) body.name = name
    if (permissions !== undefined) body.permissions = permissions
    if (color !== undefined) body.color = color

    return apiPut<RoleResponse>(url, `/api/roles/${id}`, body, token)
  })

  ipcMain.handle(IPC.ROLES_DELETE, async (_event, id: string): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiDelete(url, `/api/roles/${id}`, token)
  })

  ipcMain.handle(IPC.ROLES_ASSIGN, async (_event, userId: string, roleId: string): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiPost<unknown>(url, '/api/roles/assign', { user_id: userId, role_id: roleId }, token)
  })

  ipcMain.handle(IPC.ROLES_REMOVE, async (_event, userId: string, roleId: string): Promise<void> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    await apiPost<unknown>(url, '/api/roles/remove', { user_id: userId, role_id: roleId }, token)
  })

  ipcMain.handle(IPC.ROLES_GET_USER, async (_event, userId: string): Promise<RoleResponse[]> => {
    const url = getServerUrl()
    const token = getAccessToken()
    if (!url || !token) throw new Error('Not connected or not authenticated')

    return apiGet<RoleResponse[]>(url, `/api/roles/user/${userId}`, token)
  })
}
