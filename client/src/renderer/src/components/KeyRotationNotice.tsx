/**
 * Inline system message for key rotation events.
 *
 * Styled like WhatsApp's yellow "security code changed" notice.
 * Appears inline in the message list, positioned by timestamp.
 */

interface KeyRotationNoticeProps {
  displayName: string
  timestamp: number
}

/** Format timestamp for display */
function formatRotationTime(ts: number): string {
  const date = new Date(ts)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function KeyRotationNotice({ displayName, timestamp }: KeyRotationNoticeProps) {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/20 bg-yellow-900/20 px-4 py-1">
        {/* Lock-refresh icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-yellow-300/80"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <span className="text-xs text-yellow-300/80">
          {displayName}&apos;s encryption keys have changed
        </span>
        <span className="text-[10px] text-yellow-300/50">
          {formatRotationTime(timestamp)}
        </span>
      </div>
    </div>
  )
}
