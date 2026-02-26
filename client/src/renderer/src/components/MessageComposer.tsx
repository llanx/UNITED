/**
 * Auto-expanding message composer with Enter-to-send and @mention autocomplete.
 *
 * Features:
 * - Auto-expanding textarea (1-5 lines, then scrolls)
 * - Enter sends, Shift+Enter inserts newline
 * - Reply mode with preview bar and cancel
 * - @mention autocomplete on '@' keystroke
 * - Placeholder shows channel name
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ChatMessage } from '@shared/ipc-bridge'
import MentionAutocomplete, { type MentionItem } from './MentionAutocomplete'

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

  // @mention autocomplete state
  const [mentionActive, setMentionActive] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStartIndex, setMentionStartIndex] = useState(-1)
  const [mentionAnchor, setMentionAnchor] = useState({ x: 0, y: 0 })

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

  // Close mention autocomplete when switching channels
  useEffect(() => {
    setMentionActive(false)
  }, [channelId])

  const handleSend = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed || sending) return

    setSending(true)
    setMentionActive(false)
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

  /** Get approximate caret position for dropdown anchor */
  const getCaretAnchor = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return { x: 0, y: 0 }
    const rect = ta.getBoundingClientRect()
    // Approximate: use textarea position (top-left area)
    return { x: rect.left + 12, y: rect.top }
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      const cursorPos = e.target.selectionStart

      setContent(value)

      // Check for @mention trigger
      // Look backwards from cursor for an '@' without a preceding word char
      if (cursorPos > 0) {
        const textBefore = value.slice(0, cursorPos)
        const lastAtIndex = textBefore.lastIndexOf('@')

        if (lastAtIndex >= 0) {
          // Check that '@' is at start or preceded by a space/newline
          const charBefore = lastAtIndex > 0 ? textBefore[lastAtIndex - 1] : ' '
          const isWordBoundary = charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0

          if (isWordBoundary) {
            const query = textBefore.slice(lastAtIndex + 1)
            // Valid mention if no space in query (still typing the mention)
            if (!query.includes(' ') && !query.includes('\n')) {
              setMentionActive(true)
              setMentionQuery(query)
              setMentionStartIndex(lastAtIndex)
              setMentionAnchor(getCaretAnchor())
              return
            }
          }
        }
      }

      setMentionActive(false)
    },
    [getCaretAnchor]
  )

  const handleMentionSelect = useCallback(
    (item: MentionItem) => {
      // Replace @query with mention token
      const prefix = item.type === 'user' ? 'user' : 'role'
      const token = `@[${item.displayName}](${prefix}:${item.id})`
      const before = content.slice(0, mentionStartIndex)
      const cursorPos = textareaRef.current?.selectionStart ?? content.length
      const after = content.slice(cursorPos)
      const newContent = before + token + ' ' + after

      setContent(newContent)
      setMentionActive(false)

      // Re-focus and position cursor after the inserted mention
      requestAnimationFrame(() => {
        const ta = textareaRef.current
        if (ta) {
          ta.focus()
          const newPos = before.length + token.length + 1
          ta.setSelectionRange(newPos, newPos)
        }
      })
    },
    [content, mentionStartIndex]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // When mention autocomplete is active, let it handle navigation keys
      if (mentionActive) {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) {
          // Don't handle here -- MentionAutocomplete handles via document listener
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setMentionActive(false)
          return
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      if (e.key === 'Escape' && replyTo) {
        onCancelReply()
      }
    },
    [handleSend, replyTo, onCancelReply, mentionActive]
  )

  return (
    <div className="relative shrink-0 border-t border-white/5 px-4 py-3">
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

      {/* @mention autocomplete dropdown */}
      {mentionActive && (
        <MentionAutocomplete
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={() => setMentionActive(false)}
          anchorX={mentionAnchor.x}
          anchorY={mentionAnchor.y}
        />
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
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
