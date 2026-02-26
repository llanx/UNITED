/**
 * Individual message row component.
 *
 * Handles two display modes:
 * - Full: Avatar, display name, timestamp, content (first message in a group)
 * - Grouped: Content only, aligned with full message content (continuation messages)
 *
 * Features: inline reply preview, edited/deleted states, mention highlight,
 * signature verification indicator, hover toolbar, right-click context menu.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { ChatMessage } from '@shared/ipc-bridge'
import { useStore } from '../stores'
import MarkdownContent from './MarkdownContent'
import HoverToolbar from './HoverToolbar'

interface MessageRowProps {
  message: ChatMessage
  isGrouped: boolean
  onReply: (message: ChatMessage) => void
  onScrollToMessage?: (messageId: string) => void
}

/** Derive a consistent hue from a pubkey string for avatar color */
function pubkeyToHue(pubkey: string): number {
  let hash = 0
  for (let i = 0; i < pubkey.length; i++) {
    hash = pubkey.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash) % 360
}

/** Format timestamp for display */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (isToday) return `Today at ${time}`
  if (isYesterday) return `Yesterday at ${time}`
  return `${date.toLocaleDateString()} ${time}`
}

/** Format exact time for tooltip on grouped messages */
function formatExactTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

export default function MessageRow({
  message,
  isGrouped,
  onReply,
  onScrollToMessage,
}: MessageRowProps) {
  const [hovered, setHovered] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const publicKey = useStore((s) => s.publicKey)
  const isOwner = useStore((s) => s.isOwner)

  // Determine if this is the current user's message
  const currentPubkeyHex = publicKey
    ? Array.from(publicKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    : null
  const isOwnMessage = currentPubkeyHex === message.sender_pubkey

  // Mention highlight: check if current user is mentioned
  // ChatMessage doesn't have mention_user_ids currently -- will be wired when added
  const isMentioned = false

  const avatarHue = pubkeyToHue(message.sender_pubkey)

  // Context menu close handler
  useEffect(() => {
    if (!contextMenuPos) return
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuPos(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenuPos])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setContextMenuPos({ x: e.clientX, y: e.clientY })
    },
    []
  )

  const handleReply = useCallback(() => {
    onReply(message)
    setContextMenuPos(null)
  }, [message, onReply])

  const handleEdit = useCallback(async () => {
    // Edit is handled by parent (ChatView) -- for now, close menu
    setContextMenuPos(null)
  }, [])

  const handleDelete = useCallback(async () => {
    try {
      await window.united.chat.delete(message.channel_id, message.id)
    } catch (err) {
      console.error('Failed to delete message:', err)
    }
    setContextMenuPos(null)
  }, [message.channel_id, message.id])

  const handleCopyText = useCallback(() => {
    navigator.clipboard.writeText(message.content).catch(() => {})
    setContextMenuPos(null)
  }, [message.content])

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(message.id).catch(() => {})
    setContextMenuPos(null)
  }, [message.id])

  // Grouped message (continuation)
  if (isGrouped) {
    return (
      <div
        className={`group relative flex py-0.5 pl-[56px] pr-4 hover:bg-white/[0.02] ${
          isMentioned ? 'bg-yellow-500/5' : ''
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={handleContextMenu}
        title={formatExactTime(message.timestamp)}
      >
        <div className="min-w-0 flex-1 text-sm text-[var(--color-text-primary)]">
          <MarkdownContent content={message.content} />
          {message.edited_at && (
            <span className="ml-1 text-[10px] text-[var(--color-text-muted)]">(edited)</span>
          )}
        </div>

        {hovered && (
          <HoverToolbar
            onReact={() => {}}
            onReply={handleReply}
            onMore={(e) => handleContextMenu(e)}
          />
        )}

        {contextMenuPos && (
          <ContextMenu
            ref={contextMenuRef}
            x={contextMenuPos.x}
            y={contextMenuPos.y}
            isOwnMessage={isOwnMessage}
            isAdmin={isOwner}
            onReply={handleReply}
            onEdit={isOwnMessage ? handleEdit : undefined}
            onDelete={isOwnMessage || isOwner ? handleDelete : undefined}
            onCopyText={handleCopyText}
            onCopyId={handleCopyId}
          />
        )}
      </div>
    )
  }

  // Full message (first in group)
  return (
    <div
      className={`group relative flex gap-3 px-4 py-1 hover:bg-white/[0.02] ${
        isMentioned ? 'bg-yellow-500/5' : ''
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={handleContextMenu}
    >
      {/* Avatar */}
      <div
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: `hsl(${avatarHue}, 60%, 45%)` }}
      >
        {message.sender_display_name.charAt(0).toUpperCase()}
      </div>

      {/* Message content */}
      <div className="min-w-0 flex-1">
        {/* Inline reply preview */}
        {message.reply_to_id && message.reply_to_preview && (
          <button
            className="mb-0.5 flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            onClick={() => onScrollToMessage?.(message.reply_to_id!)}
          >
            <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v3M3 10l6 6M3 10l6-6" />
            </svg>
            <span className="truncate border-l-2 border-[var(--color-accent)] pl-1.5">
              {message.reply_to_preview.length > 100
                ? message.reply_to_preview.slice(0, 100) + '...'
                : message.reply_to_preview}
            </span>
          </button>
        )}

        {/* Header: name, timestamp, signature verification */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            {message.sender_display_name}
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {formatTime(message.timestamp)}
          </span>
          {/* Signature verification indicator */}
          <span className="text-[var(--color-text-muted)]" title="Signed message (Ed25519)">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </span>
        </div>

        {/* Message body */}
        <div className="text-sm text-[var(--color-text-primary)]">
          <MarkdownContent content={message.content} />
          {message.edited_at && (
            <span className="ml-1 text-[10px] text-[var(--color-text-muted)]">(edited)</span>
          )}
        </div>

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  r.user_pubkeys.includes(currentPubkeyHex ?? '')
                    ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 text-[var(--color-text-primary)]'
                    : 'border-white/10 bg-white/5 text-[var(--color-text-muted)] hover:bg-white/10'
                }`}
                onClick={async () => {
                  try {
                    if (r.user_pubkeys.includes(currentPubkeyHex ?? '')) {
                      await window.united.reactions.remove(message.id, r.emoji)
                    } else {
                      await window.united.reactions.add(message.id, r.emoji)
                    }
                  } catch (err) {
                    console.error('Reaction toggle failed:', err)
                  }
                }}
                title={r.user_pubkeys.length > 0 ? `${r.count} reaction(s)` : ''}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {hovered && (
        <HoverToolbar
          onReact={() => {}}
          onReply={handleReply}
          onMore={(e) => handleContextMenu(e)}
        />
      )}

      {contextMenuPos && (
        <ContextMenu
          ref={contextMenuRef}
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          isOwnMessage={isOwnMessage}
          isAdmin={isOwner}
          onReply={handleReply}
          onEdit={isOwnMessage ? handleEdit : undefined}
          onDelete={isOwnMessage || isOwner ? handleDelete : undefined}
          onCopyText={handleCopyText}
          onCopyId={handleCopyId}
        />
      )}
    </div>
  )
}

// ============================================================
// Context Menu
// ============================================================

interface ContextMenuProps {
  x: number
  y: number
  isOwnMessage: boolean
  isAdmin: boolean
  onReply: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCopyText: () => void
  onCopyId: () => void
}

const ContextMenu = React.forwardRef<HTMLDivElement, ContextMenuProps>(
  function ContextMenu({ x, y, onReply, onEdit, onDelete, onCopyText, onCopyId }, ref) {
    return (
      <div
        ref={ref}
        className="fixed z-50 min-w-[160px] rounded-lg border border-white/10 bg-[var(--color-bg-rail)] py-1 shadow-xl"
        style={{ left: x, top: y }}
      >
        <ContextMenuItem label="Reply" onClick={onReply} />
        {onEdit && <ContextMenuItem label="Edit Message" onClick={onEdit} />}
        {onDelete && (
          <ContextMenuItem label="Delete Message" onClick={onDelete} danger />
        )}
        <div className="my-1 border-t border-white/5" />
        <ContextMenuItem label="Copy Text" onClick={onCopyText} />
        <ContextMenuItem label="Copy Message ID" onClick={onCopyId} />
      </div>
    )
  }
)

function ContextMenuItem({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      className={`flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
