/**
 * Storage settings panel for configuring block store budget and warm TTL.
 *
 * Displays:
 *   - Storage budget slider (1-50 GB) with usage bar segmented by tier
 *   - Warm TTL slider (3-30 days) with explanation text
 *   - Current usage statistics
 *
 * Fetches live usage data on mount and persists changes via settings store.
 */

import { useState, useEffect } from 'react'
import { useStore } from '../stores/index'
import type { BlockStorageUsage } from '@shared/ipc-bridge'

// ============================================================
// Usage bar segments
// ============================================================

interface UsageBarProps {
  usage: BlockStorageUsage | null
  budgetBytes: number
}

function UsageBar({ usage, budgetBytes }: UsageBarProps) {
  if (!usage || budgetBytes === 0) {
    return <div className="w-full h-4 rounded-full bg-[var(--bg-tertiary)]" />
  }

  const p1Pct = (usage.byTier[1] ?? 0) / budgetBytes * 100
  const p2p3Pct = ((usage.byTier[2] ?? 0) + (usage.byTier[3] ?? 0)) / budgetBytes * 100
  const p4Pct = (usage.byTier[4] ?? 0) / budgetBytes * 100
  const freePct = Math.max(0, 100 - p1Pct - p2p3Pct - p4Pct)

  return (
    <div className="w-full space-y-1.5">
      <div className="w-full h-4 rounded-full bg-[var(--bg-tertiary)] overflow-hidden flex">
        {p1Pct > 0 && (
          <div
            className="h-full bg-green-500"
            style={{ width: `${Math.min(p1Pct, 100)}%` }}
            title={`Protected: ${formatBytes(usage.byTier[1] ?? 0)}`}
          />
        )}
        {p2p3Pct > 0 && (
          <div
            className="h-full bg-blue-500"
            style={{ width: `${Math.min(p2p3Pct, 100)}%` }}
            title={`Active: ${formatBytes((usage.byTier[2] ?? 0) + (usage.byTier[3] ?? 0))}`}
          />
        )}
        {p4Pct > 0 && (
          <div
            className="h-full bg-gray-500"
            style={{ width: `${Math.min(p4Pct, 100)}%` }}
            title={`Seeding: ${formatBytes(usage.byTier[4] ?? 0)}`}
          />
        )}
        {freePct > 0 && (
          <div
            className="h-full bg-[var(--bg-tertiary)]"
            style={{ width: `${freePct}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500" />
          Protected
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" />
          Active
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-500" />
          Seeding
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)]" />
          Free
        </span>
      </div>
    </div>
  )
}

// ============================================================
// Helpers
// ============================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ============================================================
// StorageSettings component
// ============================================================

export default function StorageSettings() {
  const storageBudgetGb = useStore((s) => s.storageBudgetGb)
  const warmTtlDays = useStore((s) => s.warmTtlDays)
  const setStorageBudget = useStore((s) => s.setStorageBudget)
  const setWarmTtl = useStore((s) => s.setWarmTtl)

  const [usage, setUsage] = useState<BlockStorageUsage | null>(null)

  useEffect(() => {
    window.united.blocks.getStorageUsage().then(setUsage).catch(() => {
      // Block store may not be initialized
    })
  }, [storageBudgetGb])

  const budgetBytes = storageBudgetGb * 1024 * 1024 * 1024

  return (
    <div className="space-y-6 p-4">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">
        Storage
      </h3>

      {/* Storage budget */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm text-[var(--text-secondary)]">
            Storage budget
          </label>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {storageBudgetGb} GB
          </span>
        </div>

        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={storageBudgetGb}
          onChange={(e) => setStorageBudget(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-[var(--bg-tertiary)] accent-blue-500 cursor-pointer"
        />

        <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
          <span>1 GB</span>
          <span>50 GB</span>
        </div>

        {/* Usage bar */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[var(--text-tertiary)]">
              Used: {usage ? formatBytes(usage.total) : '...'}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              Budget: {storageBudgetGb} GB
            </span>
          </div>
          <UsageBar usage={usage} budgetBytes={budgetBytes} />
        </div>
      </div>

      {/* Warm tier TTL */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm text-[var(--text-secondary)]">
            Content retention
          </label>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {warmTtlDays} days
          </span>
        </div>

        <input
          type="range"
          min={3}
          max={30}
          step={1}
          value={warmTtlDays}
          onChange={(e) => setWarmTtl(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-[var(--bg-tertiary)] accent-blue-500 cursor-pointer"
        />

        <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
          <span>3 days</span>
          <span>30 days</span>
        </div>

        <p className="text-xs text-[var(--text-tertiary)]">
          Keep content for {warmTtlDays} days (space permitting).
          Storage budget is the hard limit -- older content is evicted silently when space is needed.
        </p>
      </div>
    </div>
  )
}
