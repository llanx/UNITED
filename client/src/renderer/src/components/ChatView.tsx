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
import type { ChatMessage } from '@shared/ipc-bridge'

export default function ChatView() {
  const activeChannelId = useStore((s) => s.activeChannelId)
  const categoriesWithChannels = useStore((s) => s.categoriesWithChannels)

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

    // Infinite scroll up: load older when near top
    if (el.scrollTop < 200 && hasMore && !loading && !isLoadingOlderRef.current) {
      isLoadingOlderRef.current = true
      loadOlder()
    }
  }, [hasMore, loading, loadOlder, hasNewMessages])

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
      } else {
        setHasNewMessages(true)
      }
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length, groups.length, isAtBottom, virtualizer])

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
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
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
