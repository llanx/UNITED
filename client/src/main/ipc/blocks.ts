/**
 * IPC handlers for block store operations.
 *
 * Bridges the renderer process to the block store via typed IPC channels.
 * All block data is transferred as base64 strings across the IPC boundary.
 */

import type { IpcMain } from 'electron'
import { IPC } from './channels'
import {
  putBlock,
  getLocalBlock,
  hasBlock,
  deleteBlock,
  getStorageUsage,
  getConfig,
  setConfig,
  restartEviction,
  getBlock
} from '../blocks/index'
import type { ContentTier } from '../blocks/types'
import type { BlockMeta } from '../blocks/types'

export function registerBlockHandlers(ipcMain: IpcMain): void {
  // Store a block (data as base64 from renderer)
  ipcMain.handle(IPC.BLOCK_PUT, async (
    _event,
    dataBase64: string,
    tier: ContentTier,
    meta?: Partial<BlockMeta>
  ): Promise<string> => {
    const data = Buffer.from(dataBase64, 'base64')
    return putBlock(data, tier, meta)
  })

  // Retrieve a block (returns base64 or null)
  ipcMain.handle(IPC.BLOCK_GET, async (
    _event,
    hash: string
  ): Promise<string | null> => {
    const data = getLocalBlock(hash)
    return data ? data.toString('base64') : null
  })

  // Check if block exists
  ipcMain.handle(IPC.BLOCK_HAS, async (
    _event,
    hash: string
  ): Promise<boolean> => {
    return hasBlock(hash)
  })

  // Delete a block
  ipcMain.handle(IPC.BLOCK_DELETE, async (
    _event,
    hash: string
  ): Promise<void> => {
    deleteBlock(hash)
  })

  // Get storage usage stats
  ipcMain.handle(IPC.BLOCK_STORAGE_USAGE, async (): Promise<{ total: number; byTier: Record<number, number> }> => {
    return getStorageUsage()
  })

  // Get block store config
  ipcMain.handle(IPC.BLOCK_GET_CONFIG, async (): Promise<{ budgetBytes: number; warmTtlDays: number }> => {
    return getConfig()
  })

  // Update block store config
  ipcMain.handle(IPC.BLOCK_SET_CONFIG, async (
    _event,
    config: Partial<{ budgetBytes: number; warmTtlDays: number }>
  ): Promise<void> => {
    setConfig(config)
    restartEviction()
  })

  // Resolve a block via the 5-layer cache cascade (returns base64 or null)
  // This is the primary IPC method for the renderer to request content.
  // Transparently cascades: L0 memory -> L1 local -> L2 hot peers -> L3 peer directory -> L4 server
  ipcMain.handle(IPC.BLOCK_RESOLVE, async (
    _event,
    hash: string
  ): Promise<string | null> => {
    const data = await getBlock(hash)
    return data ? data.toString('base64') : null
  })
}
