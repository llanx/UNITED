/**
 * Dismissible educational banner for first-time DM conversations.
 *
 * Explains E2E encryption in plain language.
 * Once dismissed, a subtle lock icon remains near the composer/header.
 */

interface EncryptionBannerProps {
  recipientName: string
  onDismiss: () => void
}

export default function EncryptionBanner({ recipientName, onDismiss }: EncryptionBannerProps) {
  return (
    <div className="flex items-center gap-3 border-b border-green-500/20 bg-green-900/20 px-4 py-3">
      {/* Lock icon */}
      <span className="shrink-0 text-green-400/80">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </span>

      {/* Explanation text */}
      <p className="flex-1 text-sm text-green-200/80">
        Messages in this conversation are end-to-end encrypted. Only you and{' '}
        <span className="font-semibold text-green-200">{recipientName}</span>{' '}
        can read them. Not even the server operator can see them.
      </p>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-1 text-green-400/60 transition-colors hover:bg-green-500/10 hover:text-green-300"
        title="Dismiss"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
