import { useStore } from '../stores'
import ConnectionDot from './ConnectionDot'
import SkeletonShimmer from './SkeletonShimmer'

export default function ChannelSidebar() {
  const serverName = useStore((s) => s.name)
  const channels = useStore((s) => s.channels)
  const activeChannelId = useStore((s) => s.activeChannelId)

  return (
    <div className="flex h-full w-[240px] shrink-0 flex-col bg-[var(--color-bg-secondary)]">
      {/* Server name header */}
      <div className="flex h-12 items-center border-b border-white/5 px-4">
        <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
          {serverName ?? 'No Server'}
        </h2>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {channels.length === 0 ? (
          <SkeletonShimmer lines={5} />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {channels.map((ch) => (
              <li key={ch.id}>
                <button
                  className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors ${
                    ch.id === activeChannelId
                      ? 'bg-white/10 text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]'
                  }`}
                  onClick={() => useStore.setState({ activeChannelId: ch.id })}
                >
                  <span className="text-[var(--color-text-muted)]">#</span>
                  <span className="truncate">{ch.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer with connection status */}
      <div className="flex h-[52px] items-center border-t border-white/5 px-3">
        <ConnectionDot />
      </div>
    </div>
  )
}
