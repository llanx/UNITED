/**
 * Message composer for DMs with encryption key status awareness.
 *
 * Features:
 * - Auto-expanding textarea (1-5 lines, then scrolls)
 * - Enter sends, Shift+Enter newline
 * - Lock icon indicating E2E encryption
 * - Disabled state when peer key is unavailable
 * - Polls key status every 10 seconds while waiting
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '../stores'
import { useDmKeyStatus } from '../hooks/useDm'
import EncryptionIndicator from './EncryptionIndicator'

interface DmComposerProps {
  conversationId: string
  recipientPubkey: string
  recipientDisplayName: string
  onSend: (content: string) => Promise<void>
  onMessageSent: () => void
}

const MIN_HEIGHT = 40
const MAX_HEIGHT = 120

export default function DmComposer({
  conversationId,
  recipientPubkey,
  recipientDisplayName,
  onSend,
  onMessageSent,
}: DmComposerProps) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Connection status awareness — disable input when WS is disconnected
  const status = useStore((s) => s.status)
  const isDisconnected = status !== 'connected'

  const { keyAvailable, loading: keyLoading } = useDmKeyStatus(recipientPubkey)

  // Poll key status every 10 seconds if key is not available
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkPeerKeyStatus = useRef(
    () => window.united.dm.getPeerKeyStatus(recipientPubkey)
  )

  useEffect(() => {
    checkPeerKeyStatus.current = () =>
      window.united.dm.getPeerKeyStatus(recipientPubkey)
  }, [recipientPubkey])

  useEffect(() => {
    if (keyAvailable || keyLoading) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    // Key not available: poll every 10 seconds
    pollRef.current = setInterval(() => {
      checkPeerKeyStatus.current().catch(() => {})
    }, 10000)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [keyAvailable, keyLoading])

  // Auto-resize textarea
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

  // Clear input when switching conversations
  useEffect(() => {
    setContent('')
    if (textareaRef.current) {
      textareaRef.current.style.height = `${MIN_HEIGHT}px`
    }
  }, [conversationId])

  const handleSend = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed || sending || !keyAvailable || isDisconnected) return

    setSending(true)
    try {
      await onSend(trimmed)
      setContent('')
      onMessageSent()
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_HEIGHT}px`
      }
      textareaRef.current?.focus()
    } catch (err) {
      console.error('Failed to send DM:', err)
    } finally {
      setSending(false)
    }
  }, [content, sending, keyAvailable, isDisconnected, onSend, onMessageSent])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const isDisabled = !keyAvailable || keyLoading || isDisconnected

  return (
    <div className="relative shrink-0 border-t border-white/5 px-4 py-3">
      <div className="relative">
        {/* Lock icon in the composer area */}
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <EncryptionIndicator mode="e2e" />
        </div>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isDisconnected
              ? 'Reconnecting...'
              : isDisabled
                ? `Waiting for encryption keys from ${recipientDisplayName}`
                : `Message ${recipientDisplayName}`
          }
          className={`w-full resize-none rounded-lg border border-white/10 bg-[var(--color-bg-tertiary)] py-3 pl-8 pr-3 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-white/20 ${
            isDisabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
          style={{
            minHeight: `${MIN_HEIGHT}px`,
            maxHeight: `${MAX_HEIGHT}px`,
            overflowY: 'hidden',
          }}
          disabled={sending || isDisabled}
        />
      </div>
    </div>
  )
}
