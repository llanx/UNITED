import { contextBridge, ipcRenderer } from 'electron'
import type { UnitedAPI, ServerInfo, ServerSettings, StorageAPI, ChannelEvent, RoleEvent } from '@shared/ipc-bridge'
import type { ConnectionStatus } from '@shared/ws-protocol'
import { IPC } from '../main/ipc/channels'

const storageApi: StorageAPI = {
  hasIdentity: () =>
    ipcRenderer.invoke(IPC.STORAGE_HAS_IDENTITY),

  getActiveServer: () =>
    ipcRenderer.invoke(IPC.STORAGE_GET_ACTIVE_SERVER),

  getChannels: (serverId: string) =>
    ipcRenderer.invoke(IPC.STORAGE_GET_CHANNELS, serverId),

  getCachedState: <T>(key: string) =>
    ipcRenderer.invoke(IPC.STORAGE_GET_CACHED_STATE, key) as Promise<T | null>,

  setCachedState: (key: string, value: unknown) =>
    ipcRenderer.invoke(IPC.STORAGE_SET_CACHED_STATE, key, value),
}

const api: UnitedAPI = {
  // Identity
  createIdentity: (passphrase: string) =>
    ipcRenderer.invoke(IPC.IDENTITY_CREATE, passphrase),

  recoverFromMnemonic: (words: string[], passphrase: string) =>
    ipcRenderer.invoke(IPC.IDENTITY_RECOVER, words, passphrase),

  unlockIdentity: (passphrase: string) =>
    ipcRenderer.invoke(IPC.IDENTITY_UNLOCK, passphrase),

  // Connection & Auth
  connectToServer: (url: string) =>
    ipcRenderer.invoke(IPC.AUTH_CONNECT, url),

  register: (displayName: string, setupToken?: string) =>
    ipcRenderer.invoke(IPC.AUTH_REGISTER, displayName, setupToken),

  signChallenge: (challenge: Uint8Array) =>
    ipcRenderer.invoke(IPC.AUTH_SIGN_CHALLENGE, challenge),

  // TOTP
  enrollTotp: () =>
    ipcRenderer.invoke(IPC.TOTP_ENROLL),

  verifyTotp: (code: string) =>
    ipcRenderer.invoke(IPC.TOTP_VERIFY, code),

  // Server
  getServerInfo: () =>
    ipcRenderer.invoke(IPC.SERVER_INFO),

  updateServerSettings: (settings: ServerSettings) =>
    ipcRenderer.invoke(IPC.SERVER_UPDATE_SETTINGS, settings),

  // Channels
  channels: {
    fetch: () => ipcRenderer.invoke(IPC.CHANNELS_FETCH),
    create: (name: string, channelType: string, categoryId: string) =>
      ipcRenderer.invoke(IPC.CHANNELS_CREATE, name, channelType, categoryId),
    update: (id: string, name: string) =>
      ipcRenderer.invoke(IPC.CHANNELS_UPDATE, id, name),
    delete: (id: string) =>
      ipcRenderer.invoke(IPC.CHANNELS_DELETE, id),
    reorder: (channels: Array<{ id: string; position: number }>) =>
      ipcRenderer.invoke(IPC.CHANNELS_REORDER, channels),
  },

  // Categories
  categories: {
    create: (name: string) => ipcRenderer.invoke(IPC.CATEGORIES_CREATE, name),
    delete: (id: string) => ipcRenderer.invoke(IPC.CATEGORIES_DELETE, id),
  },

  // Roles
  roles: {
    fetch: () => ipcRenderer.invoke(IPC.ROLES_FETCH),
    create: (name: string, permissions: number, color?: string) =>
      ipcRenderer.invoke(IPC.ROLES_CREATE, name, permissions, color),
    update: (id: string, name?: string, permissions?: number, color?: string) =>
      ipcRenderer.invoke(IPC.ROLES_UPDATE, id, name, permissions, color),
    delete: (id: string) => ipcRenderer.invoke(IPC.ROLES_DELETE, id),
    assign: (userId: string, roleId: string) =>
      ipcRenderer.invoke(IPC.ROLES_ASSIGN, userId, roleId),
    remove: (userId: string, roleId: string) =>
      ipcRenderer.invoke(IPC.ROLES_REMOVE, userId, roleId),
    getUserRoles: (userId: string) =>
      ipcRenderer.invoke(IPC.ROLES_GET_USER, userId),
  },

  // Device Provisioning (SEC-12)
  provisioning: {
    startProvisioning: () =>
      ipcRenderer.invoke(IPC.PROVISIONING_START),

    cancelProvisioning: () =>
      ipcRenderer.invoke(IPC.PROVISIONING_CANCEL),

    receiveProvisioning: (qrPayload: string) =>
      ipcRenderer.invoke(IPC.PROVISIONING_RECEIVE, qrPayload),
  },

  // Storage
  storage: storageApi,

  // Push events (main -> renderer)
  onConnectionStatus: (callback: (status: ConnectionStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ConnectionStatus) =>
      callback(status)
    ipcRenderer.on(IPC.PUSH_CONNECTION_STATUS, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_CONNECTION_STATUS, listener) }
  },

  onAuthError: (callback: (code: number, message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, code: number, message: string) =>
      callback(code, message)
    ipcRenderer.on(IPC.PUSH_AUTH_ERROR, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_AUTH_ERROR, listener) }
  },

  onServerInfoUpdate: (callback: (info: ServerInfo) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: ServerInfo) =>
      callback(info)
    ipcRenderer.on(IPC.PUSH_SERVER_INFO_UPDATE, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_SERVER_INFO_UPDATE, listener) }
  },

  onChannelEvent: (callback: (event: ChannelEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ChannelEvent) =>
      callback(data)
    ipcRenderer.on(IPC.PUSH_CHANNEL_EVENT, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_CHANNEL_EVENT, listener) }
  },

  onRoleEvent: (callback: (event: RoleEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: RoleEvent) =>
      callback(data)
    ipcRenderer.on(IPC.PUSH_ROLE_EVENT, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_ROLE_EVENT, listener) }
  }
}

contextBridge.exposeInMainWorld('united', api)
