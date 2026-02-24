import { useStore } from '../stores'

const STATUS_COLORS: Record<string, string> = {
  connected: 'var(--color-connected)',
  reconnecting: 'var(--color-reconnecting)',
  disconnected: 'var(--color-disconnected)',
}

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  reconnecting: 'Reconnecting...',
  disconnected: 'Disconnected',
}

export default function ConnectionDot() {
  const status = useStore((s) => s.status)
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.disconnected

  return (
    <div className="flex items-center gap-2" title={STATUS_LABELS[status] ?? 'Unknown'}>
      <div
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs text-[var(--color-text-muted)]">
        {STATUS_LABELS[status] ?? status}
      </span>
    </div>
  )
}
