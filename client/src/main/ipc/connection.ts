import { BrowserWindow, type IpcMain } from 'electron'
import { IPC } from './channels'
import { wsClient } from '../ws/client'
import type { ConnectionStatus } from '../../../shared/types/ws-protocol'
import type { ConnectResult, ServerInfo, ServerSettings } from '../../../shared/types/ipc-bridge'

const MOCK_SERVER_INFO: ServerInfo = {
  name: 'Mock Server',
  description: 'Local development server',
  registrationMode: 'open',
  version: '0.1.0'
}

/**
 * Register connection and server IPC handlers.
 * 01-04: connectToServer returns mock data without opening a real WebSocket.
 * Real connections in 01-06.
 *
 * Also wires up wsClient events to push to all renderer windows.
 */
export function registerConnectionHandlers(ipcMain: IpcMain): void {
  // Forward WebSocket status changes to renderer
  wsClient.on('status', (status: ConnectionStatus) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.PUSH_CONNECTION_STATUS, status)
    }
  })

  wsClient.on('auth-error', (code: number, message: string) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.PUSH_AUTH_ERROR, code, message)
    }
  })

  // IPC handlers
  ipcMain.handle(IPC.AUTH_CONNECT, async (_event, _url: string): Promise<ConnectResult> => {
    // 01-04: Mock — does not actually connect WebSocket
    return {
      connected: true,
      serverInfo: MOCK_SERVER_INFO
    }
  })

  ipcMain.handle(IPC.SERVER_INFO, async (): Promise<ServerInfo> => {
    return MOCK_SERVER_INFO
  })

  ipcMain.handle(IPC.SERVER_UPDATE_SETTINGS, async (_event, settings: ServerSettings): Promise<ServerInfo> => {
    // 01-04: Mock — merge settings into mock info and return
    return {
      ...MOCK_SERVER_INFO,
      ...settings
    }
  })
}
