/**
 * Tier-based eviction sweep for the block store.
 *
 * Runs every 60 seconds. Evicts blocks in tier order (P4 first, then P3, then P2)
 * using LRU within each tier. P1 blocks are never evicted.
 * Budget is the hard limit; TTL is best-effort per CONTEXT.md.
 */

import { getDb } from '../db/schema'
import { deleteBlock } from './store'
import { ContentTier } from './types'

// ============================================================
// Eviction sweep
// ============================================================

/**
 * Start the periodic eviction sweep.
 * Returns the interval timer for cleanup on shutdown.
 */
export function startEvictionSweep(budgetBytes: number): NodeJS.Timeout {
  // Run immediately on start, then every 60 seconds
  runEvictionSweep(budgetBytes)
  return setInterval(() => runEvictionSweep(budgetBytes), 60_000)
}

/**
 * Stop the eviction sweep timer.
 */
export function stopEvictionSweep(timer: NodeJS.Timeout): void {
  clearInterval(timer)
}

/**
 * Run a single eviction sweep pass.
 */
function runEvictionSweep(budgetBytes: number): void {
  try {
    const db = getDb()

    // 1. Calculate P1 usage (never evict)
    const p1Row = db.prepare(
      'SELECT COALESCE(SUM(size), 0) as total FROM block_meta WHERE tier = ?'
    ).get(ContentTier.P1_NEVER_EVICT) as { total: number }
    const p1Usage = p1Row.total

    // 2. Calculate total usage
    const totalRow = db.prepare(
      'SELECT COALESCE(SUM(size), 0) as total FROM block_meta'
    ).get() as { total: number }
    const totalUsage = totalRow.total

    // 3. Calculate evictable budget and usage
    const evictableBudget = Math.max(0, budgetBytes - p1Usage)
    const evictableUsage = totalUsage - p1Usage

    // 4. If under budget, nothing to do
    if (evictableUsage <= evictableBudget) return

    // 5. Calculate how much to free
    let toFree = evictableUsage - evictableBudget

    // 6. Evict in tier order: P4 first, then P3, then P2
    const evictionTiers = [
      ContentTier.P4_ALTRUISTIC,
      ContentTier.P3_WARM,
      ContentTier.P2_HOT
    ]

    for (const tier of evictionTiers) {
      if (toFree <= 0) break

      // Query blocks in this tier, LRU order (oldest access first)
      const blocks = db.prepare(
        'SELECT hash, size FROM block_meta WHERE tier = ? ORDER BY last_accessed_at ASC'
      ).all(tier) as Array<{ hash: string; size: number }>

      for (const block of blocks) {
        if (toFree <= 0) break
        deleteBlock(block.hash)
        toFree -= block.size
      }
    }
  } catch {
    // Eviction sweep failure should not crash the app
    // Silently skip this sweep cycle
  }
}

/**
 * Check TTL expiry and downgrade/delete expired blocks.
 * Called within eviction sweep for best-effort TTL enforcement.
 *
 * - P3_WARM blocks past TTL are downgraded to P4_ALTRUISTIC
 * - P4_ALTRUISTIC blocks past TTL are deleted if budget is tight
 */
export function checkTtlExpiry(warmTtlDays: number): void {
  try {
    const db = getDb()

    // Downgrade expired P3_WARM to P4_ALTRUISTIC
    db.prepare(`
      UPDATE block_meta SET tier = ?
      WHERE tier = ?
      AND datetime(created_at, '+' || ? || ' days') < datetime('now')
    `).run(
      ContentTier.P4_ALTRUISTIC,
      ContentTier.P3_WARM,
      warmTtlDays
    )

    // Delete expired P4_ALTRUISTIC blocks
    const expiredP4 = db.prepare(`
      SELECT hash FROM block_meta
      WHERE tier = ?
      AND datetime(created_at, '+' || ? || ' days') < datetime('now')
    `).all(ContentTier.P4_ALTRUISTIC, warmTtlDays) as Array<{ hash: string }>

    for (const block of expiredP4) {
      deleteBlock(block.hash)
    }
  } catch {
    // TTL check failure should not crash the app
  }
}
