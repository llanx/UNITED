/**
 * Right sidebar member list with presence dots and status grouping.
 *
 * Groups members by presence status: Online first, then Away, then DND, then Offline.
 * Each group has a header label with count.
 * Each member row shows avatar with presence dot overlay, display name, role badges.
 * Clicking a member opens UserProfilePopup.
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import { useStore } from '../stores'
import PresenceIndicator from './PresenceIndicator'
import UserProfilePopup from './UserProfilePopup'
import type { MemberResponse, RoleResponse } from '@shared/ipc-bridge'

type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline'

const STATUS_ORDER: PresenceStatus[] = ['online', 'away', 'dnd', 'offline']
const STATUS_HEADERS: Record<PresenceStatus, string> = {
  online: 'ONLINE',
  away: 'AWAY',
  dnd: 'DO NOT DISTURB',
  offline: 'OFFLINE',
}

interface MemberWithPresence {
  member: MemberResponse
  status: PresenceStatus
}

/**
 * Derive a deterministic HSL hue from a string.
 */
function stringToHue(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

export default function MemberListSidebar() {
  const members = useStore((s) => s.members)
  const roles = useStore((s) => s.roles)
  const userPresence = useStore((s) => s.userPresence)
  const fetchMembers = useStore((s) => s.fetchMembers)
  const fetchRoles = useStore((s) => s.fetchRoles)

  // Fetch members and roles on mount
  useEffect(() => {
    fetchMembers().catch(() => {})
    fetchRoles().catch(() => {})
  }, [fetchMembers, fetchRoles])

  // Popup state
  const [selectedMember, setSelectedMember] = useState<{
    member: MemberResponse
    position: { top: number; right: number }
  } | null>(null)

  const handleMemberClick = useCallback(
    (member: MemberResponse, e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setSelectedMember({
        member,
        position: {
          top: Math.max(0, rect.top - 20),
          // Position to the left of the sidebar
          right: window.innerWidth - rect.left + 8,
        },
      })
    },
    []
  )

  const handleClosePopup = useCallback(() => {
    setSelectedMember(null)
  }, [])

  // Resolve presence for each member and group by status
  const grouped = useMemo(() => {
    const membersWithPresence: MemberWithPresence[] = members.map((member) => {
      // Presence store is keyed by pubkey — use member.pubkey for lookup
      const presenceInfo = userPresence[member.pubkey]
      const status: PresenceStatus = presenceInfo?.status ?? 'offline'
      return { member, status }
    })

    const groups: Record<PresenceStatus, MemberWithPresence[]> = {
      online: [],
      away: [],
      dnd: [],
      offline: [],
    }

    for (const mp of membersWithPresence) {
      groups[mp.status].push(mp)
    }

    // Sort within groups alphabetically by display name
    for (const key of STATUS_ORDER) {
      groups[key].sort((a, b) =>
        a.member.display_name.localeCompare(b.member.display_name)
      )
    }

    return groups
  }, [members, userPresence])

  const roleMap = useMemo(
    () => new Map(roles.map((r) => [r.id, r])),
    [roles]
  )

  return (
    <div className="flex w-60 shrink-0 flex-col border-l border-white/5 bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="flex h-12 items-center px-3">
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">
          Members — {members.length}
        </span>
      </div>

      {/* Scrollable member list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {STATUS_ORDER.map((statusKey) => {
          const group = grouped[statusKey]
          if (group.length === 0) return null

          return (
            <div key={statusKey} className="mb-3">
              {/* Group header */}
              <div className="mb-1 px-1 pt-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {STATUS_HEADERS[statusKey]} — {group.length}
                </span>
              </div>

              {/* Member rows */}
              {group.map(({ member, status }) => {
                const hue = stringToHue(member.pubkey)
                const memberRoles = member.role_ids
                  .map((rid) => roleMap.get(rid))
                  .filter((r): r is RoleResponse => r != null && !r.is_default)

                return (
                  <button
                    key={member.id}
                    onClick={(e) => handleMemberClick(member, e)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5"
                  >
                    {/* Avatar with presence dot */}
                    <div className="relative shrink-0">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: `hsl(${hue}, 50%, 40%)` }}
                      >
                        {member.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[var(--color-bg-secondary)]">
                        <PresenceIndicator status={status} size="sm" />
                      </div>
                    </div>

                    {/* Name and role badges */}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={`truncate text-sm ${
                          status === 'offline'
                            ? 'text-[var(--color-text-muted)]'
                            : 'text-[var(--color-text-primary)]'
                        } ${member.is_owner ? 'font-bold' : 'font-medium'}`}
                      >
                        {member.display_name}
                      </span>
                      {/* Role badges (inline, compact) */}
                      {memberRoles.length > 0 && (
                        <div className="flex gap-1 truncate">
                          {memberRoles.slice(0, 2).map((role) => (
                            <span
                              key={role.id}
                              className="inline-flex items-center gap-0.5 rounded-full px-1 py-0 text-[8px] font-medium text-white"
                              style={{ backgroundColor: role.color ?? '#8b8b8b' }}
                            >
                              {role.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Owner badge */}
                    {member.is_owner && (
                      <span className="shrink-0 rounded bg-amber-500/20 px-1 py-0.5 text-[8px] font-semibold text-amber-400">
                        OWNER
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* User profile popup */}
      {selectedMember && (
        <UserProfilePopup
          member={selectedMember.member}
          roles={roles}
          status={
            userPresence[selectedMember.member.pubkey]?.status ?? 'offline'
          }
          position={selectedMember.position}
          onClose={handleClosePopup}
        />
      )}
    </div>
  )
}
