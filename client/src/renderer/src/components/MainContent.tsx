import { useStore } from '../stores'
import ServerIcon from './ServerIcon'
import ServerSettings from './ServerSettings'
import TotpEnrollment from './TotpEnrollment'
import { useState, useEffect } from 'react'

export default function MainContent() {
  const name = useStore((s) => s.name)
  const description = useStore((s) => s.description)
  const activePanel = useStore((s) => s.activePanel)
  const isOwner = useStore((s) => s.isOwner)

  // Show TOTP enrollment once after first registration (dismissible)
  const [showTotp, setShowTotp] = useState(false)
  const [totpDismissed, setTotpDismissed] = useState(false)

  useEffect(() => {
    // Check if we should show TOTP enrollment
    // Show once when user first registers (isOwner is set after registration)
    const checkTotp = async () => {
      const dismissed = await window.united.storage.getCachedState<boolean>('totp_dismissed')
      if (!dismissed) {
        setShowTotp(true)
      }
    }
    checkTotp()
  }, [])

  const handleTotpDismiss = async () => {
    setShowTotp(false)
    setTotpDismissed(true)
    await window.united.storage.setCachedState('totp_dismissed', true)
  }

  const handleTotpComplete = async () => {
    setShowTotp(false)
    setTotpDismissed(true)
    await window.united.storage.setCachedState('totp_dismissed', true)
  }

  // Server Settings panel (admin only)
  if (activePanel === 'settings' && isOwner) {
    return <ServerSettings />
  }

  // Members panel placeholder
  if (activePanel === 'members') {
    return (
      <div className="flex flex-1 flex-col bg-[var(--color-bg-primary)]">
        <div className="flex h-12 items-center border-b border-white/5 px-4">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Members
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Member list coming in Phase 4
          </p>
        </div>
      </div>
    )
  }

  // Default: Welcome / chat content
  return (
    <div className="flex flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* Channel header bar */}
      <div className="flex h-12 items-center border-b border-white/5 px-4">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          Welcome
        </span>
      </div>

      {/* Content area — welcome message + TOTP enrollment */}
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

        {/* TOTP enrollment (shown once, dismissible) */}
        {showTotp && !totpDismissed && (
          <div className="mt-6 w-full max-w-sm">
            <TotpEnrollment
              onDismiss={handleTotpDismiss}
              onComplete={handleTotpComplete}
            />
          </div>
        )}
      </div>
    </div>
  )
}
