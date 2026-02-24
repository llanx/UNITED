import { useState, useCallback, useEffect } from 'react'
import { useStore } from '../stores'

/**
 * Admin-only server settings panel.
 * Editable: server name, description, registration mode.
 * Save calls PUT /api/server/settings via IPC.
 */
export default function ServerSettings() {
  const serverName = useStore((s) => s.name)
  const serverDescription = useStore((s) => s.description)
  const registrationMode = useStore((s) => s.registrationMode)

  const [name, setName] = useState(serverName ?? '')
  const [description, setDescription] = useState(serverDescription ?? '')
  const [regMode, setRegMode] = useState(registrationMode ?? 'open')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Sync local state when store changes (e.g., push from server)
  useEffect(() => {
    setName(serverName ?? '')
    setDescription(serverDescription ?? '')
    setRegMode(registrationMode ?? 'open')
  }, [serverName, serverDescription, registrationMode])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const updatedInfo = await window.united.updateServerSettings({
        name: name.trim(),
        description: description.trim(),
        registrationMode: regMode as 'open' | 'invite_only'
      })

      // Update local store
      useStore.setState({
        name: updatedInfo.name,
        description: updatedInfo.description,
        registrationMode: updatedInfo.registrationMode,
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setSaving(false)
    }
  }, [name, description, regMode])

  const hasChanges = name !== (serverName ?? '') ||
    description !== (serverDescription ?? '') ||
    regMode !== (registrationMode ?? 'open')

  return (
    <div className="flex flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex h-12 items-center border-b border-white/5 px-4">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          Server Settings
        </span>
      </div>

      {/* Settings form */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-lg flex flex-col gap-6">
          {/* Server name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
              Server Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={256}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {description.length}/256
            </p>
          </div>

          {/* Registration mode */}
          <div>
            <label className="mb-2 block text-xs font-medium text-[var(--color-text-muted)]">
              Registration Mode
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setRegMode('open')}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  regMode === 'open'
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text-primary)]'
                    : 'border-white/10 text-[var(--color-text-muted)] hover:bg-white/5'
                }`}
              >
                Open
                <p className="mt-0.5 text-xs opacity-60">Anyone can register</p>
              </button>
              <button
                onClick={() => setRegMode('invite_only')}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  regMode === 'invite_only'
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text-primary)]'
                    : 'border-white/10 text-[var(--color-text-muted)] hover:bg-white/5'
                }`}
              >
                Invite Only
                <p className="mt-0.5 text-xs opacity-60">Requires invite token</p>
              </button>
            </div>
          </div>

          {/* Error / success */}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {saved && (
            <p className="text-sm text-green-400">Settings saved successfully</p>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="rounded-lg bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
