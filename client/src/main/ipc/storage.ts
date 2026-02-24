import type { IpcMain } from 'electron'
import { IPC } from './channels'
import * as queries from '../db/queries'

/**
 * Register storage/database IPC handlers.
 * These wrap the typed query functions from db/queries.ts.
 */
export function registerStorageHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC.STORAGE_HAS_IDENTITY, async (): Promise<boolean> => {
    return queries.hasIdentity()
  })

  ipcMain.handle(IPC.STORAGE_GET_ACTIVE_SERVER, async (): Promise<queries.ServerRow | null> => {
    return queries.getActiveServer()
  })

  ipcMain.handle(IPC.STORAGE_GET_CHANNELS, async (_event, serverId: string): Promise<queries.ChannelRow[]> => {
    return queries.getChannels(serverId)
  })

  ipcMain.handle(IPC.STORAGE_GET_CACHED_STATE, async (_event, key: string): Promise<unknown> => {
    return queries.getCachedState(key)
  })

  ipcMain.handle(IPC.STORAGE_SET_CACHED_STATE, async (_event, key: string, value: unknown): Promise<void> => {
    queries.setCachedState(key, value)
  })
}
