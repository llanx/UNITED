import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../stores'

type Step = 'url' | 'register' | 'unlock'

export default function JoinServer() {
  const navigate = useNavigate()
  const hasIdentity = useStore((s) => s.hasIdentity)
  const isUnlocked = useStore((s) => s.isUnlocked)

  const [step, setStep] = useState<Step>('url')
  const [serverUrl, setServerUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [serverName, setServerName] = useState<string | null>(null)
  const [serverDescription, setServerDescription] = useState<string | null>(null)
  const [registrationMode, setRegistrationMode] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)

  // Returning user passphrase
  const [passphrase, setPassphrase] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)

  const validateUrl = useCallback((url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, [])

  const handleConnect = useCallback(async () => {
    setUrlError(null)

    if (!serverUrl.trim()) {
      setUrlError('Please enter a server URL')
      return
    }

    const normalized = serverUrl.startsWith('http') ? serverUrl : `https://${serverUrl}`

    if (!validateUrl(normalized)) {
      setUrlError('Invalid URL format. Example: https://server.example.com:1984')
      return
    }

    setConnecting(true)
    try {
      const result = await window.united.connectToServer(normalized)
      if (result.connected) {
        setServerName(result.serverInfo.name)
        setServerDescription(result.serverInfo.description)
        setRegistrationMode(result.serverInfo.registrationMode)

        useStore.setState({
          serverUrl: normalized,
          name: result.serverInfo.name,
          description: result.serverInfo.description,
          registrationMode: result.serverInfo.registrationMode,
        })

        // If identity exists but not unlocked, need passphrase
        if (hasIdentity && !isUnlocked) {
          setStep('unlock')
        } else {
          setStep('register')
        }
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to connect to server')
    } finally {
      setConnecting(false)
    }
  }, [serverUrl, validateUrl, hasIdentity, isUnlocked])

  const handleUnlock = useCallback(async () => {
    setUnlockError(null)
    setUnlocking(true)

    try {
      const result = await window.united.unlockIdentity(passphrase)
      useStore.getState().setUnlocked(result.fingerprint, result.publicKey)
      setStep('register')
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Failed to unlock identity')
    } finally {
      setUnlocking(false)
    }
  }, [passphrase])

  const handleRegister = useCallback(async () => {
    setRegisterError(null)

    if (!displayName.trim()) {
      setRegisterError('Please enter a display name')
      return
    }

    setRegistering(true)
    try {
      const result = await window.united.register(
        displayName.trim(),
        setupToken.trim() || undefined
      )

      useStore.setState({
        serverId: serverUrl,
        displayName: displayName.trim(),
      })
      useStore.getState().setOwner(result.isOwner)

      // Navigate to main app
      navigate('/app')
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setRegistering(false)
    }
  }, [displayName, setupToken, serverUrl, navigate])

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--color-bg-primary)]">
      <div className="w-full max-w-md px-6">
        {/* Step 1: Server URL */}
        {step === 'url' && (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
                Join a Server
              </h1>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Enter the URL of a UNITED coordination server.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                  Server URL
                </label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => {
                    setServerUrl(e.target.value)
                    setUrlError(null)
                  }}
                  placeholder="https://server.example.com:1984"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent)]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConnect()
                  }}
                />
              </div>

              {urlError && (
                <p className="text-sm text-red-400 text-center">{urlError}</p>
              )}

              <button
                onClick={handleConnect}
                disabled={connecting}
                className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </button>

              <button
                onClick={() => navigate(-1)}
                className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Back
              </button>
            </div>
          </>
        )}

        {/* Step: Unlock existing identity */}
        {step === 'unlock' && (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
                Unlock Identity
              </h1>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Enter your passphrase to unlock your identity.
              </p>
              {serverName && (
                <p className="mt-1 text-xs text-[var(--color-accent)]">
                  Connected to: {serverName}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter your passphrase..."
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent)]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUnlock()
                }}
              />

              {unlockError && (
                <p className="text-sm text-red-400 text-center">{unlockError}</p>
              )}

              <button
                onClick={handleUnlock}
                disabled={unlocking}
                className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {unlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Register display name */}
        {step === 'register' && (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
                {serverName ?? 'Register'}
              </h1>
              {serverDescription && (
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  {serverDescription}
                </p>
              )}
              {registrationMode === 'invite_only' && (
                <p className="mt-1 text-xs text-yellow-400">
                  This server requires an invite/setup token.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                  Display name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="What should others call you?"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent)]"
                  autoFocus
                  maxLength={32}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                  Setup token (optional — required for first user / admin)
                </label>
                <input
                  type="text"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  placeholder="Enter setup token from server console..."
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRegister()
                  }}
                />
              </div>

              {registerError && (
                <p className="text-sm text-red-400 text-center">{registerError}</p>
              )}

              <button
                onClick={handleRegister}
                disabled={registering}
                className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {registering ? 'Registering...' : 'Join Server'}
              </button>

              <button
                onClick={() => setStep('url')}
                className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Connect to a different server
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
