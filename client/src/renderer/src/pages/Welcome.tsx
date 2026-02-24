import { useNavigate } from 'react-router-dom'
import { useStore } from '../stores'
import ConnectionDot from '../components/ConnectionDot'
import { useState, useCallback } from 'react'

export default function Welcome() {
  const navigate = useNavigate()
  const hasIdentity = useStore((s) => s.hasIdentity)

  // Returning user: passphrase-only unlock
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)

  const handleUnlock = useCallback(async () => {
    setError(null)
    setUnlocking(true)

    try {
      const result = await window.united.unlockIdentity(passphrase)
      useStore.getState().setUnlocked(result.fingerprint, result.publicKey)

      // Check for active server — if exists, go to main; otherwise join server
      const activeServer = await window.united.storage.getActiveServer()
      if (activeServer) {
        navigate('/app')
      } else {
        navigate('/join-server')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock identity')
    } finally {
      setUnlocking(false)
    }
  }, [passphrase, navigate])

  // Returning user with stored identity
  if (hasIdentity) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="mb-8 flex flex-col items-center gap-2">
          <h1 className="text-4xl font-bold tracking-widest text-[var(--color-text-primary)]">
            UNITED
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Welcome back
          </p>
        </div>

        <div className="flex flex-col gap-3 w-64">
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Enter your passphrase..."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent)] text-center"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUnlock()
            }}
          />

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            onClick={handleUnlock}
            disabled={unlocking}
            className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {unlocking ? 'Unlocking...' : 'Unlock'}
          </button>

          <button
            onClick={() => navigate('/join-server')}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Connect to a different server
          </button>
        </div>

        <div className="mt-8">
          <ConnectionDot />
        </div>
      </div>
    )
  }

  // New user — no identity yet
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--color-bg-primary)]">
      {/* Branding */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <h1 className="text-4xl font-bold tracking-widest text-[var(--color-text-primary)]">
          UNITED
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Unified Network for Independent, Trusted, Encrypted Dialogue
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 w-64">
        <button
          onClick={() => navigate('/create-identity')}
          className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Create New Identity
        </button>
        <button
          onClick={() => navigate('/recover-identity')}
          className="rounded-lg border border-white/10 px-6 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-white/5"
        >
          Recover Existing Identity
        </button>
      </div>

      {/* Connection status */}
      <div className="mt-8">
        <ConnectionDot />
      </div>
    </div>
  )
}
