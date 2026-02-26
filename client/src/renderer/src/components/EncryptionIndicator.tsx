/**
 * Encryption/signing indicator for messages.
 *
 * Two modes:
 * - "e2e": Lock icon for end-to-end encrypted DM messages
 * - "signed": Checkmark icon for signed channel messages
 *
 * Subtle styling -- visible but not dominating the message layout.
 */

interface EncryptionIndicatorProps {
  mode: 'e2e' | 'signed'
  className?: string
}

export default function EncryptionIndicator({ mode, className = '' }: EncryptionIndicatorProps) {
  if (mode === 'e2e') {
    return (
      <span
        className={`inline-flex items-center text-green-400/60 ${className}`}
        title="End-to-end encrypted"
      >
        <svg
          width="12"
          height="12"
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
    )
  }

  // mode === 'signed'
  return (
    <span
      className={`inline-flex items-center text-blue-400/60 ${className}`}
      title="Signed by sender"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}
