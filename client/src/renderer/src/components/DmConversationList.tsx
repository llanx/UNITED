/**
 * DM conversation list sidebar.
 *
 * Replaces ChannelSidebar when dmView is true.
 * Shows: avatar, name, last message timestamp, unread badge per conversation.
 * Sorted by most recent activity (newest at top).
 */

import { useEffect, useMemo } from 'react'
import { useStore } from '../stores'
import { useDm } from '../hooks/useDm'
import ConnectionDot from './ConnectionDot'

/** Derive a consistent hue from a pubkey string for avatar color */
function pubkeyToHue(pubkey: string): number {
  let hash = 0
  for (let i = 0; i < pubkey.length; i++) {
    hash = pubkey.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  return Math.abs(hash) % 360
}

/** Format timestamp as relative time */
function formatRelativeTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts

  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'Just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  const date = new Date(ts)
  return date.toLocaleDateString()
}

export default function DmConversationList() {
  const publicKey = useStore((s) => s.publicKey)
  const activeDmConversationId = useStore((s) => s.activeDmConversationId)
  const setActiveDmConversation = useStore((s) => s.setActiveDmConversation)
  const dmUnreadCounts = useStore((s) => s.dmUnreadCounts)
  const displayName = useStore((s) => s.displayName)

  const { conversations } = useDm()

  // Get current user pubkey hex
  const currentPubkeyHex = useMemo(() => {
    if (!publicKey) return null
    return Array.from(publicKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }, [publicKey])

  // Derive the "other participant" info for each conversation
  const conversationItems = useMemo(() => {
    return conversations.map((conv) => {
      const isParticipantA = conv.participantAPubkey === currentPubkeyHex
      const peerPubkey = isParticipantA ? conv.participantBPubkey : conv.participantAPubkey
      const peerDisplayName = isParticipantA
        ? conv.participantBDisplayName
        : conv.participantADisplayName

      return {
        id: conv.id,
        peerPubkey,
        peerDisplayName: peerDisplayName || 'Unknown User',
        lastMessageAt: conv.lastMessageAt,
        unreadCount: dmUnreadCounts[conv.id] || 0,
      }
    })
  }, [conversations, currentPubkeyHex, dmUnreadCounts])

  return (
    <div className="flex h-full w-[240px] shrink-0 flex-col bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="flex h-12 items-center border-b border-white/5 px-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
          Direct Messages
        </h2>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {conversationItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mb-3 text-[var(--color-text-muted)]"
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <p className="text-xs text-[var(--color-text-muted)]">
              No direct messages yet. Click a user&apos;s name to start a conversation.
            </p>
          </div>
        ) : (
          conversationItems.map((item) => {
            const hue = pubkeyToHue(item.peerPubkey)
            const isActive = item.id === activeDmConversationId
            const hasUnread = item.unreadCount > 0

            return (
              <button
                key={item.id}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ${
                  isActive
                    ? 'bg-white/5'
                    : 'hover:bg-white/[0.03]'
                }`}
                onClick={() => setActiveDmConversation(item.id)}
              >
                {/* Avatar */}
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: `hsl(${hue}, 60%, 45%)` }}
                >
                  {item.peerDisplayName.charAt(0).toUpperCase()}
                </div>

                {/* Name and timestamp */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`truncate text-sm ${
                        hasUnread
                          ? 'font-bold text-[var(--color-text-primary)]'
                          : 'font-medium text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {item.peerDisplayName}
                    </span>
                    {/* Unread badge */}
                    {hasUnread && (
                      <span className="ml-1 flex min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {item.unreadCount > 99 ? '99+' : item.unreadCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    {item.lastMessageAt > 0
                      ? formatRelativeTime(item.lastMessageAt)
                      : 'No messages yet'}
                  </span>
                </div>
              </button>
            )
          })
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
