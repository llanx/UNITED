/**
 * Compact reaction pills displayed below messages.
 *
 * Each pill shows emoji + count. The current user's reactions are highlighted.
 * Clicking a pill toggles the reaction. Hovering shows who reacted.
 * A "+" button at the end opens the EmojiPicker to add a new reaction.
 */

import { useState, useCallback } from 'react'
import type { ReactionSummary } from '@shared/ipc-bridge'
import EmojiPicker from './EmojiPicker'

interface ReactionPillsProps {
  reactions: ReactionSummary[]
  messageId: string
  currentUserPubkey: string | null
  /** Map of pubkey -> display name for tooltip */
  displayNameMap?: Record<string, string>
}

export default function ReactionPills({
  reactions,
  messageId,
  currentUserPubkey,
  displayNameMap,
}: ReactionPillsProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const handleToggle = useCallback(
    async (emoji: string, hasReacted: boolean) => {
      try {
        if (hasReacted) {
          await window.united.reactions.remove(messageId, emoji)
        } else {
          await window.united.reactions.add(messageId, emoji)
        }
      } catch (err) {
        console.error('Reaction toggle failed:', err)
      }
    },
    [messageId]
  )

  const handleAddReaction = useCallback(
    (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setPickerAnchor({ x: rect.left, y: rect.bottom + 4 })
      setShowPicker(true)
    },
    []
  )

  const handlePickerSelect = useCallback(
    async (emoji: string) => {
      try {
        await window.united.reactions.add(messageId, emoji)
      } catch (err) {
        console.error('Failed to add reaction:', err)
      }
    },
    [messageId]
  )

  /** Build tooltip string of display names who reacted */
  function getReactorNames(userPubkeys: string[]): string {
    const names = userPubkeys.slice(0, 10).map((pk) => {
      if (displayNameMap && displayNameMap[pk]) return displayNameMap[pk]
      return pk.slice(0, 8) + '...'
    })
    const remaining = userPubkeys.length - 10
    if (remaining > 0) {
      names.push(`and ${remaining} more`)
    }
    return names.join(', ')
  }

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {reactions.map((r) => {
          const hasReacted = currentUserPubkey
            ? r.user_pubkeys.includes(currentUserPubkey)
            : false

          return (
            <button
              key={r.emoji}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                hasReacted
                  ? 'border-blue-400/30 bg-blue-500/20 text-[var(--color-text-primary)]'
                  : 'border-white/10 bg-white/5 text-[var(--color-text-muted)] hover:bg-white/10'
              }`}
              onClick={() => handleToggle(r.emoji, hasReacted)}
              title={getReactorNames(r.user_pubkeys)}
            >
              <span>{r.emoji}</span>
              <span>{r.count}</span>
            </button>
          )
        })}

        {/* Add reaction button */}
        <button
          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text-primary)]"
          onClick={handleAddReaction}
          title="Add Reaction"
        >
          +
        </button>
      </div>

      {showPicker && (
        <EmojiPicker
          onSelect={handlePickerSelect}
          onClose={() => setShowPicker(false)}
          anchorX={pickerAnchor.x}
          anchorY={pickerAnchor.y}
        />
      )}
    </>
  )
}
