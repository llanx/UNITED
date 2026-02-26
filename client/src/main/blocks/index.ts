/**
 * Block store public API.
 *
 * Orchestrates initialization, block operations, eviction, and shutdown.
 * All external code should import from this module, not from individual
 * submodules (store.ts, crypto.ts, etc.).
 */

import { initBlockStoreKey, clearBlockStoreKey } from './crypto'
import { initBlockCache, clearBlockCache } from './cache'
import {
  initBlockStore as initBlockStoreTables,
  getBlockStoreSalt,
  putBlock as storePutBlock,
  getLocalBlock as storeGetLocalBlock,
  hasBlock as storeHasBlock,
  deleteBlock as storeDeleteBlock,
  getStorageUsage as storeGetStorageUsage,
  getConfig as storeGetConfig,
  setConfig as storeSetConfig,
} from './store'
import { startEvictionSweep, stopEvictionSweep, checkTtlExpiry } from './tiers'
import { resolveBlock, resolveBlockWithProgress } from './cascade'
import type { BlockMeta, BlockStoreConfig } from './types'
import type { ContentTier } from './types'

// ============================================================
// Module state
// ============================================================

let evictionTimer: NodeJS.Timeout | null = null
let initialized = false

// ============================================================
// Lifecycle
// ============================================================

/**
 * Initialize the block store.
 * Creates tables and directories, derives encryption key, starts eviction.
 * Must be called after DB init and identity unlock.
 *
 * @param passphrase - User passphrase for key derivation
 */
export function init(passphrase: string): void {
  if (initialized) return

  // Initialize DB tables and blocks directory
  initBlockStoreTables()

  // Derive block store key from passphrase and dedicated salt
  const salt = getBlockStoreSalt()
  initBlockStoreKey(passphrase, salt)

  // Initialize L0 in-memory cache
  initBlockCache()

  // Start eviction sweep
  const config = storeGetConfig()
  evictionTimer = startEvictionSweep(config.budgetBytes)

  // Run TTL check on init
  checkTtlExpiry(config.warmTtlDays)

  initialized = true
}

/**
 * Shut down the block store.
 * Stops eviction sweep, zeroes encryption key, clears cache.
 */
export function shutdown(): void {
  if (evictionTimer) {
    stopEvictionSweep(evictionTimer)
    evictionTimer = null
  }

  clearBlockStoreKey()
  clearBlockCache()
  initialized = false
}

/**
 * Restart the eviction sweep with a new budget.
 * Called when config is updated.
 */
export function restartEviction(): void {
  if (evictionTimer) {
    stopEvictionSweep(evictionTimer)
  }
  const config = storeGetConfig()
  evictionTimer = startEvictionSweep(config.budgetBytes)
}

// ============================================================
// Block operations (delegates to store.ts)
// ============================================================

export function putBlock(
  data: Buffer,
  tier: ContentTier,
  meta?: Partial<BlockMeta>
): string {
  return storePutBlock(data, tier, meta)
}

export function getLocalBlock(hash: string): Buffer | null {
  return storeGetLocalBlock(hash)
}

export function hasBlock(hash: string): boolean {
  return storeHasBlock(hash)
}

export function deleteBlock(hash: string): void {
  storeDeleteBlock(hash)
}

export function getStorageUsage(): { total: number; byTier: Record<number, number> } {
  return storeGetStorageUsage()
}

export function getConfig(): BlockStoreConfig {
  return storeGetConfig()
}

export function setConfig(config: Partial<BlockStoreConfig>): void {
  storeSetConfig(config)
}

// ============================================================
// Content resolution (cascade)
// ============================================================

/**
 * Retrieve a block by hash through the 5-layer cache cascade.
 *
 * This is THE canonical way to retrieve content. It transparently tries:
 * L0 memory -> L1 local store -> L2 hot peers -> L3 peer directory -> L4 server
 *
 * @param hash - SHA-256 hex hash of the block
 * @returns Block data as Buffer, or null if content is unavailable
 */
export async function getBlock(hash: string): Promise<Buffer | null> {
  return resolveBlock(hash)
}

// Re-export cascade functions for advanced use
export { resolveBlock, resolveBlockWithProgress }
