/**
 * Colored dot component for presence status.
 *
 * Colors per CONTEXT.md:
 * - Online: green (#43b581)
 * - Away: yellow (#faa61a)
 * - DND: red (#f04747)
 * - Offline: gray (#747f8d)
 *
 * Two sizes: sm for message avatars, md for member list.
 */

interface PresenceIndicatorProps {
  status: 'online' | 'away' | 'dnd' | 'offline'
  size?: 'sm' | 'md'
  showLabel?: boolean
}

const STATUS_COLORS: Record<string, string> = {
  online: '#43b581',
  away: '#faa61a',
  dnd: '#f04747',
  offline: '#747f8d',
}

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  away: 'Away',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
}

export default function PresenceIndicator({
  status,
  size = 'sm',
  showLabel = false,
}: PresenceIndicatorProps) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.offline
  const label = STATUS_LABELS[status] ?? 'Offline'

  const sizeClass = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'

  if (showLabel) {
    return (
      <div className="flex items-center gap-1.5">
        <div
          className={`${sizeClass} shrink-0 rounded-full`}
          style={{ backgroundColor: color }}
        />
        <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      </div>
    )
  }

  return (
    <div
      className={`${sizeClass} shrink-0 rounded-full`}
      style={{ backgroundColor: color }}
    />
  )
}

export { STATUS_COLORS, STATUS_LABELS }
