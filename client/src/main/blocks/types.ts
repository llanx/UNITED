/**
 * Block store type definitions for content-addressed storage.
 *
 * Blocks are SHA-256 addressed, encrypted at rest, and organized
 * into priority tiers for eviction management.
 */

// ============================================================
// Content tiers (lower number = higher priority)
// ============================================================

export enum ContentTier {
  /** Never evicted: authored messages + received DMs */
  P1_NEVER_EVICT = 1,
  /** Hot: recently accessed content */
  P2_HOT = 2,
  /** Warm: older content kept within TTL (best-effort) */
  P3_WARM = 3,
  /** Altruistic: seeded content for network health */
  P4_ALTRUISTIC = 4,
}

// ============================================================
// Block metadata (stored in SQLite)
// ============================================================

export interface BlockMeta {
  /** SHA-256 hex hash (content address) */
  hash: string
  /** Block size in bytes (plaintext) */
  size: number
  /** Retention tier */
  tier: ContentTier
  /** MIME type of the content */
  mimeType?: string
  /** Image width (if applicable) */
  width?: number
  /** Image height (if applicable) */
  height?: number
  /** Original filename (if applicable) */
  filename?: string
  /** ISO 8601 creation timestamp */
  createdAt: string
  /** ISO 8601 last access timestamp */
  lastAccessedAt: string
}

// ============================================================
// Configuration
// ============================================================

export interface BlockStoreConfig {
  /** Total storage budget in bytes */
  budgetBytes: number
  /** Warm tier TTL in days (best-effort, budget wins) */
  warmTtlDays: number
}

// ============================================================
// Constants
// ============================================================

/** Default storage budget: 5 GB */
export const DEFAULT_BUDGET_BYTES = 5 * 1024 * 1024 * 1024

/** Default warm tier TTL: 7 days */
export const DEFAULT_WARM_TTL_DAYS = 7

/** Minimum budget: 1 GB */
export const MIN_BUDGET_GB = 1

/** Maximum budget: 50 GB */
export const MAX_BUDGET_GB = 50
