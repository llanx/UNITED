/**
 * Auto-expanding message composer with Enter-to-send.
 *
 * Features:
 * - Auto-expanding textarea (1-5 lines, then scrolls)
 * - Enter sends, Shift+Enter inserts newline
 * - Reply mode with preview bar and cancel
 * - Placeholder shows channel name
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ChatMessage } from '@shared/ipc-bridge'

interface MessageComposerProps {
  channelId: string
  channelName: string
  replyTo: ChatMessage | null
  onCancelReply: () => void
  onMessageSent: () => void
}

/** Min/max heights for auto-expand */
const MIN_HEIGHT = 40
const MAX_HEIGHT = 120

export default function MessageComposer({
  channelId,
  channelName,
  replyTo,
  onCancelReply,
  onMessageSent,
}: MessageComposerProps) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea based on content
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = `${MIN_HEIGHT}px`
    const scrollHeight = ta.scrollHeight
    ta.style.height = `${Math.min(scrollHeight, MAX_HEIGHT)}px`
    ta.style.overflowY = scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [content, adjustHeight])

  // Focus textarea when reply mode activates
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus()
    }
  }, [replyTo])

  const handleSend = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed || sending) return

    setSending(true)
    try {
      await window.united.chat.send(channelId, trimmed, replyTo?.id)
      setContent('')
      onCancelReply()
      onMessageSent()
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_HEIGHT}px`
      }
      textareaRef.current?.focus()
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }, [content, channelId, replyTo, sending, onCancelReply, onMessageSent])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      if (e.key === 'Escape' && replyTo) {
        onCancelReply()
      }
    },
    [handleSend, replyTo, onCancelReply]
  )

  return (
    <div className="shrink-0 border-t border-white/5 px-4 py-3">
      {/* Reply preview bar */}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded border-l-2 border-[var(--color-accent)] bg-white/5 px-3 py-1.5">
          <span className="flex-1 truncate text-xs text-[var(--color-text-muted)]">
            Replying to{' '}
            <span className="font-semibold text-[var(--color-text-primary)]">
              {replyTo.sender_display_name}
            </span>
            :{' '}
            {replyTo.content.length > 80
              ? replyTo.content.slice(0, 80) + '...'
              : replyTo.content}
          </span>
          <button
            onClick={onCancelReply}
            className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
            title="Cancel reply"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Message #${channelName}`}
        className="w-full resize-none rounded-lg border border-white/10 bg-[var(--color-bg-tertiary)] p-3 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-white/20"
        style={{
          minHeight: `${MIN_HEIGHT}px`,
          maxHeight: `${MAX_HEIGHT}px`,
          overflowY: 'hidden',
        }}
        disabled={sending}
      />
    </div>
  )
}
