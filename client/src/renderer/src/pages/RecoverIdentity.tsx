import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../stores'

export default function RecoverIdentity() {
  const navigate = useNavigate()
  const setIdentity = useStore((s) => s.setIdentity)

  const [words, setWords] = useState<string[]>(Array(24).fill(''))
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [step, setStep] = useState<'mnemonic' | 'passphrase'>('mnemonic')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const updateWord = useCallback((index: number, value: string) => {
    setWords(prev => {
      const next = [...prev]
      // Handle paste: if value contains spaces, split across cells
      const parts = value.trim().split(/\s+/)
      if (parts.length > 1) {
        for (let i = 0; i < parts.length && index + i < 24; i++) {
          next[index + i] = parts[i].toLowerCase()
        }
      } else {
        next[index] = value.toLowerCase().trim()
      }
      return next
    })
  }, [])

  const handleContinue = useCallback(() => {
    const filledWords = words.filter(w => w.length > 0)
    if (filledWords.length !== 24) {
      setError(`Please enter all 24 words (${filledWords.length}/24 filled)`)
      return
    }
    setError(null)
    setStep('passphrase')
  }, [words])

  const handleRecover = useCallback(async () => {
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
      const result = await window.united.recoverFromMnemonic(words, passphrase)
      setIdentity(result.fingerprint, result.publicKey)
      navigate('/join-server')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed — check your mnemonic words')
      setStep('mnemonic')
    } finally {
      setLoading(false)
    }
  }, [words, passphrase, passphraseConfirm, setIdentity, navigate])

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--color-bg-primary)]">
      <div className="w-full max-w-lg px-6">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {step === 'mnemonic' ? 'Recover Identity' : 'Set New Passphrase'}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {step === 'mnemonic'
              ? 'Enter your 24-word recovery phrase to restore your identity.'
              : 'Choose a new passphrase to protect your recovered identity on this device.'}
          </p>
        </div>

        {/* Step 1: Enter mnemonic words */}
        {step === 'mnemonic' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-4 gap-2">
              {words.map((word, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-xs text-[var(--color-text-muted)] font-mono w-5 text-right shrink-0">
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    value={word}
                    onChange={(e) => updateWord(i, e.target.value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData('text')
                      if (text.trim().split(/\s+/).length > 1) {
                        e.preventDefault()
                        updateWord(i, text)
                      }
                    }}
                    className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-mono text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                    autoFocus={i === 0}
                  />
                </div>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              onClick={handleContinue}
              className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Continue
            </button>

            <button
              onClick={() => navigate('/welcome')}
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {/* Step 2: New passphrase */}
        {step === 'passphrase' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                New passphrase (12+ characters)
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter a new passphrase..."
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
                  if (e.key === 'Enter') handleRecover()
                }}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              onClick={handleRecover}
              disabled={loading}
              className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Recovering...' : 'Recover Identity'}
            </button>

            <button
              onClick={() => setStep('mnemonic')}
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Back to mnemonic
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
