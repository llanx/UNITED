/**
 * User profile popup/popover.
 *
 * Appears when clicking a member in the sidebar.
 * Shows: avatar (64px), display name, role badges, presence status, pubkey fingerprint.
 * Dismiss: click outside or press Escape.
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import PresenceIndicator from './PresenceIndicator'
import { useStore } from '../stores'
import type { MemberResponse, RoleResponse } from '@shared/ipc-bridge'

interface UserProfilePopupProps {
  member: MemberResponse
  roles: RoleResponse[]
  status: 'online' | 'away' | 'dnd' | 'offline'
  position: { top: number; right: number }
  onClose: () => void
}

/**
 * Derive a deterministic HSL hue from a pubkey string.
 * Uses a simple hash to map to 0-360 range.
 */
function pubkeyToHue(pubkey: string): number {
  let hash = 0
  for (let i = 0; i < pubkey.length; i++) {
    hash = ((hash << 5) - hash + pubkey.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

export default function UserProfilePopup({
  member,
  roles,
  status,
  position,
  onClose,
}: UserProfilePopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid closing from the click that opened the popup
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  const hue = useMemo(() => pubkeyToHue(member.pubkey), [member.pubkey])

  const memberRoles = useMemo(() => {
    const roleMap = new Map(roles.map((r) => [r.id, r]))
    return member.role_ids
      .map((rid) => roleMap.get(rid))
      .filter((r): r is RoleResponse => r != null && !r.is_default)
  }, [member.role_ids, roles])

  // Truncate pubkey fingerprint for display (first 16 chars + ...)
  const truncatedPubkey = member.pubkey.length > 16
    ? `${member.pubkey.slice(0, 16)}...`
    : member.pubkey

  const handleCopyPubkey = useCallback(() => {
    navigator.clipboard.writeText(member.pubkey).catch(() => {})
  }, [member.pubkey])

  // DM: "Message" button
  const publicKey = useStore((s) => s.publicKey)
  const createConversation = useStore((s) => s.createConversation)
  const setDmView = useStore((s) => s.setDmView)
  const setActiveDmConversation = useStore((s) => s.setActiveDmConversation)
  const [startingDm, setStartingDm] = useState(false)

  const currentPubkeyHex = useMemo(() => {
    if (!publicKey) return null
    return Array.from(publicKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }, [publicKey])

  const isSelf = currentPubkeyHex === member.pubkey

  const handleMessageClick = useCallback(async () => {
    if (startingDm) return
    setStartingDm(true)
    try {
      const conversation = await createConversation(member.pubkey)
      setDmView(true)
      setActiveDmConversation(conversation.id)
      useStore.setState({ activeChannelId: null })
      onClose()
    } catch (err) {
      console.error('Failed to start DM:', err)
    } finally {
      setStartingDm(false)
    }
  }, [member.pubkey, startingDm, createConversation, setDmView, setActiveDmConversation, onClose])

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-64 rounded-lg border border-white/10 bg-[var(--color-bg-secondary)] shadow-xl"
      style={{ top: position.top, right: position.right }}
    >
      {/* Banner / top area */}
      <div
        className="h-16 rounded-t-lg"
        style={{ backgroundColor: `hsl(${hue}, 50%, 25%)` }}
      />

      {/* Avatar overlapping banner */}
      <div className="relative px-4">
        <div
          className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full border-4 border-[var(--color-bg-secondary)] text-xl font-bold text-white"
          style={{ backgroundColor: `hsl(${hue}, 50%, 40%)` }}
        >
          {member.display_name.charAt(0).toUpperCase()}
          {/* Presence dot overlay */}
          <div className="absolute bottom-0 right-0 rounded-full border-2 border-[var(--color-bg-secondary)]">
            <PresenceIndicator status={status} size="md" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3 px-4 pb-4 pt-2">
        {/* Name + owner badge */}
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-[var(--color-text-primary)]">
            {member.display_name}
          </span>
          {member.is_owner && (
            <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-semibold text-amber-400">
              OWNER
            </span>
          )}
        </div>

        {/* Presence status */}
        <PresenceIndicator status={status} size="sm" showLabel />

        {/* Role badges */}
        {memberRoles.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {memberRoles.map((role) => (
              <span
                key={role.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: role.color ?? '#8b8b8b' }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}
                />
                {role.name}
              </span>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-white/5" />

        {/* Public key fingerprint */}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Public Key
          </span>
          <p
            className="mt-0.5 cursor-pointer select-all break-all rounded bg-white/5 px-2 py-1 font-mono text-[11px] text-[var(--color-text-secondary)] hover:bg-white/10"
            title="Click to copy full public key"
            onClick={handleCopyPubkey}
          >
            {truncatedPubkey}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!isSelf && (
            <button
              onClick={handleMessageClick}
              disabled={startingDm}
              className="flex-1 rounded bg-blue-500/80 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {startingDm ? 'Opening...' : 'Message'}
            </button>
          )}
          <button
            onClick={handleCopyPubkey}
            className={`rounded bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-white/10 ${
              isSelf ? 'w-full' : ''
            }`}
          >
            Copy Public Key
          </button>
        </div>
      </div>
    </div>
  )
}
