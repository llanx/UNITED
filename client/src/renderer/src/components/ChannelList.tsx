import { useState, useRef, useEffect } from 'react'
import type { CategoryWithChannelsResponse, ChannelResponse } from '@shared/ipc-bridge'
import CategoryHeader from './CategoryHeader'
import UnreadBadge from './UnreadBadge'
import VoiceParticipant from './VoiceParticipant'
import { usePrefetch } from '../hooks/usePrefetch'
import { useStore } from '../stores'
import type { VoiceParticipantState } from '../stores/voice'

interface ChannelListProps {
  categoriesWithChannels: CategoryWithChannelsResponse[]
  activeChannelId: string | null
  isAdmin: boolean
  channelUnreadState?: Record<string, { unreadCount: number; mentionCount: number }>
  onSelectChannel: (id: string) => void
  onRenameChannel?: (id: string, name: string) => void
  onDeleteChannel?: (id: string) => void
  onRenameCategory?: (id: string, name: string) => void
  onDeleteCategory?: (id: string) => void
  onMarkAsRead?: (channelId: string) => void
}

// Channel type icons
function ChannelIcon({ type }: { type: string }) {
  if (type === 'voice') {
    return (
      <svg className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
    )
  }
  // Default: text channel
  return (
    <span className="shrink-0 text-base leading-none text-[var(--color-text-muted)]">#</span>
  )
}

function ChannelItem({
  channel,
  active,
  isAdmin,
  unreadCount,
  mentionCount,
  onSelect,
  onRename,
  onDelete,
  onMarkAsRead,
  onMouseEnter,
  onMouseLeave,
  voiceParticipants,
  isInVoiceChannel,
  onJoinVoice,
}: {
  channel: ChannelResponse
  active: boolean
  isAdmin: boolean
  unreadCount: number
  mentionCount: number
  onSelect: () => void
  onRename?: (name: string) => void
  onDelete?: () => void
  onMarkAsRead?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  voiceParticipants?: VoiceParticipantState[]
  isInVoiceChannel?: boolean
  onJoinVoice?: () => void
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(channel.name)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renaming])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== channel.name && onRename) {
      onRename(trimmed)
    }
    setRenaming(false)
  }

  const isUnread = unreadCount > 0

  if (renaming) {
    return (
      <div className="flex items-center gap-1.5 rounded px-2 py-1">
        <ChannelIcon type={channel.channel_type} />
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit()
            if (e.key === 'Escape') { setRenaming(false); setRenameValue(channel.name) }
          }}
          maxLength={32}
          className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
    )
  }

  const isVoice = channel.channel_type === 'voice'
  const participantCount = voiceParticipants?.length ?? 0

  const handleClick = () => {
    if (isVoice && onJoinVoice) {
      // Voice channels: join voice (do NOT change active text channel)
      if (!isInVoiceChannel) {
        onJoinVoice()
      }
      // If already in this voice channel, clicking again does nothing
    } else {
      onSelect()
    }
  }

  return (
    <div className="relative">
      <button
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors ${
          isVoice
            ? isInVoiceChannel
              ? 'bg-white/10 text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]'
            : active
              ? 'bg-white/10 text-[var(--color-text-primary)]'
              : isUnread
                ? 'text-[var(--color-text-primary)] font-semibold hover:bg-white/5'
                : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]'
        }`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <ChannelIcon type={channel.channel_type} />
        <span className="truncate">{channel.name}</span>
        {isVoice && participantCount > 0 && (
          <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">{participantCount}</span>
        )}
        {!isVoice && (
          <UnreadBadge unreadCount={unreadCount} mentionCount={mentionCount} />
        )}
      </button>

      {/* Voice participants inline under channel */}
      {isVoice && voiceParticipants && voiceParticipants.length > 0 && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
          {voiceParticipants.map((p) => (
            <VoiceParticipant key={p.userId} participant={p} />
          ))}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-lg border border-white/10 bg-[var(--color-bg-rail)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {/* Mark as Read (always available if unread) */}
          {isUnread && onMarkAsRead && (
            <button
              className="flex w-full items-center px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
              onClick={() => {
                onMarkAsRead()
                setContextMenu(null)
              }}
            >
              Mark as Read
            </button>
          )}
          {/* Admin actions */}
          {isAdmin && (
            <>
              {isUnread && <div className="my-1 border-t border-white/5" />}
              <button
                className="flex w-full items-center px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                onClick={() => {
                  setRenameValue(channel.name)
                  setRenaming(true)
                  setContextMenu(null)
                }}
              >
                Rename Channel
              </button>
              <button
                className="flex w-full items-center px-3 py-1.5 text-sm text-red-400 hover:bg-white/5 hover:text-red-300"
                onClick={() => {
                  onDelete?.()
                  setContextMenu(null)
                }}
              >
                Delete Channel
              </button>
            </>
          )}
          {/* If not admin and not unread, show at least "Mark as Read" for non-unread channels */}
          {!isAdmin && !isUnread && (
            <span className="flex w-full items-center px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
              No actions available
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function ChannelList({
  categoriesWithChannels,
  activeChannelId,
  isAdmin,
  channelUnreadState,
  onSelectChannel,
  onRenameChannel,
  onDeleteChannel,
  onRenameCategory,
  onDeleteCategory,
  onMarkAsRead
}: ChannelListProps) {
  const { prefetchOnHover, cancelPrefetch } = usePrefetch()
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  // Voice state
  const voiceChannelId = useStore((s) => s.voiceChannelId)
  const voiceParticipants = useStore((s) => s.voiceParticipants)
  const joinVoiceChannel = useStore((s) => s.joinVoiceChannel)

  // Track participant cap warning (show only once per session)
  const [capWarningShown, setCapWarningShown] = useState(false)

  // Check participant count for soft cap warning
  useEffect(() => {
    if (voiceParticipants.size > 8 && !capWarningShown) {
      setCapWarningShown(true)
      // Show a toast-like warning. Using a simple approach: a temporary element.
      // In a real app this would use a toast system. For now, console + inline.
      console.warn('Voice quality may be reduced with more than 8 participants.')
    }
  }, [voiceParticipants.size, capWarningShown])

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  // Sort categories by position, then channels within each by position
  const sortedCategories = [...categoriesWithChannels]
    .sort((a, b) => a.category.position - b.category.position)

  return (
    <div className="flex flex-col gap-2">
      {sortedCategories.map((cwc) => {
        const collapsed = collapsedCategories.has(cwc.category.id)
        const sortedChannels = [...cwc.channels].sort((a, b) => a.position - b.position)

        return (
          <div key={cwc.category.id}>
            <CategoryHeader
              name={cwc.category.name}
              channelCount={cwc.channels.length}
              collapsed={collapsed}
              isAdmin={isAdmin}
              onToggle={() => toggleCategory(cwc.category.id)}
              onRename={onRenameCategory ? (name) => onRenameCategory(cwc.category.id, name) : undefined}
              onDelete={onDeleteCategory ? () => onDeleteCategory(cwc.category.id) : undefined}
            />
            {!collapsed && (
              <ul className="flex flex-col gap-0.5 pl-1">
                {sortedChannels.map((ch) => {
                  const unreadInfo = channelUnreadState?.[ch.id] ?? { unreadCount: 0, mentionCount: 0 }
                  const isVoice = ch.channel_type === 'voice'
                  // Collect participants for this voice channel
                  const channelVoiceParticipants = isVoice && voiceChannelId === ch.id
                    ? Array.from(voiceParticipants.values())
                    : []
                  return (
                    <li key={ch.id}>
                      <ChannelItem
                        channel={ch}
                        active={ch.id === activeChannelId}
                        isAdmin={isAdmin}
                        unreadCount={unreadInfo.unreadCount}
                        mentionCount={unreadInfo.mentionCount}
                        onSelect={() => onSelectChannel(ch.id)}
                        onRename={onRenameChannel ? (name) => onRenameChannel(ch.id, name) : undefined}
                        onDelete={onDeleteChannel ? () => onDeleteChannel(ch.id) : undefined}
                        onMarkAsRead={onMarkAsRead ? () => onMarkAsRead(ch.id) : undefined}
                        onMouseEnter={() => prefetchOnHover(ch.id)}
                        onMouseLeave={cancelPrefetch}
                        voiceParticipants={isVoice ? channelVoiceParticipants : undefined}
                        isInVoiceChannel={isVoice && voiceChannelId === ch.id}
                        onJoinVoice={isVoice ? () => joinVoiceChannel(ch.id) : undefined}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
