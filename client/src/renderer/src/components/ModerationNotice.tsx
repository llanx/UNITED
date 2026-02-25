import { useCallback } from 'react'
import { useStore } from '../stores'

interface ModerationNoticeProps {
  /** 'kick' = warning (4004), 'ban' = error/full-screen (4003) */
  type: 'kick' | 'ban'
  /** Optional reason provided by admin */
  reason?: string
  /** Server name for display */
  serverName?: string
}

/**
 * Moderation notice shown when a user is kicked or banned.
 *
 * Kick (4004): Warning severity, yellow/amber accent. User can rejoin with valid invite.
 *              Not full-screen blocking -- overlay card.
 *
 * Ban (4003): Error severity, red accent. Full-screen blocking overlay.
 *             Shows ban reason if provided. No rejoin option.
 *             Per Phase 1 decision: "4003 = full-screen ban message"
 */
export default function ModerationNotice({ type, reason, serverName }: ModerationNoticeProps) {
  const clearModerationNotice = useStore((s) => s.clearModerationNotice)

  const handleClose = useCallback(() => {
    clearModerationNotice()
  }, [clearModerationNotice])

  if (type === 'ban') {
    // Full-screen ban notice (error severity -- red accent)
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="mx-4 w-full max-w-md text-center">
          {/* Red icon/indicator */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
            <svg
              className="h-8 w-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>

          <h1 className="mb-2 text-2xl font-bold text-red-400">
            You have been banned
          </h1>

          {serverName && (
            <p className="mb-4 text-sm text-[var(--color-text-muted)]">
              from <span className="font-semibold text-[var(--color-text-primary)]">{serverName}</span>
            </p>
          )}

          {reason && (
            <div className="mx-auto mb-6 max-w-sm rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-red-400/70">Reason</p>
              <p className="mt-1 text-sm text-[var(--color-text-primary)]">{reason}</p>
            </div>
          )}

          <p className="mb-6 text-sm text-[var(--color-text-muted)]">
            You cannot rejoin this server.
          </p>

          <button
            onClick={handleClose}
            className="rounded-lg border border-white/10 bg-white/5 px-8 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  // Kick notice (warning severity -- yellow/amber accent, overlay card, not full-screen)
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-[var(--color-bg-secondary)] p-8 text-center shadow-2xl">
        {/* Yellow/amber icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
          <svg
            className="h-8 w-8 text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>

        <h2 className="mb-2 text-xl font-bold text-amber-400">
          You have been kicked
        </h2>

        {serverName && (
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">
            from <span className="font-semibold text-[var(--color-text-primary)]">{serverName}</span>
          </p>
        )}

        {reason && (
          <div className="mx-auto mb-4 max-w-sm rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-400/70">Reason</p>
            <p className="mt-1 text-sm text-[var(--color-text-primary)]">{reason}</p>
          </div>
        )}

        <p className="mb-6 text-sm text-[var(--color-text-muted)]">
          You can rejoin with a valid invite link.
        </p>

        <div className="flex justify-center gap-3">
          <button
            onClick={handleClose}
            className="rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
