import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ProvisioningQR from '../components/ProvisioningQR'
import { useStore } from '../stores'

type Mode = 'choose' | 'send' | 'receive'
type SendStatus = 'idle' | 'generating' | 'waiting' | 'complete' | 'timeout' | 'error'
type ReceiveStatus = 'idle' | 'connecting' | 'complete' | 'error'

/**
 * Device provisioning page (SEC-12).
 *
 * Two modes:
 * - Send: existing device generates QR code with ephemeral X25519 key + local address
 * - Receive: new device enters QR payload to receive encrypted keypair via local TCP
 *
 * Accessible from:
 * - Welcome page (as "Transfer from Device" for new devices with no identity)
 * - Settings (for existing users who want to provision a new device)
 */
export default function DeviceProvisioning() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const hasIdentity = useStore((s) => s.hasIdentity)

  // Determine initial mode from URL params or identity state
  const initialMode = searchParams.get('mode') as Mode | null
  const [mode, setMode] = useState<Mode>(
    initialMode === 'send' || initialMode === 'receive'
      ? initialMode
      : hasIdentity ? 'send' : 'choose'
  )

  // --- Send mode state ---
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle')
  const [qrPayload, setQrPayload] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  // --- Receive mode state ---
  const [receiveStatus, setReceiveStatus] = useState<ReceiveStatus>('idle')
  const [payloadInput, setPayloadInput] = useState('')
  const [receiveError, setReceiveError] = useState<string | null>(null)
  const [receivedFingerprint, setReceivedFingerprint] = useState<string | null>(null)

  // Auto-cancel timeout display
  const [timeLeft, setTimeLeft] = useState(300) // 5 minutes in seconds

  // Countdown timer when in waiting state
  useEffect(() => {
    if (sendStatus !== 'waiting') return
    setTimeLeft(300)

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setSendStatus('timeout')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [sendStatus])

  // --- Send mode handlers ---

  const handleStartSend = useCallback(async () => {
    setSendStatus('generating')
    setSendError(null)

    try {
      const result = await window.united.provisioning.startProvisioning()
      setQrPayload(result.qrPayload)
      setSendStatus('waiting')
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to start provisioning')
      setSendStatus('error')
    }
  }, [])

  const handleCancelSend = useCallback(async () => {
    try {
      await window.united.provisioning.cancelProvisioning()
    } catch {
      // Ignore cancel errors
    }
    setSendStatus('idle')
    setQrPayload(null)
  }, [])

  // --- Receive mode handlers ---

  const handleReceive = useCallback(async () => {
    if (!payloadInput.trim()) {
      setReceiveError('Please enter the transfer code')
      return
    }

    setReceiveStatus('connecting')
    setReceiveError(null)

    try {
      const result = await window.united.provisioning.receiveProvisioning(payloadInput.trim())
      setReceivedFingerprint(result.fingerprint)
      setReceiveStatus('complete')
    } catch (err) {
      setReceiveError(err instanceof Error ? err.message : 'Failed to receive identity')
      setReceiveStatus('error')
    }
  }, [payloadInput])

  const handleReceiveComplete = useCallback(() => {
    // Identity received — go to welcome for unlock or straight to join-server
    navigate('/welcome')
  }, [navigate])

  // Format time as M:SS
  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--color-bg-primary)]">
      <div className="w-full max-w-lg px-6">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {mode === 'choose' && 'Device Transfer'}
            {mode === 'send' && 'Transfer Identity to New Device'}
            {mode === 'receive' && 'Receive Identity from Device'}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {mode === 'choose' && 'Transfer your identity between devices over local network'}
            {mode === 'send' && 'Your new device will scan a QR code to securely receive your keypair'}
            {mode === 'receive' && 'Enter the transfer code shown on your existing device'}
          </p>
        </div>

        {/* Mode selection (for new devices) */}
        {mode === 'choose' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode('receive')}
              className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Receive from Existing Device
            </button>
            {hasIdentity && (
              <button
                onClick={() => setMode('send')}
                className="rounded-lg border border-white/10 px-6 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-white/5"
              >
                Send to New Device
              </button>
            )}
            <button
              onClick={() => navigate('/welcome')}
              className="mt-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {/* Send mode: existing device */}
        {mode === 'send' && (
          <div className="flex flex-col gap-4">
            {sendStatus === 'idle' && (
              <>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Make sure both devices are on the same local network.
                  The transfer happens directly between devices — no server involved.
                </p>
                <button
                  onClick={handleStartSend}
                  className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Start Transfer
                </button>
              </>
            )}

            {sendStatus === 'generating' && (
              <div className="flex items-center justify-center gap-2 py-8">
                <div className="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                <span className="text-sm text-[var(--color-text-muted)]">
                  Generating secure transfer code...
                </span>
              </div>
            )}

            {sendStatus === 'waiting' && qrPayload && (
              <>
                <ProvisioningQR qrPayload={qrPayload} onCancel={handleCancelSend} />
                <div className="text-center">
                  <span className="text-xs text-[var(--color-text-muted)]">
                    Auto-cancels in {formatTime(timeLeft)}
                  </span>
                </div>
              </>
            )}

            {sendStatus === 'complete' && (
              <div className="flex flex-col items-center gap-4 rounded-lg border border-green-500/30 bg-green-500/5 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Transfer complete!
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Your new device is ready.
                </p>
              </div>
            )}

            {sendStatus === 'timeout' && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-6">
                <p className="text-sm font-semibold text-yellow-400">
                  Transfer timed out
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  No device connected within 5 minutes.
                </p>
                <button
                  onClick={() => setSendStatus('idle')}
                  className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Try Again
                </button>
              </div>
            )}

            {sendStatus === 'error' && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-6">
                <p className="text-sm text-red-400">{sendError}</p>
                <button
                  onClick={() => setSendStatus('idle')}
                  className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Try Again
                </button>
              </div>
            )}

            {(sendStatus === 'idle' || sendStatus === 'complete' || sendStatus === 'timeout' || sendStatus === 'error') && (
              <button
                onClick={() => {
                  handleCancelSend()
                  if (hasIdentity) {
                    navigate('/app')
                  } else {
                    navigate('/welcome')
                  }
                }}
                className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Back
              </button>
            )}
          </div>
        )}

        {/* Receive mode: new device */}
        {mode === 'receive' && (
          <div className="flex flex-col gap-4">
            {receiveStatus === 'idle' || receiveStatus === 'error' ? (
              <>
                <p className="text-sm text-[var(--color-text-muted)]">
                  On your existing device, go to Settings and start a device transfer.
                  Then enter the transfer code shown below the QR code.
                </p>

                <div>
                  <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                    Transfer Code
                  </label>
                  <textarea
                    value={payloadInput}
                    onChange={(e) => setPayloadInput(e.target.value)}
                    placeholder='Paste the transfer code here...'
                    rows={3}
                    className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent)]"
                    autoFocus
                  />
                </div>

                {receiveError && (
                  <p className="text-sm text-red-400 text-center">{receiveError}</p>
                )}

                <button
                  onClick={handleReceive}
                  disabled={!payloadInput.trim()}
                  className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Connect
                </button>

                <button
                  onClick={() => {
                    if (hasIdentity) {
                      navigate('/app')
                    } else {
                      navigate('/welcome')
                    }
                  }}
                  className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  Back
                </button>
              </>
            ) : null}

            {receiveStatus === 'connecting' && (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                <span className="text-sm text-[var(--color-text-muted)]">
                  Connecting to existing device...
                </span>
                <span className="text-xs text-[var(--color-text-muted)] opacity-60">
                  Performing secure key exchange
                </span>
              </div>
            )}

            {receiveStatus === 'complete' && (
              <div className="flex flex-col items-center gap-4 rounded-lg border border-green-500/30 bg-green-500/5 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Identity received!
                </p>
                {receivedFingerprint && (
                  <p className="text-xs font-mono text-[var(--color-text-muted)]">
                    {receivedFingerprint}
                  </p>
                )}
                <button
                  onClick={handleReceiveComplete}
                  className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
