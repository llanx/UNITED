import type { MemberResponse, RoleResponse } from '@shared/ipc-bridge'

interface MemberListProps {
  members: MemberResponse[]
  roles: RoleResponse[]
}

/**
 * Read-only member list displayed in the server sidebar/dropdown "Members" panel.
 * Shows each member with their display name and colored role badges.
 * Editing is done in RoleManagement, not here.
 */
export default function MemberList({ members, roles }: MemberListProps) {
  const roleMap = new Map(roles.map((r) => [r.id, r]))
  const nonDefaultRoles = roles.filter((r) => !r.is_default)

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Members ({members.length})
      </span>

      {members.length === 0 && (
        <p className="py-2 text-xs text-[var(--color-text-muted)]">No members found</p>
      )}

      <div className="flex flex-col gap-1">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5"
          >
            {/* Avatar initial */}
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-[var(--color-text-primary)]">
              {member.display_name.charAt(0).toUpperCase()}
            </div>

            {/* Name */}
            <span
              className={`flex-1 text-sm ${
                member.is_owner ? 'font-bold' : 'font-medium'
              } text-[var(--color-text-primary)]`}
            >
              {member.display_name}
            </span>

            {/* Owner tag */}
            {member.is_owner && (
              <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-semibold text-amber-400">
                OWNER
              </span>
            )}

            {/* Role badges (non-default only) */}
            {member.role_ids
              .map((rid) => roleMap.get(rid))
              .filter((r): r is RoleResponse => r != null && !r.is_default)
              .map((role) => (
                <span
                  key={role.id}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white"
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
        ))}
      </div>
    </div>
  )
}
