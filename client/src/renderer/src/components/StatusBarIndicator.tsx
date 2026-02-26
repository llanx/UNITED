/**
 * Compact status bar indicator for network upload/download speed.
 *
 * Rendered at the bottom of the main content area when enabled.
 * Off by default per CONTEXT.md. Toggle in Network Stats settings.
 *
 * Shows upload (green arrow) and download (blue arrow) speeds.
 */

import { useStore } from '../stores/index'

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

export default function StatusBarIndicator() {
  const showStatusBar = useStore((s) => s.showStatusBar)
  const networkStats = useStore((s) => s.networkStats)

  if (!showStatusBar) return null

  const uploadSpeed = networkStats?.uploadSpeed ?? 0
  const downloadSpeed = networkStats?.downloadSpeed ?? 0

  return (
    <div className="flex h-6 shrink-0 items-center gap-4 border-t border-white/5 bg-white/[0.02] px-4 text-xs">
      <span className="flex items-center gap-1 text-green-400">
        <span aria-hidden="true">&#9650;</span>
        {formatSpeed(uploadSpeed)}
      </span>
      <span className="flex items-center gap-1 text-blue-400">
        <span aria-hidden="true">&#9660;</span>
        {formatSpeed(downloadSpeed)}
      </span>
    </div>
  )
}
