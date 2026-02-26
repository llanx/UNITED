/**
 * Main chat view component with virtualized message list.
 *
 * Layout (full height flex column):
 * 1. Channel header bar (h-12)
 * 2. Virtualized message list (flex-1)
 * 3. Typing indicator bar (h-6)
 * 4. MessageComposer
 *
 * Features:
 * - @tanstack/react-virtual for windowed rendering
 * - Stick-to-bottom auto-scroll
 * - "New messages" button when scrolled up
 * - Infinite scroll-up for older history
 * - Message grouping by sender + 5-minute window
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '../stores'
import { useMessages } from '../hooks/useMessages'
import { useTypingIndicator } from '../hooks/usePresence'
import { groupMessages, type MessageGroupData } from './MessageGroup'
import MessageGroupComponent from './MessageGroup'
import MessageComposer from './MessageComposer'
import { extractMentionIds } from './MarkdownContent'
import type { ChatMessage, ChatEvent } from '@shared/ipc-bridge'

interface ChatViewProps {
  memberListVisible?: boolean
  onToggleMemberList?: () => void
}

export default function ChatView({ memberListVisible, onToggleMemberList }: ChatViewProps) {
  const activeChannelId = useStore((s) => s.activeChannelId)
  const categoriesWithChannels = useStore((s) => s.categoriesWithChannels)
  const markChannelRead = useStore((s) => s.markChannelRead)
  const clearMentionCount = useStore((s) => s.clearMentionCount)
  const incrementMentionCount = useStore((s) => s.incrementMentionCount)
  const notificationPrefs = useStore((s) => s.notificationPrefs)
  const publicKey = useStore((s) => s.publicKey)
  const members = useStore((s) => s.members)
  const serverName = useStore((s) => s.name)

  // Find the active channel info for header display
  const activeChannel = useMemo(() => {
    for (const cwc of categoriesWithChannels) {
      const found = cwc.channels.find((ch) => ch.id === activeChannelId)
      if (found) return found
    }
    return null
  }, [categoriesWithChannels, activeChannelId])

  const channelName = activeChannel?.name ?? 'unknown'
  const channelTopic = activeChannel?.topic ?? null

  // Data layer
  const { messages, hasMore, loading, loadOlder } = useMessages(activeChannelId)

  // Group messages for rendering
  const groups = useMemo(() => groupMessages(messages), [messages])

  // Reply state
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)

  // Clear reply when switching channels
  useEffect(() => {
    setReplyTo(null)
  }, [activeChannelId])

  // Typing indicator
  const typingText = useTypingIndicator(activeChannelId)

  // Current user pubkey hex for mention detection
  const currentPubkeyHex = useMemo(() => {
    if (!publicKey) return null
    return Array.from(publicKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }, [publicKey])

  // Mark channel as read when mounting ChatView for a channel
  useEffect(() => {
    if (!activeChannelId) return
    markChannelRead(activeChannelId)
    clearMentionCount(activeChannelId)
  }, [activeChannelId, markChannelRead, clearMentionCount])

  // Listen for new messages to detect mentions and fire notifications
  useEffect(() => {
    if (!activeChannelId) return

    const cleanup = window.united.onChatEvent((event: ChatEvent) => {
      if (event.type !== 'new' || !event.message) return

      const msg = event.message

      // Check if message mentions current user
      const { userIds, roleIds } = extractMentionIds(msg.content)
      const currentMember = members.find((m) => m.id === currentPubkeyHex)
      const isMentioned =
        (currentPubkeyHex && userIds.includes(currentPubkeyHex)) ||
        (currentMember && userIds.includes(currentMember.id)) ||
        (currentMember && roleIds.length > 0 && currentMember.role_ids.some((rid) => roleIds.includes(rid)))

      if (isMentioned) {
        // Increment mention count for the message's channel
        incrementMentionCount(msg.channel_id)

        // Check notification preferences
        const prefs = notificationPrefs[msg.channel_id]
        if (prefs?.muted) return

        // Don't notify for the active channel if window is focused
        const isActiveAndFocused =
          msg.channel_id === activeChannelId && document.hasFocus()

        if (!isActiveAndFocused) {
          // Find channel name for notification
          let notifChannelName = 'unknown'
          for (const cwc of categoriesWithChannels) {
            const found = cwc.channels.find((ch) => ch.id === msg.channel_id)
            if (found) { notifChannelName = found.name; break }
          }

          const preview = msg.content.length > 100
            ? msg.content.substring(0, 97) + '...'
            : msg.content

          window.united.notifications.show({
            title: `${msg.sender_display_name} in #${notifChannelName}`,
            body: preview,
            channelId: msg.channel_id,
            serverName: serverName ?? undefined,
          }).catch(() => {})
        }
      }

      // If viewing the active channel and at bottom, mark as read
      if (msg.channel_id === activeChannelId) {
        // Will be marked as read by the scroll handler / isAtBottom check below
      }
    })

    return cleanup
  }, [activeChannelId, currentPubkeyHex, members, incrementMentionCount, notificationPrefs, categoriesWithChannels, serverName])

  // Handle notification click navigation
  useEffect(() => {
    const setActiveChannel = useStore.getState().setActiveChannel
    const cleanup = window.united.onChatEvent((event: ChatEvent) => {
      if (event.type === 'navigate' && event.channelId) {
        setActiveChannel(event.channelId)
      }
    })
    return cleanup
  }, [])

  // Scroll state
  const parentRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const prevMessageCountRef = useRef(messages.length)
  const isLoadingOlderRef = useRef(false)

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
    // Measure actual element sizes for accuracy
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  })

  // Track scroll position to determine if at bottom
  const handleScroll = useCallback(() => {
    const el = parentRef.current
    if (!el) return

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 50
    setIsAtBottom(atBottom)

    if (atBottom && hasNewMessages) {
      setHasNewMessages(false)
    }

    // Mark as read when user scrolls to bottom
    if (atBottom && activeChannelId) {
      markChannelRead(activeChannelId)
      clearMentionCount(activeChannelId)
    }

    // Infinite scroll up: load older when near top
    if (el.scrollTop < 200 && hasMore && !loading && !isLoadingOlderRef.current) {
      isLoadingOlderRef.current = true
      loadOlder()
    }
  }, [hasMore, loading, loadOlder, hasNewMessages, activeChannelId, markChannelRead, clearMentionCount])

  // Reset loading flag when loading state changes
  useEffect(() => {
    if (!loading) {
      isLoadingOlderRef.current = false
    }
  }, [loading])

  // Auto-scroll to bottom when new messages arrive (if at bottom)
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      if (isAtBottom) {
        // Scroll to the last item
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(groups.length - 1, { align: 'end' })
        })
        // Mark as read since user is at bottom viewing new messages
        if (activeChannelId) {
          markChannelRead(activeChannelId)
          clearMentionCount(activeChannelId)
        }
      } else {
        setHasNewMessages(true)
      }
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length, groups.length, isAtBottom, virtualizer, activeChannelId, markChannelRead, clearMentionCount])

  // Initial scroll to bottom on channel load
  useEffect(() => {
    if (groups.length > 0 && !loading) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(groups.length - 1, { align: 'end' })
        setIsAtBottom(true)
      })
    }
  }, [activeChannelId]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToBottom = useCallback(() => {
    virtualizer.scrollToIndex(groups.length - 1, { align: 'end' })
    setIsAtBottom(true)
    setHasNewMessages(false)
  }, [virtualizer, groups.length])

  const handleReply = useCallback((message: ChatMessage) => {
    setReplyTo(message)
  }, [])

  const handleCancelReply = useCallback(() => {
    setReplyTo(null)
  }, [])

  const handleMessageSent = useCallback(() => {
    scrollToBottom()
    setReplyTo(null)
  }, [scrollToBottom])

  const handleScrollToMessage = useCallback(
    (messageId: string) => {
      const groupIndex = groups.findIndex((g) =>
        g.messages.some((m) => m.id === messageId)
      )
      if (groupIndex !== -1) {
        virtualizer.scrollToIndex(groupIndex, { align: 'center' })
      }
    },
    [groups, virtualizer]
  )

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* Channel header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-4">
        <span className="text-lg text-[var(--color-text-muted)]">#</span>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {channelName}
        </span>
        {channelTopic && (
          <>
            <div className="h-4 w-px bg-white/10" />
            <span className="truncate text-xs text-[var(--color-text-muted)]">
              {channelTopic}
            </span>
          </>
        )}
        {/* Spacer */}
        <div className="flex-1" />
        {/* Member list toggle */}
        {onToggleMemberList && (
          <button
            onClick={onToggleMemberList}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              memberListVisible
                ? 'bg-white/10 text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
            title={memberListVisible ? 'Hide member list' : 'Show member list'}
          >
            {/* Simple people/group icon using SVG */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>
        )}
      </div>

      {/* Virtualized message list */}
      <div
        ref={parentRef}
        className="relative flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {/* Loading indicator at top */}
        {loading && (
          <div className="flex items-center justify-center py-3">
            <span className="text-xs text-[var(--color-text-muted)]">Loading messages...</span>
          </div>
        )}

        {/* Empty channel state */}
        {!loading && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-3xl text-[var(--color-text-muted)]">
              #
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Welcome to #{channelName}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              This is the start of the #{channelName} channel.
            </p>
          </div>
        )}

        {/* Virtualized list */}
        {groups.length > 0 && (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const group = groups[virtualRow.index]
              return (
                <div
                  key={group.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <MessageGroupComponent
                    messages={group.messages}
                    isFirstInDay={group.isFirstInDay}
                    dayLabel={group.dayLabel}
                    onReply={handleReply}
                    onScrollToMessage={handleScrollToMessage}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* "New messages" floating button */}
        {hasNewMessages && !isAtBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-white shadow-lg transition-all hover:bg-[var(--color-accent)]/80"
          >
            New messages
          </button>
        )}
      </div>

      {/* Typing indicator bar */}
      <div className="flex h-6 shrink-0 items-center px-4">
        {typingText && (
          <span className="truncate text-xs text-[var(--color-text-muted)]">
            {typingText}
          </span>
        )}
      </div>

      {/* Message composer */}
      <MessageComposer
        channelId={activeChannelId!}
        channelName={channelName}
        replyTo={replyTo}
        onCancelReply={handleCancelReply}
        onMessageSent={handleMessageSent}
      />
    </div>
  )
}
