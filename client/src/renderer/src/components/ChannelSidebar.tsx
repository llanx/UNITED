import { useState, useRef, useEffect } from 'react'
import { useStore } from '../stores'
import ConnectionDot from './ConnectionDot'
import SkeletonShimmer from './SkeletonShimmer'

export default function ChannelSidebar() {
  const serverName = useStore((s) => s.name)
  const channels = useStore((s) => s.channels)
  const activeChannelId = useStore((s) => s.activeChannelId)
  const isOwner = useStore((s) => s.isOwner)
  const displayName = useStore((s) => s.displayName)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return

    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  return (
    <div className="flex h-full w-[240px] shrink-0 flex-col bg-[var(--color-bg-secondary)]">
      {/* Server name header with dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          className="flex h-12 w-full items-center justify-between border-b border-white/5 px-4 transition-colors hover:bg-white/5"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {serverName ?? 'No Server'}
          </h2>
          <svg
            className={`h-4 w-4 text-[var(--color-text-muted)] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {dropdownOpen && (
          <div className="absolute left-2 right-2 top-[calc(100%+2px)] z-50 rounded-lg border border-white/10 bg-[var(--color-bg-rail)] py-1 shadow-lg">
            {isOwner && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                onClick={() => {
                  useStore.setState({ activePanel: 'settings' })
                  setDropdownOpen(false)
                }}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Server Settings
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)]"
              onClick={() => {
                useStore.setState({ activePanel: 'members' })
                setDropdownOpen(false)
              }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Members
            </button>
          </div>
        )}
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

      {/* Footer with connection status and display name */}
      <div className="flex h-[52px] items-center justify-between border-t border-white/5 px-3">
        <div className="flex items-center gap-2">
          <ConnectionDot />
        </div>
        {displayName && (
          <span className="truncate text-xs text-[var(--color-text-muted)]">
            {displayName}
          </span>
        )}
      </div>
    </div>
  )
}
