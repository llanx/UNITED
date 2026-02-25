import { useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'

interface TotpEnrollmentProps {
  onDismiss: () => void
  onComplete: () => void
}

type Step = 'prompt' | 'qr' | 'verify' | 'done'

/**
 * Optional TOTP enrollment shown once after account creation.
 * Dismissible per user decision. QR generated client-side from otpauth URI.
 * Two-step flow: /enroll to get URI, then /confirm with 6-digit code.
 */
export default function TotpEnrollment({ onDismiss, onComplete }: TotpEnrollmentProps) {
  const [step, setStep] = useState<Step>('prompt')
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleEnroll = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.united.enrollTotp()
      setOtpauthUri(result.otpauthUri)
      setStep('qr')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start TOTP enrollment')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleVerify = useCallback(async () => {
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError('Please enter a 6-digit code')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const valid = await window.united.verifyTotp(code)
      if (valid) {
        setStep('done')
        onComplete()
      } else {
        setError('Invalid code. Please try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }, [code, onComplete])

  // Prompt: ask if user wants to set up 2FA
  if (step === 'prompt') {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent)]">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Two-Factor Authentication
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Add an extra layer of security with an authenticator app
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleEnroll}
            disabled={loading}
            className="flex-1 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Setting up...' : 'Set Up 2FA'}
          </button>
          <button
            onClick={onDismiss}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/5"
          >
            Skip
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  // QR code display
  if (step === 'qr') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-white/10 bg-white/5 p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Scan with your authenticator app
        </h3>

        {otpauthUri && (
          <div className="rounded-lg bg-white p-4">
            <QRCodeSVG value={otpauthUri} size={200} />
          </div>
        )}

        <p className="text-xs text-[var(--color-text-muted)] text-center">
          Use Google Authenticator, Authy, or any TOTP-compatible app.
        </p>

        <button
          onClick={() => setStep('verify')}
          className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Next: Enter Code
        </button>
      </div>
    )
  }

  // Verify code
  if (step === 'verify') {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/5 p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Enter the 6-digit code from your authenticator app
        </h3>

        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          maxLength={6}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl font-mono tracking-[0.3em] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/30 outline-none focus:border-[var(--color-accent)]"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleVerify()
          }}
        />

        {error && <p className="text-xs text-red-400 text-center">{error}</p>}

        <button
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
          className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Verifying...' : 'Verify'}
        </button>

        <button
          onClick={() => setStep('qr')}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          Back to QR code
        </button>
      </div>
    )
  }

  // Done
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 text-green-400">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
        Two-factor authentication enabled
      </p>
    </div>
  )
}
