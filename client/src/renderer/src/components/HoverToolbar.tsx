/**
 * Small floating toolbar that appears on message hover.
 *
 * Shows quick action buttons: React (emoji), Reply, More (context menu).
 * Positioned absolutely at top-right of the hovered message.
 */

import React from 'react'

interface HoverToolbarProps {
  onReact: () => void
  onReply: () => void
  onMore: (e: React.MouseEvent) => void
}

export default function HoverToolbar({ onReact, onReply, onMore }: HoverToolbarProps) {
  return (
    <div className="absolute -top-3 right-2 z-10 flex flex-row gap-0.5 rounded border border-white/10 bg-[var(--color-bg-secondary)] p-0.5 shadow-lg">
      {/* React button */}
      <button
        onClick={onReact}
        className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text-primary)]"
        title="Add Reaction"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {/* Reply button */}
      <button
        onClick={onReply}
        className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text-primary)]"
        title="Reply"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h10a5 5 0 015 5v3M3 10l6 6M3 10l6-6"
          />
        </svg>
      </button>

      {/* More button */}
      <button
        onClick={onMore}
        className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text-primary)]"
        title="More"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
          />
        </svg>
      </button>
    </div>
  )
}
