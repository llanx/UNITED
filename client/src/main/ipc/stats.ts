/**
 * IPC handlers for network stats and storage usage.
 *
 * Provides:
 * - On-demand stats queries (STATS_GET_NETWORK, STATS_GET_STORAGE)
 * - Periodic push of network stats to renderer (every 5 seconds)
 *
 * Stats are private only -- never exposed to other users.
 */

import { app, ipcMain, type BrowserWindow } from 'electron'
import { getNetworkStats } from '../blocks/protocol'
import { getStorageUsage } from '../blocks/index'
import { IPC } from './channels'

let pushInterval: NodeJS.Timeout | null = null

/**
 * Register stats IPC handlers and start periodic push to renderer.
 *
 * @param mainWindow - The main BrowserWindow to push stats to
 */
export function registerStatsHandlers(mainWindow: BrowserWindow): void {
  // On-demand: get current network stats
  ipcMain.handle(IPC.STATS_GET_NETWORK, () => {
    return getNetworkStats()
  })

  // On-demand: get storage usage breakdown by tier
  ipcMain.handle(IPC.STATS_GET_STORAGE, () => {
    try {
      return getStorageUsage()
    } catch {
      // Block store may not be initialized yet
      return { total: 0, byTier: {} }
    }
  })

  // Periodic push: send network stats to renderer every 5 seconds
  pushInterval = setInterval(() => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.PUSH_NETWORK_STATS, getNetworkStats())
    }
  }, 5000)

  // Clean up interval on app quit
  app.on('before-quit', () => {
    if (pushInterval) {
      clearInterval(pushInterval)
      pushInterval = null
    }
  })
}
