/**
 * Groups consecutive messages from the same sender within a 5-minute window.
 *
 * Renders the first message with full header (avatar, name, timestamp)
 * and subsequent messages as compact continuation rows.
 * Optionally renders a date separator above the group.
 */

import type { ChatMessage } from '@shared/ipc-bridge'
import MessageRow from './MessageRow'

interface MessageGroupProps {
  messages: ChatMessage[]
  isFirstInDay: boolean
  dayLabel: string
  onReply: (message: ChatMessage) => void
  onScrollToMessage?: (messageId: string) => void
}

export default function MessageGroup({
  messages,
  isFirstInDay,
  dayLabel,
  onReply,
  onScrollToMessage,
}: MessageGroupProps) {
  if (messages.length === 0) return null

  return (
    <div>
      {/* Date separator */}
      {isFirstInDay && (
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="h-px flex-1 bg-white/10" />
          <span className="shrink-0 text-[11px] font-semibold text-[var(--color-text-muted)]">
            {dayLabel}
          </span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      )}

      {/* First message: full display */}
      <MessageRow
        message={messages[0]}
        isGrouped={false}
        onReply={onReply}
        onScrollToMessage={onScrollToMessage}
      />

      {/* Subsequent messages: grouped (compact) display */}
      {messages.slice(1).map((msg) => (
        <MessageRow
          key={msg.id}
          message={msg}
          isGrouped={true}
          onReply={onReply}
          onScrollToMessage={onScrollToMessage}
        />
      ))}
    </div>
  )
}

// ============================================================
// Grouping logic (exported for use in ChatView)
// ============================================================

/** Maximum time gap (ms) for messages to be grouped together */
const GROUP_TIME_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export interface MessageGroupData {
  id: string // Use first message's ID as group key
  messages: ChatMessage[]
  isFirstInDay: boolean
  dayLabel: string
}

/**
 * Process a flat array of messages into groups.
 * Groups consecutive messages from the same sender within 5 minutes.
 * Detects day boundaries for date separators.
 */
export function groupMessages(messages: ChatMessage[]): MessageGroupData[] {
  if (messages.length === 0) return []

  const groups: MessageGroupData[] = []
  let currentGroup: ChatMessage[] = [messages[0]]
  let lastDate = new Date(messages[0].timestamp)
  let currentDayKey = dayKey(lastDate)
  let seenDays = new Set<string>([currentDayKey])

  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i]
    const prev = messages[i - 1]
    const msgDate = new Date(msg.timestamp)
    const prevDate = new Date(prev.timestamp)
    const msgDayKey = dayKey(msgDate)

    const sameUser = msg.sender_pubkey === prev.sender_pubkey
    const withinWindow = msgDate.getTime() - prevDate.getTime() <= GROUP_TIME_WINDOW_MS
    const sameDay = msgDayKey === dayKey(prevDate)

    if (sameUser && withinWindow && sameDay) {
      // Continue current group
      currentGroup.push(msg)
    } else {
      // Flush current group
      const groupDayKey = dayKey(new Date(currentGroup[0].timestamp))
      const isFirstInDay = !seenDays.has(groupDayKey) || groups.length === 0
      if (groups.length === 0) {
        // First group is always "first in day"
        groups.push({
          id: currentGroup[0].id,
          messages: currentGroup,
          isFirstInDay: true,
          dayLabel: formatDayLabel(new Date(currentGroup[0].timestamp)),
        })
      } else {
        groups.push({
          id: currentGroup[0].id,
          messages: currentGroup,
          isFirstInDay: !seenDays.has(groupDayKey),
          dayLabel: formatDayLabel(new Date(currentGroup[0].timestamp)),
        })
      }
      seenDays.add(groupDayKey)

      // Start new group
      currentGroup = [msg]

      // Track day change
      if (!seenDays.has(msgDayKey)) {
        // This will be the first group of a new day
      }
    }
  }

  // Flush final group
  if (currentGroup.length > 0) {
    const groupDayKey = dayKey(new Date(currentGroup[0].timestamp))
    groups.push({
      id: currentGroup[0].id,
      messages: currentGroup,
      isFirstInDay: groups.length === 0 || !seenDays.has(groupDayKey),
      dayLabel: formatDayLabel(new Date(currentGroup[0].timestamp)),
    })
    seenDays.add(groupDayKey)
  }

  return groups
}

/** Create a day key string from a date (YYYY-MM-DD) */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Format a date for the day separator label */
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
