/**
 * Unread indicator for channels and server icons.
 *
 * Shows a red badge with mention count when mentions exist,
 * or returns null if no unread state (parent handles bold name).
 */

interface UnreadBadgeProps {
  /** Total unread message count */
  unreadCount: number
  /** Count of messages mentioning the current user */
  mentionCount: number
}

export default function UnreadBadge({ unreadCount, mentionCount }: UnreadBadgeProps) {
  // Red badge for mentions
  if (mentionCount > 0) {
    return (
      <span className="ml-auto flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
        {mentionCount > 99 ? '99+' : mentionCount}
      </span>
    )
  }

  // No visual badge for unread-only (parent handles bold text)
  return null
}
