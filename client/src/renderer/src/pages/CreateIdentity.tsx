import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import MnemonicGrid from '../components/MnemonicGrid'
import MnemonicVerify from '../components/MnemonicVerify'
import { useStore } from '../stores'

type Step = 'passphrase' | 'mnemonic-show' | 'mnemonic-verify' | 'complete'

export default function CreateIdentity() {
  const navigate = useNavigate()
  const setIdentity = useStore((s) => s.setIdentity)

  const [step, setStep] = useState<Step>('passphrase')
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mnemonic, setMnemonic] = useState<string[]>([])
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  const handleCreateIdentity = useCallback(async () => {
    setError(null)

    if (passphrase.length < 12) {
      setError('Passphrase must be at least 12 characters')
      return
    }
    if (passphrase !== passphraseConfirm) {
      setError('Passphrases do not match')
      return
    }

    setLoading(true)
    try {
      const result = await window.united.createIdentity(passphrase)
      setMnemonic(result.mnemonic)
      setFingerprint(result.fingerprint)
      setIdentity(result.fingerprint, result.publicKey, result.mnemonic)
      setStep('mnemonic-show')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create identity')
    } finally {
      setLoading(false)
    }
  }, [passphrase, passphraseConfirm, setIdentity])

  const handleMnemonicVerified = useCallback(() => {
    // Mnemonic verified — proceed to join server
    useStore.getState().clearMnemonic()
    navigate('/join-server')
  }, [navigate])

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--color-bg-primary)]">
      <div className="w-full max-w-lg px-6">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {step === 'passphrase' && 'Create Your Identity'}
            {step === 'mnemonic-show' && 'Recovery Phrase'}
            {step === 'mnemonic-verify' && 'Verify Recovery Phrase'}
          </h1>
          {step === 'passphrase' && (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Choose a passphrase to protect your identity. This is used to encrypt your
              private key on this device.
            </p>
          )}
          {fingerprint && step !== 'passphrase' && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)] font-mono">
              {fingerprint}
            </p>
          )}
        </div>

        {/* Step 1: Passphrase entry */}
        {step === 'passphrase' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                Passphrase (12+ characters)
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter your passphrase..."
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent)]"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                Confirm passphrase
              </label>
              <input
                type="password"
                value={passphraseConfirm}
                onChange={(e) => setPassphraseConfirm(e.target.value)}
                placeholder="Re-enter your passphrase..."
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent)]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateIdentity()
                }}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              onClick={handleCreateIdentity}
              disabled={loading}
              className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Creating identity...' : 'Create Identity'}
            </button>

            <button
              onClick={() => navigate('/welcome')}
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {/* Step 2: Show mnemonic */}
        {step === 'mnemonic-show' && (
          <div className="flex flex-col gap-4">
            <MnemonicGrid words={mnemonic} />

            <button
              onClick={() => setStep('mnemonic-verify')}
              className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              I've written it down
            </button>
          </div>
        )}

        {/* Step 3: Verify mnemonic */}
        {step === 'mnemonic-verify' && (
          <MnemonicVerify
            words={mnemonic}
            onVerified={handleMnemonicVerified}
          />
        )}
      </div>
    </div>
  )
}
