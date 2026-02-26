/**
 * L0 in-memory block cache.
 *
 * Uses LRU eviction with a 256MB byte-size budget.
 * No TTL -- eviction is purely size-based.
 * Sits between the renderer and the on-disk encrypted block store
 * for fast repeated reads.
 */

import { LRUCache } from 'lru-cache'

// ============================================================
// Constants
// ============================================================

/** Default L0 cache size: 256 MB */
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024

// ============================================================
// Singleton cache
// ============================================================

let blockCache: LRUCache<string, Buffer> | null = null

/**
 * Create a new LRU block cache with byte-size tracking.
 */
export function createBlockCache(maxBytes: number = DEFAULT_MAX_BYTES): LRUCache<string, Buffer> {
  return new LRUCache<string, Buffer>({
    maxSize: maxBytes,
    sizeCalculation: (value: Buffer) => value.length,
  })
}

/**
 * Initialize the singleton block cache.
 * Call once during block store initialization.
 */
export function initBlockCache(maxBytes?: number): void {
  if (blockCache) {
    blockCache.clear()
  }
  blockCache = createBlockCache(maxBytes)
}

/**
 * Get the singleton block cache.
 * Returns null if not initialized.
 */
export function getBlockCache(): LRUCache<string, Buffer> | null {
  return blockCache
}

/**
 * Clear and destroy the singleton block cache.
 * Called during block store shutdown.
 */
export function clearBlockCache(): void {
  if (blockCache) {
    blockCache.clear()
    blockCache = null
  }
}
