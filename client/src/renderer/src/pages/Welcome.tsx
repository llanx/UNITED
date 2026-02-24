import ConnectionDot from '../components/ConnectionDot'

export default function Welcome() {
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
        <button className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90">
          Create New Identity
        </button>
        <button className="rounded-lg border border-white/10 px-6 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-white/5">
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
