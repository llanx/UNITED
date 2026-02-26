/**
 * DM-specific message row component.
 *
 * Similar to channel MessageRow but with DM-specific features:
 * - Lock icon (E2E encrypted) instead of signed checkmark
 * - Decryption failure handling
 * - Offline separator
 * - No reactions or hover toolbar (DMs v1 keep it simple)
 * - Right-click context menu: Copy Text, Delete for Me, Copy Message ID
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { DecryptedDmMessage } from '@shared/ipc-bridge'
import { useStore } from '../stores'
import MarkdownContent from './MarkdownContent'
import EncryptionIndicator from './EncryptionIndicator'

interface DmMessageRowProps {
  message: DecryptedDmMessage
  isGrouped: boolean
  isOfflineSeparator?: boolean
}

/** Derive a consistent hue from a pubkey string for avatar color */
function pubkeyToHue(pubkey: string): number {
  let hash = 0
  for (let i = 0; i < pubkey.length; i++) {
    hash = pubkey.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  return Math.abs(hash) % 360
}

/** Format timestamp for display */
function formatTime(timestamp: number): string {
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
function formatExactTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

export default function DmMessageRow({
  message,
  isGrouped,
  isOfflineSeparator,
}: DmMessageRowProps) {
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const deleteLocalDmMessage = useStore((s) => s.deleteLocalDmMessage)

  const avatarHue = pubkeyToHue(message.senderPubkey)

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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCopyText = useCallback(() => {
    navigator.clipboard.writeText(message.content).catch(() => {})
    setContextMenuPos(null)
  }, [message.content])

  const handleDeleteForMe = useCallback(() => {
    deleteLocalDmMessage(message.conversationId, message.id)
    setContextMenuPos(null)
  }, [message.conversationId, message.id, deleteLocalDmMessage])

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(message.id).catch(() => {})
    setContextMenuPos(null)
  }, [message.id])

  // Render message content (or decryption failure)
  const renderContent = () => {
    if (message.decryptionFailed) {
      return (
        <div className="flex items-center gap-1.5 text-sm italic text-[var(--color-text-muted)]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-yellow-500/70"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span title="This message could not be decrypted. The sender may have rotated their keys.">
            [Unable to decrypt this message]
          </span>
        </div>
      )
    }

    return (
      <div className="text-sm text-[var(--color-text-primary)]">
        <MarkdownContent content={message.content} />
      </div>
    )
  }

  // Grouped message (continuation)
  if (isGrouped) {
    return (
      <>
        {isOfflineSeparator && <OfflineSeparator />}
        <div
          className="group relative flex py-0.5 pl-[56px] pr-4 hover:bg-white/[0.02]"
          onContextMenu={handleContextMenu}
          title={formatExactTime(message.timestamp)}
        >
          <div className="min-w-0 flex-1">
            {renderContent()}
          </div>

          {contextMenuPos && (
            <DmContextMenu
              ref={contextMenuRef}
              x={contextMenuPos.x}
              y={contextMenuPos.y}
              onCopyText={handleCopyText}
              onDeleteForMe={handleDeleteForMe}
              onCopyId={handleCopyId}
            />
          )}
        </div>
      </>
    )
  }

  // Full message (first in group)
  return (
    <>
      {isOfflineSeparator && <OfflineSeparator />}
      <div
        className="group relative flex gap-3 px-4 py-1 hover:bg-white/[0.02]"
        onContextMenu={handleContextMenu}
      >
        {/* Avatar */}
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: `hsl(${avatarHue}, 60%, 45%)` }}
        >
          {message.senderDisplayName.charAt(0).toUpperCase()}
        </div>

        {/* Message content */}
        <div className="min-w-0 flex-1">
          {/* Header: name, timestamp, lock icon */}
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              {message.senderDisplayName}
            </span>
            <span className="text-[11px] text-[var(--color-text-muted)]">
              {formatTime(message.timestamp)}
            </span>
            <EncryptionIndicator mode="e2e" />
          </div>

          {/* Message body */}
          {renderContent()}
        </div>

        {contextMenuPos && (
          <DmContextMenu
            ref={contextMenuRef}
            x={contextMenuPos.x}
            y={contextMenuPos.y}
            onCopyText={handleCopyText}
            onDeleteForMe={handleDeleteForMe}
            onCopyId={handleCopyId}
          />
        )}
      </div>
    </>
  )
}

// ============================================================
// Offline Separator
// ============================================================

function OfflineSeparator() {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="h-px flex-1 bg-white/10" />
      <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">
        Messages received while you were offline
      </span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  )
}

// ============================================================
// DM Context Menu
// ============================================================

interface DmContextMenuProps {
  x: number
  y: number
  onCopyText: () => void
  onDeleteForMe: () => void
  onCopyId: () => void
}

const DmContextMenu = React.forwardRef<HTMLDivElement, DmContextMenuProps>(
  function DmContextMenu({ x, y, onCopyText, onDeleteForMe, onCopyId }, ref) {
    return (
      <div
        ref={ref}
        className="fixed z-50 min-w-[160px] rounded-lg border border-white/10 bg-[var(--color-bg-rail)] py-1 shadow-xl"
        style={{ left: x, top: y }}
      >
        <button
          className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)]"
          onClick={onCopyText}
        >
          Copy Text
        </button>
        <button
          className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
          onClick={onDeleteForMe}
        >
          Delete for Me
        </button>
        <div className="my-1 border-t border-white/5" />
        <button
          className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)]"
          onClick={onCopyId}
        >
          Copy Message ID
        </button>
      </div>
    )
  }
)
