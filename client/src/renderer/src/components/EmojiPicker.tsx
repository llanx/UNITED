/**
 * Emoji picker popover wrapping emoji-picker-react.
 *
 * Features:
 * - Lazy loaded via React.lazy (package is ~2.5MB)
 * - Rendered in a portal to avoid overflow clipping
 * - Dark theme, native Unicode emoji, search bar, recently-used
 * - Positioned near trigger element
 * - Dismissed on click outside or Escape key
 */

import React, { Suspense, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

const LazyEmojiPicker = React.lazy(() => import('emoji-picker-react'))

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  anchorX: number
  anchorY: number
}

export default function EmojiPicker({ onSelect, onClose, anchorX, anchorY }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Dismiss on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid the opening click triggering close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  // Dismiss on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Calculate position to keep picker on screen
  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1000,
    left: Math.min(anchorX, window.innerWidth - 360),
    top: anchorY - 420 > 0 ? anchorY - 420 : anchorY + 30,
  }

  const handleEmojiClick = useCallback(
    (emojiData: { emoji: string }) => {
      onSelect(emojiData.emoji)
      onClose()
    },
    [onSelect, onClose]
  )

  return createPortal(
    <div ref={containerRef} style={style}>
      <Suspense
        fallback={
          <div className="flex h-[400px] w-[350px] items-center justify-center rounded-lg border border-white/10 bg-[var(--color-bg-secondary)] shadow-xl">
            <span className="text-sm text-[var(--color-text-muted)]">Loading emoji picker...</span>
          </div>
        }
      >
        <div className="overflow-hidden rounded-lg border border-white/10 shadow-xl">
          <LazyEmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={'dark' as any}
            width={350}
            height={400}
            searchPlaceholder="Search emoji..."
            lazyLoadEmojis
          />
        </div>
      </Suspense>
    </div>,
    document.body
  )
}
