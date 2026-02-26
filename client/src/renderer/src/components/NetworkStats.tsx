/**
 * Network stats dashboard panel for Settings.
 *
 * Displays:
 *   - Upload/download cumulative totals
 *   - Seeding ratio (upload:download)
 *   - Blocks seeded count
 *   - Storage breakdown by tier (visual bar)
 *   - Status bar toggle (off by default per CONTEXT.md)
 *
 * Stats are private only -- no public visibility to other users.
 */

import { useState, useEffect } from 'react'
import { useStore } from '../stores/index'
import type { BlockStorageUsage } from '@shared/ipc-bridge'

// ============================================================
// Helpers
// ============================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatRatio(uploaded: number, downloaded: number): string {
  if (downloaded === 0) {
    return uploaded > 0 ? '-- : 1' : 'N/A'
  }
  return `${(uploaded / downloaded).toFixed(2)} : 1`
}

// ============================================================
// Storage tier bar
// ============================================================

interface TierBarProps {
  usage: BlockStorageUsage | null
  budgetBytes: number
}

function TierBar({ usage, budgetBytes }: TierBarProps) {
  if (!usage || budgetBytes === 0) {
    return <div className="h-4 w-full rounded-full bg-white/5" />
  }

  const p1 = usage.byTier[1] ?? 0   // Never-evict
  const p2 = usage.byTier[2] ?? 0   // Hot
  const p3 = usage.byTier[3] ?? 0   // Warm
  const p4 = usage.byTier[4] ?? 0   // Altruistic

  const p1Pct = (p1 / budgetBytes) * 100
  const p2Pct = (p2 / budgetBytes) * 100
  const p3Pct = (p3 / budgetBytes) * 100
  const p4Pct = (p4 / budgetBytes) * 100
  const freePct = Math.max(0, 100 - p1Pct - p2Pct - p3Pct - p4Pct)

  return (
    <div className="w-full space-y-1.5">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-white/5">
        {p1Pct > 0 && (
          <div
            className="h-full bg-blue-500"
            style={{ width: `${Math.min(p1Pct, 100)}%` }}
            title={`Never-evict: ${formatBytes(p1)}`}
          />
        )}
        {p2Pct > 0 && (
          <div
            className="h-full bg-green-500"
            style={{ width: `${Math.min(p2Pct, 100)}%` }}
            title={`Hot: ${formatBytes(p2)}`}
          />
        )}
        {p3Pct > 0 && (
          <div
            className="h-full bg-yellow-500"
            style={{ width: `${Math.min(p3Pct, 100)}%` }}
            title={`Warm: ${formatBytes(p3)}`}
          />
        )}
        {p4Pct > 0 && (
          <div
            className="h-full bg-purple-500"
            style={{ width: `${Math.min(p4Pct, 100)}%` }}
            title={`Altruistic: ${formatBytes(p4)}`}
          />
        )}
        {freePct > 0 && (
          <div
            className="h-full bg-white/5"
            style={{ width: `${freePct}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
          Never-evict ({formatBytes(p1)})
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" />
          Hot ({formatBytes(p2)})
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-yellow-500" />
          Warm ({formatBytes(p3)})
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-purple-500" />
          Altruistic ({formatBytes(p4)})
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-white/10 bg-white/5" />
          Free
        </span>
      </div>
    </div>
  )
}

// ============================================================
// NetworkStats component
// ============================================================

export default function NetworkStats() {
  const networkStats = useStore((s) => s.networkStats)
  const showStatusBar = useStore((s) => s.showStatusBar)
  const toggleStatusBar = useStore((s) => s.toggleStatusBar)
  const storageBudgetGb = useStore((s) => s.storageBudgetGb)

  const [storageUsage, setStorageUsage] = useState<BlockStorageUsage | null>(null)

  useEffect(() => {
    window.united.stats.getStorageUsage()
      .then(setStorageUsage)
      .catch(() => {
        // Block store may not be initialized
      })
  }, [])

  const budgetBytes = storageBudgetGb * 1024 * 1024 * 1024

  return (
    <div className="flex flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex h-12 items-center border-b border-white/5 px-4">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          Network Stats
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-lg flex-col gap-6">

          {/* Transfer totals */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              Transfer
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/5 bg-white/5 p-3">
                <div className="text-xs text-[var(--color-text-muted)]">Uploaded</div>
                <div className="mt-1 text-lg font-medium text-green-400">
                  {networkStats ? formatBytes(networkStats.bytesUploaded) : '0 B'}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {networkStats ? formatSpeed(networkStats.uploadSpeed) : '0 B/s'}
                </div>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/5 p-3">
                <div className="text-xs text-[var(--color-text-muted)]">Downloaded</div>
                <div className="mt-1 text-lg font-medium text-blue-400">
                  {networkStats ? formatBytes(networkStats.bytesDownloaded) : '0 B'}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {networkStats ? formatSpeed(networkStats.downloadSpeed) : '0 B/s'}
                </div>
              </div>
            </div>
          </div>

          {/* Seeding ratio and blocks */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              Seeding
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/5 bg-white/5 p-3">
                <div className="text-xs text-[var(--color-text-muted)]">Ratio</div>
                <div className="mt-1 text-lg font-medium text-[var(--color-text-primary)]">
                  {networkStats
                    ? formatRatio(networkStats.bytesUploaded, networkStats.bytesDownloaded)
                    : 'N/A'}
                </div>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/5 p-3">
                <div className="text-xs text-[var(--color-text-muted)]">Blocks Seeded</div>
                <div className="mt-1 text-lg font-medium text-[var(--color-text-primary)]">
                  {networkStats ? networkStats.blocksSeeded.toLocaleString() : '0'}
                </div>
              </div>
            </div>
          </div>

          {/* Storage breakdown */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              Storage Breakdown
            </h3>
            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <span>Used: {storageUsage ? formatBytes(storageUsage.total) : '...'}</span>
              <span>Budget: {storageBudgetGb} GB</span>
            </div>
            <TierBar usage={storageUsage} budgetBytes={budgetBytes} />
          </div>

          {/* Status bar toggle */}
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              Display
            </h3>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={showStatusBar}
                onChange={toggleStatusBar}
                className="h-4 w-4 rounded border-white/20 bg-white/5 accent-blue-500"
              />
              <span className="text-sm text-[var(--color-text-primary)]">
                Show network activity in status bar
              </span>
            </label>
            <p className="text-xs text-[var(--color-text-muted)]">
              Displays a compact upload/download speed indicator at the bottom of the window.
            </p>
          </div>

          {/* Privacy note */}
          <p className="text-xs text-[var(--color-text-muted)]">
            These stats are private to your device and are never shared with other users.
          </p>
        </div>
      </div>
    </div>
  )
}
