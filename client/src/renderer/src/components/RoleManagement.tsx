import { useState } from 'react'
import { useStore } from '../stores'
import { useRoles } from '../hooks/useRoles'
import { PERMISSIONS, hasPermission, type PermissionName } from '../stores/roles'

const PERMISSION_LABELS: { key: PermissionName; label: string; description: string }[] = [
  { key: 'SEND_MESSAGES', label: 'Send Messages', description: 'Allows sending messages in text channels' },
  { key: 'MANAGE_CHANNELS', label: 'Manage Channels', description: 'Create, edit, and delete channels and categories' },
  { key: 'KICK_MEMBERS', label: 'Kick Members', description: 'Remove members from the server (they can rejoin)' },
  { key: 'BAN_MEMBERS', label: 'Ban Members', description: 'Permanently ban members from the server' },
  { key: 'ADMIN', label: 'Administrator', description: 'Full server control — overrides all other permissions' },
]

const PRESET_COLORS = [
  '#3ba55c', '#faa61a', '#ed4245', '#5865f2', '#eb459e',
  '#57f287', '#fee75c', '#5865f2', '#9b59b6', '#1abc9c',
]

export default function RoleManagement() {
  const { roles } = useRoles()

  const createRole = useStore((s) => s.createRole)
  const updateRole = useStore((s) => s.updateRole)
  const deleteRole = useStore((s) => s.deleteRole)

  // Create form state
  const [newRoleName, setNewRoleName] = useState('')
  const [newRolePermissions, setNewRolePermissions] = useState(0)
  const [newRoleColor, setNewRoleColor] = useState<string>('')

  // Edit state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPermissions, setEditPermissions] = useState(0)
  const [editColor, setEditColor] = useState<string>('')

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const togglePermission = (current: number, flag: number): number => {
    return current ^ flag
  }

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createRole(
        newRoleName.trim(),
        newRolePermissions,
        newRoleColor || undefined
      )
      setNewRoleName('')
      setNewRolePermissions(0)
      setNewRoleColor('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateRole = async () => {
    if (!editingRoleId || !editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await updateRole(
        editingRoleId,
        editName.trim(),
        editPermissions,
        editColor || undefined
      )
      setEditingRoleId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRole = async () => {
    if (!deleteConfirm) return
    setSaving(true)
    setError(null)
    try {
      await deleteRole(deleteConfirm.id)
      setDeleteConfirm(null)
      if (editingRoleId === deleteConfirm.id) {
        setEditingRoleId(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete role')
    } finally {
      setSaving(false)
    }
  }

  const startEditing = (role: typeof roles[0]) => {
    setEditingRoleId(role.id)
    setEditName(role.name)
    setEditPermissions(role.permissions)
    setEditColor(role.color ?? '')
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-white/5 px-4">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          Role Management
        </span>
        <button
          onClick={() => useStore.setState({ activePanel: 'chat' })}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl flex flex-col gap-8">
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {/* Delete confirmation */}
          {deleteConfirm && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="mb-3 text-sm text-[var(--color-text-primary)]">
                Delete role <strong>{deleteConfirm.name}</strong>? Members with this role will lose its permissions.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteRole}
                  disabled={saving}
                  className="rounded bg-red-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="rounded px-4 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Create Role section */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Create Role
            </h3>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="mb-3">
                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Role Name</label>
                <input
                  type="text"
                  placeholder="New role name"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  maxLength={32}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                />
              </div>

              {/* Color picker */}
              <div className="mb-3">
                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Color</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewRoleColor(newRoleColor === color ? '' : color)}
                      className={`h-6 w-6 rounded-full border-2 ${
                        newRoleColor === color ? 'border-white' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Permission checkboxes */}
              <div className="mb-3">
                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Permissions</label>
                <div className="flex flex-col gap-2">
                  {PERMISSION_LABELS.map(({ key, label, description }) => (
                    <label key={key} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasPermission(newRolePermissions, PERMISSIONS[key])}
                        onChange={() => setNewRolePermissions(togglePermission(newRolePermissions, PERMISSIONS[key]))}
                        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-[var(--color-accent)]"
                      />
                      <div>
                        <span className="text-sm text-[var(--color-text-primary)]">{label}</span>
                        <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreateRole}
                disabled={saving || !newRoleName.trim()}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </section>

          {/* Role List section */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Roles ({roles.length})
            </h3>
            <div className="flex flex-col gap-2">
              {roles.map((role) => (
                <div key={role.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  {editingRoleId === role.id ? (
                    /* Edit mode */
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={32}
                          className="w-full rounded border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Color</label>
                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={() => setEditColor(editColor === color ? '' : color)}
                              className={`h-6 w-6 rounded-full border-2 ${
                                editColor === color ? 'border-white' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Permissions</label>
                        <div className="flex flex-col gap-2">
                          {PERMISSION_LABELS.map(({ key, label, description }) => (
                            <label key={key} className="flex items-start gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={hasPermission(editPermissions, PERMISSIONS[key])}
                                onChange={() => setEditPermissions(togglePermission(editPermissions, PERMISSIONS[key]))}
                                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-[var(--color-accent)]"
                              />
                              <div>
                                <span className="text-sm text-[var(--color-text-primary)]">{label}</span>
                                <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdateRole}
                          disabled={saving || !editName.trim()}
                          className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingRoleId(null)}
                          className="rounded px-4 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-white/5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div className="flex items-center gap-3">
                      {/* Color indicator */}
                      <div
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: role.color ?? '#8b8b8b' }}
                      />

                      <div className="flex-1">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {role.name}
                        </span>
                        {role.is_default && (
                          <span className="ml-2 text-[10px] text-[var(--color-text-muted)]">DEFAULT</span>
                        )}
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {PERMISSION_LABELS.filter(({ key }) =>
                            hasPermission(role.permissions, PERMISSIONS[key])
                          ).map(({ key, label }) => (
                            <span
                              key={key}
                              className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => startEditing(role)}
                        className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ id: role.id, name: role.name })}
                        disabled={role.is_default}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {roles.length === 0 && (
                <p className="py-4 text-center text-xs text-[var(--color-text-muted)]">No roles configured</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
