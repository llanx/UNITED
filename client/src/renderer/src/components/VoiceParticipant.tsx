/**
 * Single voice participant entry shown inline in the sidebar under a voice channel.
 *
 * Displays avatar with speaking glow, display name, mute/deafen status icons.
 * Right-click context menu provides per-user volume slider (0-200%).
 */

import { useState, useRef, useEffect } from 'react'
import { useStore } from '../stores'
import type { VoiceParticipantState } from '../stores/voice'

interface VoiceParticipantProps {
  participant: VoiceParticipantState
}

/** Generate a deterministic hue from a hex pubkey for avatar color */
function pubkeyToHue(pubkey: string): number {
  let hash = 0
  for (let i = 0; i < pubkey.length; i++) {
    hash = pubkey.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash) % 360
}

export default function VoiceParticipant({ participant }: VoiceParticipantProps) {
  const setUserVolume = useStore((s) => s.setUserVolume)
  const userVolumes = useStore((s) => s.userVolumes)
  const volume = userVolumes[participant.userId] ?? 100

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const avatarHue = pubkeyToHue(participant.pubkey)
  const initial = participant.displayName.charAt(0).toUpperCase()

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 rounded px-2 py-0.5 text-xs hover:bg-white/5"
        onContextMenu={handleContextMenu}
      >
        {/* Avatar with speaking glow */}
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{
            backgroundColor: `hsl(${avatarHue}, 50%, 40%)`,
            boxShadow: participant.speaking
              ? '0 0 0 2px #43b581, 0 0 8px #43b581'
              : 'none',
            transition: 'box-shadow 150ms ease',
          }}
        >
          {initial}
        </div>

        {/* Display name */}
        <span className="truncate text-[var(--color-text-muted)]">
          {participant.displayName}
        </span>

        {/* Status icons */}
        <div className="ml-auto flex items-center gap-0.5">
          {participant.muted && (
            <svg className="h-3 w-3 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="Muted">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 19L5 5m0 0l14 14M12 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <line x1="3" y1="3" x2="21" y2="21" strokeWidth={2} strokeLinecap="round" />
            </svg>
          )}
          {participant.deafened && (
            <svg className="h-3 w-3 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="Deafened">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 18v-6a9 9 0 0118 0v6" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" />
              <line x1="3" y1="3" x2="21" y2="21" strokeWidth={2} strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Right-click context menu with volume slider */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-[200px] rounded-lg border border-white/10 bg-[var(--color-bg-rail)] p-3 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="mb-1 text-xs font-medium text-[var(--color-text-primary)]">
            {participant.displayName}
          </div>
          <label className="mb-1 block text-[10px] text-[var(--color-text-muted)]">
            Volume: {volume}%
          </label>
          <input
            type="range"
            min={0}
            max={200}
            value={volume}
            onChange={(e) => setUserVolume(participant.userId, parseInt(e.target.value, 10))}
            className="w-full accent-[var(--color-accent)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--color-text-muted)]">
            <span>0%</span>
            <span>200%</span>
          </div>
        </div>
      )}
    </div>
  )
}
