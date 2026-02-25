import { useRoles } from '../hooks/useRoles'

/**
 * Server member list placeholder.
 * Full member list API will be added in a later phase.
 * For now, shows a message indicating this is a placeholder.
 */
export default function MemberList() {
  const { roles } = useRoles()

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--color-text-muted)]">
        Member list will be available when the member API is implemented.
        Currently {roles.length} role{roles.length !== 1 ? 's' : ''} configured.
      </p>

      {/* Show roles as a preview */}
      {roles.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Server Roles
          </span>
          {roles.map((role) => (
            <div key={role.id} className="flex items-center gap-2 rounded px-2 py-1">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: role.color ?? '#8b8b8b' }}
              />
              <span className="text-sm text-[var(--color-text-primary)]">{role.name}</span>
              {role.is_default && (
                <span className="text-[10px] text-[var(--color-text-muted)]">default</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
