import { useStore } from '../stores'
import ServerIcon from './ServerIcon'

export default function MainContent() {
  const name = useStore((s) => s.name)
  const description = useStore((s) => s.description)

  return (
    <div className="flex flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* Channel header bar */}
      <div className="flex h-12 items-center border-b border-white/5 px-4">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          Welcome
        </span>
      </div>

      {/* Content area — welcome message */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        {name && <ServerIcon name={name} size={80} />}
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          {name ? `Welcome to ${name}` : 'Welcome to UNITED'}
        </h1>
        {description && (
          <p className="max-w-md text-center text-sm text-[var(--color-text-muted)]">
            {description}
          </p>
        )}
        <p className="text-xs text-[var(--color-text-muted)]">
          This is the beginning of your server.
        </p>
      </div>
    </div>
  )
}
