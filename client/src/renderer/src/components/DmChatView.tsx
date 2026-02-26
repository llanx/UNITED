/**
 * Full-width DM conversation view with encryption status header.
 *
 * Layout (full height flex column):
 * 1. Conversation header (h-12) with peer name and lock icon
 * 2. EncryptionBanner (conditional, dismissible)
 * 3. Virtualized message list (flex-1)
 * 4. DmComposer
 *
 * Features:
 * - @tanstack/react-virtual for windowed rendering
 * - Stick-to-bottom auto-scroll
 * - "New messages" button when scrolled up
 * - Infinite scroll-up for older history
 * - Message grouping by sender + 5-minute window
 * - Date separators
 * - Key rotation notices inline
 * - Offline separators
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '../stores'
import { useDm } from '../hooks/useDm'
import DmMessageRow from './DmMessageRow'
import DmComposer from './DmComposer'
import EncryptionBanner from './EncryptionBanner'
import EncryptionIndicator from './EncryptionIndicator'
import KeyRotationNotice from './KeyRotationNotice'
import type { DecryptedDmMessage } from '@shared/ipc-bridge'

/** Max time gap for grouping consecutive messages (5 minutes) */
const GROUP_TIME_WINDOW_MS = 5 * 60 * 1000

interface DmMessageGroupData {
  id: string
  type: 'messages' | 'date-separator' | 'key-rotation'
  messages?: DecryptedDmMessage[]
  dayLabel?: string
  isOfflineSeparator?: boolean
  keyRotation?: { displayName: string; timestamp: number }
}

/**
 * Group DM messages for rendering.
 * Groups consecutive messages from the same sender within 5 minutes.
 * Inserts date separators at day boundaries.
 */
function groupDmMessages(messages: DecryptedDmMessage[]): DmMessageGroupData[] {
  if (messages.length === 0) return []

  const groups: DmMessageGroupData[] = []
  let currentGroup: DecryptedDmMessage[] = [messages[0]]
  let currentDayKey = dayKey(new Date(messages[0].timestamp))
  const seenDays = new Set<string>()

  // Add first date separator
  groups.push({
    id: `day-${currentDayKey}`,
    type: 'date-separator',
    dayLabel: formatDayLabel(new Date(messages[0].timestamp)),
  })
  seenDays.add(currentDayKey)

  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i]
    const prev = messages[i - 1]
    const msgDate = new Date(msg.timestamp)
    const prevDate = new Date(prev.timestamp)
    const msgDayKey = dayKey(msgDate)

    const sameUser = msg.senderPubkey === prev.senderPubkey
    const withinWindow = msgDate.getTime() - prevDate.getTime() <= GROUP_TIME_WINDOW_MS
    const sameDay = msgDayKey === dayKey(prevDate)

    if (sameUser && withinWindow && sameDay) {
      currentGroup.push(msg)
    } else {
      // Flush current group
      groups.push({
        id: `group-${currentGroup[0].id}`,
        type: 'messages',
        messages: currentGroup,
      })

      // Day separator if new day
      if (!seenDays.has(msgDayKey)) {
        groups.push({
          id: `day-${msgDayKey}`,
          type: 'date-separator',
          dayLabel: formatDayLabel(msgDate),
        })
        seenDays.add(msgDayKey)
      }

      currentGroup = [msg]
    }
  }

  // Flush final group
  if (currentGroup.length > 0) {
    groups.push({
      id: `group-${currentGroup[0].id}`,
      type: 'messages',
      messages: currentGroup,
    })
  }

  return groups
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDayLabel(date: Date): string {
  const now = new Date()
  const today = dayKey(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = dayKey(yesterday)
  const dateKey = dayKey(date)

  if (dateKey === today) return 'Today'
  if (dateKey === yesterdayKey) return 'Yesterday'

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function DmChatView() {
  const activeDmConversationId = useStore((s) => s.activeDmConversationId)
  const dmConversations = useStore((s) => s.dmConversations)
  const publicKey = useStore((s) => s.publicKey)
  const dmEncryptionBannerDismissed = useStore((s) => s.dmEncryptionBannerDismissed)
  const dismissEncryptionBanner = useStore((s) => s.dismissEncryptionBanner)
  const loadDmMessages = useStore((s) => s.loadDmMessages)
  const sendDmMessage = useStore((s) => s.sendDmMessage)

  // Get current user pubkey hex
  const currentPubkeyHex = useMemo(() => {
    if (!publicKey) return null
    return Array.from(publicKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }, [publicKey])

  // Find active conversation
  const activeConversation = useMemo(() => {
    return dmConversations.find((c) => c.id === activeDmConversationId) ?? null
  }, [dmConversations, activeDmConversationId])

  // Determine peer info
  const peerInfo = useMemo(() => {
    if (!activeConversation || !currentPubkeyHex) return null
    const isParticipantA = activeConversation.participantAPubkey === currentPubkeyHex
    return {
      pubkey: isParticipantA
        ? activeConversation.participantBPubkey
        : activeConversation.participantAPubkey,
      displayName: isParticipantA
        ? activeConversation.participantBDisplayName
        : activeConversation.participantADisplayName,
    }
  }, [activeConversation, currentPubkeyHex])

  // Data layer
  const { messages, hasMore, loading, loadOlder } = useDm(activeDmConversationId ?? undefined)

  // Load messages when conversation changes
  useEffect(() => {
    if (activeDmConversationId && peerInfo) {
      loadDmMessages(activeDmConversationId, peerInfo.pubkey)
    }
  }, [activeDmConversationId, peerInfo, loadDmMessages])

  // Group messages for rendering
  const groups = useMemo(() => groupDmMessages(messages), [messages])

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
    estimateSize: (index) => {
      const group = groups[index]
      if (group.type === 'date-separator') return 40
      if (group.type === 'key-rotation') return 40
      // Estimate based on message count in group
      const msgCount = group.messages?.length ?? 1
      return 40 + (msgCount - 1) * 24
    },
    overscan: 5,
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  })

  // Track scroll position
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
    if (el.scrollTop < 200 && hasMore && !loading && !isLoadingOlderRef.current && peerInfo) {
      isLoadingOlderRef.current = true
      loadOlder(peerInfo.pubkey)
    }
  }, [hasMore, loading, loadOlder, hasNewMessages, peerInfo])

  // Reset loading flag
  useEffect(() => {
    if (!loading) {
      isLoadingOlderRef.current = false
    }
  }, [loading])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      if (isAtBottom) {
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(groups.length - 1, { align: 'end' })
        })
      } else {
        setHasNewMessages(true)
      }
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length, groups.length, isAtBottom, virtualizer])

  // Initial scroll to bottom on conversation load
  useEffect(() => {
    if (groups.length > 0 && !loading) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(groups.length - 1, { align: 'end' })
        setIsAtBottom(true)
      })
    }
  }, [activeDmConversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToBottom = useCallback(() => {
    virtualizer.scrollToIndex(groups.length - 1, { align: 'end' })
    setIsAtBottom(true)
    setHasNewMessages(false)
  }, [virtualizer, groups.length])

  // Send handler
  const handleSend = useCallback(
    async (content: string) => {
      if (activeDmConversationId && peerInfo) {
        await sendDmMessage(activeDmConversationId, peerInfo.pubkey, content)
      }
    },
    [activeDmConversationId, peerInfo, sendDmMessage]
  )

  if (!activeConversation || !peerInfo) {
    return null
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* Conversation header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-4">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {peerInfo.displayName}
        </span>
        <EncryptionIndicator mode="e2e" />
      </div>

      {/* Encryption banner (conditional) */}
      {!dmEncryptionBannerDismissed && (
        <EncryptionBanner
          recipientName={peerInfo.displayName}
          onDismiss={dismissEncryptionBanner}
        />
      )}

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

        {/* Empty conversation state */}
        {!loading && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--color-text-muted)]"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Start a conversation with {peerInfo.displayName}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Messages are end-to-end encrypted.
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
                  {group.type === 'date-separator' && (
                    <div className="flex items-center gap-2 px-4 py-2">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="shrink-0 text-[11px] font-semibold text-[var(--color-text-muted)]">
                        {group.dayLabel}
                      </span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                  )}

                  {group.type === 'key-rotation' && group.keyRotation && (
                    <KeyRotationNotice
                      displayName={group.keyRotation.displayName}
                      timestamp={group.keyRotation.timestamp}
                    />
                  )}

                  {group.type === 'messages' && group.messages && (
                    <div>
                      {group.messages.map((msg, idx) => (
                        <DmMessageRow
                          key={msg.id}
                          message={msg}
                          isGrouped={idx > 0}
                        />
                      ))}
                    </div>
                  )}
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

      {/* Message composer */}
      <DmComposer
        conversationId={activeDmConversationId!}
        recipientPubkey={peerInfo.pubkey}
        recipientDisplayName={peerInfo.displayName}
        onSend={handleSend}
        onMessageSent={scrollToBottom}
      />
    </div>
  )
}
