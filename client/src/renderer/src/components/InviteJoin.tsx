import { useState, useCallback, useEffect } from 'react'

interface InviteJoinProps {
  /** Pre-filled invite code (e.g. from deep link) */
  initialCode?: string
  /** Pre-filled server URL (e.g. from deep link) */
  initialServerUrl?: string
  /** Called when join completes successfully */
  onJoinSuccess: (serverUrl: string) => void
  /** Called when user wants to go back */
  onBack: () => void
}

type Step = 'input' | 'validate' | 'joining' | 'success'

/**
 * Parse an invite input which can be:
 * - A bare code: "abc12345"
 * - A full URL: "https://server.example.com:1984/invite/abc12345"
 * - A united:// deep link: "united://invite/abc12345?server=https://..."
 */
function parseInviteInput(input: string): { serverUrl?: string; inviteCode: string } {
  const trimmed = input.trim()

  // Try parsing as united:// deep link
  if (trimmed.startsWith('united://')) {
    try {
      const url = new URL(trimmed)
      const pathParts = url.pathname.split('/').filter(Boolean)
      if (pathParts[0] === 'invite' && pathParts[1]) {
        return {
          serverUrl: url.searchParams.get('server') || undefined,
          inviteCode: pathParts[1]
        }
      }
    } catch {
      // Fall through
    }
  }

  // Try parsing as HTTP(S) URL with /invite/ path
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const pathParts = url.pathname.split('/').filter(Boolean)
      const inviteIndex = pathParts.indexOf('invite')
      if (inviteIndex >= 0 && pathParts[inviteIndex + 1]) {
        const serverUrl = `${url.protocol}//${url.host}`
        return {
          serverUrl,
          inviteCode: pathParts[inviteIndex + 1]
        }
      }
    }
  } catch {
    // Not a valid URL -- treat as bare code
  }

  return { inviteCode: trimmed }
}

export default function InviteJoin({
  initialCode,
  initialServerUrl,
  onJoinSuccess,
  onBack
}: InviteJoinProps) {
  const [step, setStep] = useState<Step>('input')
  const [inviteInput, setInviteInput] = useState(initialCode || '')
  const [serverUrl, setServerUrl] = useState(initialServerUrl || '')
  const [inviteCode, setInviteCode] = useState('')
  const [serverName, setServerName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [joining, setJoining] = useState(false)

  // If initial code is provided, auto-validate
  useEffect(() => {
    if (initialCode && initialServerUrl) {
      setInviteInput(initialCode)
      setServerUrl(initialServerUrl)
    }
  }, [initialCode, initialServerUrl])

  const handleValidate = useCallback(async () => {
    setError(null)

    if (!inviteInput.trim()) {
      setError('Please enter an invite code or link')
      return
    }

    const parsed = parseInviteInput(inviteInput)
    const code = parsed.inviteCode
    const parsedServerUrl = parsed.serverUrl || serverUrl

    if (!parsedServerUrl) {
      setError('Please enter a server URL')
      return
    }

    // Validate invite code format (8 alphanumeric chars)
    if (!/^[a-zA-Z0-9]{8}$/.test(code)) {
      setError('Invalid invite code. Codes are 8 alphanumeric characters.')
      return
    }

    setInviteCode(code)
    if (parsed.serverUrl) {
      setServerUrl(parsed.serverUrl)
    }

    setValidating(true)
    setStep('validate')

    try {
      const normalizedUrl = parsedServerUrl.startsWith('http')
        ? parsedServerUrl
        : `https://${parsedServerUrl}`

      const result = await window.united.invite.validateInvite(normalizedUrl, code)

      if (result.valid) {
        setServerName(result.serverName || null)
        setServerUrl(normalizedUrl)
      } else {
        setError('This invite is invalid, expired, or has reached its use limit.')
        setStep('input')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate invite')
      setStep('input')
    } finally {
      setValidating(false)
    }
  }, [inviteInput, serverUrl])

  const handleJoin = useCallback(async () => {
    setError(null)
    setJoining(true)
    setStep('joining')

    try {
      // First connect to the server
      await window.united.connectToServer(serverUrl)

      // The actual join flow:
      // 1. User needs to register with the server (handled by JoinServer page registration step)
      // 2. After registration, call joinViaInvite to get channels/roles
      onJoinSuccess(serverUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join server')
      setStep('validate')
    } finally {
      setJoining(false)
    }
  }, [serverUrl, inviteCode, onJoinSuccess])

  // Derive whether server URL field is needed
  const needsServerUrl = (() => {
    if (!inviteInput.trim()) return true
    const parsed = parseInviteInput(inviteInput)
    return !parsed.serverUrl
  })()

  return (
    <div className="flex flex-col gap-4">
      {/* Step 1: Input */}
      {step === 'input' && (
        <>
          <div className="mb-2 text-center">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
              Join with Invite
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Enter an invite code or paste an invite link.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
              Invite code or link
            </label>
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => {
                setInviteInput(e.target.value)
                setError(null)
              }}
              placeholder="abc12345 or https://server.com/invite/abc12345"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent)]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleValidate()
              }}
            />
          </div>

          {needsServerUrl && (
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                Server URL
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => {
                  setServerUrl(e.target.value)
                  setError(null)
                }}
                placeholder="https://server.example.com:1984"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent)]"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            onClick={handleValidate}
            disabled={validating}
            className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {validating ? 'Validating...' : 'Validate Invite'}
          </button>

          <button
            onClick={onBack}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Back
          </button>
        </>
      )}

      {/* Step 2: Validated — show server info and join button */}
      {step === 'validate' && !validating && (
        <>
          <div className="mb-2 text-center">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
              {serverName || 'Server Found'}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Invite code: <span className="font-mono text-[var(--color-accent)]">{inviteCode}</span>
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {serverUrl}
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={joining}
            className="rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {joining ? 'Joining...' : 'Join Server'}
          </button>

          <button
            onClick={() => {
              setStep('input')
              setError(null)
            }}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Use a different invite
          </button>
        </>
      )}

      {/* Loading states */}
      {(step === 'validate' && validating) && (
        <div className="text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Validating invite...</p>
        </div>
      )}

      {step === 'joining' && (
        <div className="text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Joining server...</p>
        </div>
      )}
    </div>
  )
}
