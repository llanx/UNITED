/**
 * File-based encrypted block store.
 *
 * Blocks are stored as individual encrypted files in {userData}/blocks/.
 * Metadata (hash, size, tier, access times) is stored in SQLite.
 * All reads/writes go through AES-256-GCM encryption (XChaCha20 fallback).
 * L0 in-memory cache provides fast repeated reads.
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type Database from 'better-sqlite3'
import { getDb } from '../db/schema'
import {
  computeBlockHash,
  encryptBlock,
  decryptBlock,
  getBlockStoreKey
} from './crypto'
import { getBlockCache } from './cache'
import type { BlockMeta, BlockStoreConfig, ContentTier } from './types'
import { DEFAULT_BUDGET_BYTES, DEFAULT_WARM_TTL_DAYS } from './types'

// ============================================================
// Block directory
// ============================================================

let blocksDir: string = ''

function getBlocksDir(): string {
  if (!blocksDir) {
    blocksDir = path.join(app.getPath('userData'), 'blocks')
  }
  return blocksDir
}

function blockFilePath(hash: string): string {
  // Use first 2 chars as subdirectory for filesystem performance
  const subdir = hash.substring(0, 2)
  return path.join(getBlocksDir(), subdir, hash)
}

function ensureBlockDir(hash: string): void {
  const subdir = hash.substring(0, 2)
  const dir = path.join(getBlocksDir(), subdir)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// ============================================================
// Initialization
// ============================================================

/**
 * Initialize the block store: create tables, directories, and salt.
 * Must be called after DB is initialized and before any block operations.
 */
export function initBlockStore(): void {
  const db = getDb()
  const dir = getBlocksDir()

  // Create blocks directory
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Tables created by Migration 2 in db/schema.ts.
  // Generate block_store_salt on first use
  const saltRow = db.prepare('SELECT value FROM block_store_config WHERE key = ?').get('block_store_salt') as { value: string } | undefined
  if (!saltRow) {
    const salt = Buffer.alloc(16)
    // Use sodium for cryptographic random bytes
    const sodium = require('sodium-native')
    sodium.randombytes_buf(salt)
    db.prepare('INSERT INTO block_store_config (key, value) VALUES (?, ?)').run('block_store_salt', salt.toString('hex'))
  }
}

/**
 * Get the block store salt from the database.
 * Returns a 16-byte Buffer.
 */
export function getBlockStoreSalt(): Buffer {
  const db = getDb()
  const row = db.prepare('SELECT value FROM block_store_config WHERE key = ?').get('block_store_salt') as { value: string } | undefined
  if (!row) {
    throw new Error('Block store salt not found -- call initBlockStore() first')
  }
  return Buffer.from(row.value, 'hex')
}

// ============================================================
// Block operations
// ============================================================

/**
 * Store a block. Computes hash, encrypts, writes to disk, stores metadata.
 * Deduplicates: if block already exists, may upgrade tier and touch access time.
 * Returns the content-address hash.
 */
export function putBlock(
  data: Buffer,
  tier: ContentTier,
  meta?: Partial<BlockMeta>
): string {
  const hash = computeBlockHash(data)
  const db = getDb()
  const key = getBlockStoreKey()

  // Check if already exists (dedup)
  const existing = db.prepare('SELECT hash, tier FROM block_meta WHERE hash = ?').get(hash) as { hash: string; tier: number } | undefined
  if (existing) {
    // Maybe upgrade tier (lower number = higher priority)
    if (tier < existing.tier) {
      db.prepare('UPDATE block_meta SET tier = ? WHERE hash = ?').run(tier, hash)
    }
    // Touch access time
    touchAccess(hash)

    // Update L0 cache
    const cache = getBlockCache()
    if (cache) {
      cache.set(hash, data)
    }

    return hash
  }

  // Encrypt and write to disk
  if (!key) {
    throw new Error('Block store key not available -- identity not unlocked')
  }

  const encrypted = encryptBlock(data, key)
  ensureBlockDir(hash)
  fs.writeFileSync(blockFilePath(hash), encrypted)

  // Insert metadata
  db.prepare(`
    INSERT INTO block_meta (hash, size, tier, mime_type, width, height, filename)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    hash,
    data.length,
    tier,
    meta?.mimeType ?? null,
    meta?.width ?? null,
    meta?.height ?? null,
    meta?.filename ?? null
  )

  // Update L0 cache
  const cache = getBlockCache()
  if (cache) {
    cache.set(hash, data)
  }

  return hash
}

/**
 * Retrieve a block by hash. Checks L0 cache first, then reads and decrypts from disk.
 * Returns null if block does not exist.
 */
export function getLocalBlock(hash: string): Buffer | null {
  // Check L0 cache first
  const cache = getBlockCache()
  if (cache) {
    const cached = cache.get(hash)
    if (cached) {
      touchAccess(hash)
      return cached
    }
  }

  // Check metadata exists
  const db = getDb()
  const row = db.prepare('SELECT hash FROM block_meta WHERE hash = ?').get(hash) as { hash: string } | undefined
  if (!row) return null

  // Read and decrypt from disk
  const filePath = blockFilePath(hash)
  if (!fs.existsSync(filePath)) return null

  const key = getBlockStoreKey()
  if (!key) return null

  try {
    const encrypted = fs.readFileSync(filePath)
    const data = decryptBlock(encrypted, key)

    // Update L0 cache
    if (cache) {
      cache.set(hash, data)
    }

    // Touch access time
    touchAccess(hash)

    return data
  } catch {
    // Decryption failure or corrupt file
    return null
  }
}

/**
 * Check if a block exists in the store (metadata check only).
 */
export function hasBlock(hash: string): boolean {
  const db = getDb()
  const row = db.prepare('SELECT 1 FROM block_meta WHERE hash = ?').get(hash)
  return row !== undefined
}

/**
 * Delete a block: remove file, metadata, and L0 cache entry.
 */
export function deleteBlock(hash: string): void {
  const db = getDb()

  // Remove from L0 cache
  const cache = getBlockCache()
  if (cache) {
    cache.delete(hash)
  }

  // Delete file
  const filePath = blockFilePath(hash)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }

  // Delete metadata
  db.prepare('DELETE FROM block_meta WHERE hash = ?').run(hash)
}

/**
 * Update the last_accessed_at timestamp for a block.
 */
export function touchAccess(hash: string): void {
  const db = getDb()
  db.prepare("UPDATE block_meta SET last_accessed_at = datetime('now') WHERE hash = ?").run(hash)
}

/**
 * Upgrade a block's tier if the new tier is higher priority (lower number).
 */
export function maybeUpgradeTier(hash: string, newTier: ContentTier): void {
  const db = getDb()
  db.prepare('UPDATE block_meta SET tier = ? WHERE hash = ? AND tier > ?').run(newTier, hash, newTier)
}

/**
 * Get total storage usage and breakdown by tier.
 */
export function getStorageUsage(): { total: number; byTier: Record<number, number> } {
  const db = getDb()
  const rows = db.prepare('SELECT tier, SUM(size) as total FROM block_meta GROUP BY tier').all() as Array<{ tier: number; total: number }>

  const byTier: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  let total = 0

  for (const row of rows) {
    byTier[row.tier] = row.total
    total += row.total
  }

  return { total, byTier }
}

// ============================================================
// Configuration
// ============================================================

/**
 * Get the current block store configuration.
 */
export function getConfig(): BlockStoreConfig {
  const db = getDb()

  const budgetRow = db.prepare('SELECT value FROM block_store_config WHERE key = ?').get('budget_bytes') as { value: string } | undefined
  const ttlRow = db.prepare('SELECT value FROM block_store_config WHERE key = ?').get('warm_ttl_days') as { value: string } | undefined

  return {
    budgetBytes: budgetRow ? parseInt(budgetRow.value, 10) : DEFAULT_BUDGET_BYTES,
    warmTtlDays: ttlRow ? parseInt(ttlRow.value, 10) : DEFAULT_WARM_TTL_DAYS,
  }
}

/**
 * Update block store configuration.
 */
export function setConfig(config: Partial<BlockStoreConfig>): void {
  const db = getDb()

  if (config.budgetBytes !== undefined) {
    db.prepare('INSERT OR REPLACE INTO block_store_config (key, value) VALUES (?, ?)').run('budget_bytes', String(config.budgetBytes))
  }
  if (config.warmTtlDays !== undefined) {
    db.prepare('INSERT OR REPLACE INTO block_store_config (key, value) VALUES (?, ?)').run('warm_ttl_days', String(config.warmTtlDays))
  }
}
