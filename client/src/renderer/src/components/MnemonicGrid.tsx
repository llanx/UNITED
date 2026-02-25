interface MnemonicGridProps {
  words: string[]
}

/**
 * Display 24 BIP39 mnemonic words in a 6x4 grid.
 * Readable font, numbered, with copy warning.
 */
export default function MnemonicGrid({ words }: MnemonicGridProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
        <p className="text-xs text-yellow-400">
          Write these 24 words down on paper and store them safely.
          This is your only way to recover your identity if you lose access to this device.
          Never share these words with anyone. Never store them digitally.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {words.map((word, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2"
          >
            <span className="text-xs text-[var(--color-text-muted)] font-mono w-5 text-right">
              {i + 1}.
            </span>
            <span className="text-sm text-[var(--color-text-primary)] font-mono">
              {word}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
