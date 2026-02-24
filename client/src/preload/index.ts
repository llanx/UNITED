import { contextBridge, ipcRenderer } from 'electron'
import type { UnitedAPI, ServerInfo, ServerSettings } from '@shared/ipc-bridge'
import type { ConnectionStatus } from '@shared/ws-protocol'
import { IPC } from '../main/ipc/channels'

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
  }
}

contextBridge.exposeInMainWorld('united', api)
