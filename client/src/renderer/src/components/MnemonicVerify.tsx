import { useState, useMemo, useCallback } from 'react'

interface MnemonicVerifyProps {
  words: string[]
  onVerified: () => void
}

/**
 * Verify mnemonic backup by asking user to select correct word at 3 random positions.
 * Each position shows 4 options (1 correct + 3 random decoys).
 */
export default function MnemonicVerify({ words, onVerified }: MnemonicVerifyProps) {
  // Pick 3 random positions (0-indexed) deterministically per render
  const positions = useMemo(() => {
    const indices = Array.from({ length: words.length }, (_, i) => i)
    const shuffled = [...indices]
    // Fisher-Yates shuffle (using Math.random is fine for UI positions)
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, 3).sort((a, b) => a - b)
  }, [words])

  // Generate 4 options for each position (1 correct + 3 decoys)
  const optionsPerPosition = useMemo(() => {
    return positions.map(pos => {
      const correctWord = words[pos]
      const decoys: string[] = []
      const usedIndices = new Set([pos])

      while (decoys.length < 3) {
        const idx = Math.floor(Math.random() * words.length)
        if (!usedIndices.has(idx)) {
          usedIndices.add(idx)
          decoys.push(words[idx])
        }
      }

      // Shuffle correct + decoys
      const options = [correctWord, ...decoys]
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]]
      }

      return { position: pos, correctWord, options }
    })
  }, [words, positions])

  const [currentStep, setCurrentStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleSelect = useCallback((selectedWord: string) => {
    const current = optionsPerPosition[currentStep]
    if (selectedWord !== current.correctWord) {
      setError(`Incorrect. Word ${current.position + 1} is not "${selectedWord}". Please try again.`)
      return
    }

    setError(null)
    if (currentStep < optionsPerPosition.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      onVerified()
    }
  }, [currentStep, optionsPerPosition, onVerified])

  const current = optionsPerPosition[currentStep]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Verify your backup: Select the correct word for each position.
        Step {currentStep + 1} of {optionsPerPosition.length}
      </p>

      <div className="text-center">
        <p className="text-lg font-semibold text-[var(--color-text-primary)]">
          What is word #{current.position + 1}?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {current.options.map((word) => (
          <button
            key={word}
            onClick={() => handleSelect(word)}
            className="rounded-lg border border-white/10 px-4 py-3 text-sm font-mono text-[var(--color-text-primary)] transition-colors hover:bg-white/10 hover:border-[var(--color-accent)]"
          >
            {word}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}
    </div>
  )
}
