import { useState, useRef, useEffect, useMemo } from 'react'
import ServerIcon from './ServerIcon'
import { useStore } from '../stores'

export default function ServerRail() {
  const serverName = useStore((s) => s.name)
  const channelMentionCounts = useStore((s) => s.channelMentionCounts)
  const channelMessages = useStore((s) => s.channelMessages)
  const categoriesWithChannels = useStore((s) => s.categoriesWithChannels)
  const markChannelRead = useStore((s) => s.markChannelRead)
  const clearMentionCount = useStore((s) => s.clearMentionCount)

  // DM state
  const dmView = useStore((s) => s.dmView)
  const setDmView = useStore((s) => s.setDmView)
  const setActiveDmConversation = useStore((s) => s.setActiveDmConversation)
  const getTotalDmUnread = useStore((s) => s.getTotalDmUnread)
  const dmUnreadCounts = useStore((s) => s.dmUnreadCounts)

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Aggregate mention count across all channels
  const totalMentions = useMemo(() => {
    return Object.values(channelMentionCounts).reduce((sum, count) => sum + count, 0)
  }, [channelMentionCounts])

  // Total DM unread count
  const totalDmUnread = useMemo(() => {
    return Object.values(dmUnreadCounts).reduce((sum, count) => sum + count, 0)
  }, [dmUnreadCounts])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleMarkAllAsRead = () => {
    // Iterate all channels and mark them read
    for (const cwc of categoriesWithChannels) {
      for (const ch of cwc.channels) {
        const msgs = channelMessages[ch.id]
        if (msgs && msgs.messages.length > 0) {
          markChannelRead(ch.id)
        }
        clearMentionCount(ch.id)
      }
    }
    setContextMenu(null)
  }

  const handleDmClick = () => {
    if (dmView) {
      // Leave DM view: go back to channel view
      setDmView(false)
      setActiveDmConversation(null)
    } else {
      // Enter DM view: deselect any active channel
      useStore.setState({ activeChannelId: null })
      setDmView(true)
    }
  }

  const handleServerClick = () => {
    if (dmView) {
      // Leave DM view when clicking the server icon
      setDmView(false)
      setActiveDmConversation(null)
    }
  }

  return (
    <div className="flex h-full w-[56px] shrink-0 flex-col items-center gap-2 bg-[var(--color-bg-rail)] py-3">
      {/* Home button */}
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-white cursor-pointer hover:rounded-2xl transition-[border-radius] duration-200">
        <span className="text-lg font-bold">U</span>
      </div>

      {/* DM icon */}
      <div className="relative">
        <button
          onClick={handleDmClick}
          className={`flex h-12 w-12 items-center justify-center transition-all duration-200 ${
            dmView
              ? 'rounded-2xl bg-blue-500/20 text-blue-400'
              : 'rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:rounded-2xl hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
          title="Direct Messages"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </button>

        {/* DM unread badge -- always visible */}
        {totalDmUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white shadow-md">
            {totalDmUnread > 99 ? '99+' : totalDmUnread}
          </span>
        )}
      </div>

      {/* Separator between DM icon and server list */}
      <div className="mx-auto my-1 h-px w-8 bg-white/10" />

      {/* Server list -- only active server for now */}
      {serverName && (
        <div
          className="relative flex items-center"
          onContextMenu={handleContextMenu}
          onClick={handleServerClick}
        >
          {/* Active pill indicator (shown when NOT in DM view) */}
          {!dmView && (
            <div className="absolute -left-1 h-5 w-1 rounded-r-full bg-white" />
          )}
          <ServerIcon name={serverName} size={48} active={!dmView} />

          {/* Aggregated mention badge */}
          {totalMentions > 0 && (
            <span className="absolute -bottom-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white shadow-md">
              {totalMentions > 99 ? '99+' : totalMentions}
            </span>
          )}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-lg border border-white/10 bg-[var(--color-bg-rail)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full items-center px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
            onClick={handleMarkAllAsRead}
          >
            Mark All as Read
          </button>
        </div>
      )}
    </div>
  )
}
