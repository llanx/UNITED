import { useCallback } from 'react'
import { useStore } from '../stores'

/**
 * Semi-transparent overlay shown on first visit to a server when admin has enabled it.
 * Displays server name, description, and optional rules text.
 * Dismissable per server -- stores dismissal state locally.
 *
 * Per CONTEXT.md: "no welcome screen unless admin explicitly enables it"
 */
export default function WelcomeOverlay() {
  const serverId = useStore((s) => s.serverId)
  const serverName = useStore((s) => s.name)
  const welcomeEnabled = useStore((s) => s.welcomeEnabled)
  const welcomeText = useStore((s) => s.welcomeText)
  const welcomeDismissed = useStore((s) => s.welcomeDismissed)
  const dismissWelcome = useStore((s) => s.dismissWelcome)
  const setActiveChannel = useStore((s) => s.setActiveChannel)
  const categoriesWithChannels = useStore((s) => s.categoriesWithChannels)

  // Don't show if admin hasn't enabled it
  if (!welcomeEnabled) return null

  // Don't show if already dismissed for this server
  if (serverId && welcomeDismissed[serverId]) return null

  const handleJumpIn = useCallback(() => {
    if (serverId) {
      dismissWelcome(serverId)
    }

    // Auto-select first text channel (#general from starter template)
    const firstCategory = categoriesWithChannels[0]
    if (firstCategory && firstCategory.channels.length > 0) {
      const textChannel = firstCategory.channels.find(
        (ch) => ch.channel_type === 'text'
      ) || firstCategory.channels[0]
      setActiveChannel(textChannel.id)
    }
  }, [serverId, dismissWelcome, categoriesWithChannels, setActiveChannel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-[var(--color-bg-secondary)] p-8 shadow-2xl">
        {/* Server name */}
        <h1 className="mb-2 text-center text-3xl font-bold text-[var(--color-text-primary)]">
          {serverName || 'Welcome'}
        </h1>

        {/* Welcome text / description / rules */}
        {welcomeText && (
          <div className="mx-auto mb-6 max-w-md">
            <p className="whitespace-pre-wrap text-center text-sm leading-relaxed text-[var(--color-text-muted)]">
              {welcomeText}
            </p>
          </div>
        )}

        {!welcomeText && (
          <p className="mb-6 text-center text-sm text-[var(--color-text-muted)]">
            Welcome to the server! Jump in and start chatting.
          </p>
        )}

        {/* Jump in button */}
        <div className="flex justify-center">
          <button
            onClick={handleJumpIn}
            className="rounded-lg bg-[var(--color-accent)] px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Jump in
          </button>
        </div>
      </div>
    </div>
  )
}
