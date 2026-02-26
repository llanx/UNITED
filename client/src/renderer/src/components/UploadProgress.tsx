/**
 * Upload progress bar for blocking send in the message composer.
 *
 * Shows:
 * - "Uploading file X of Y..." with a thin accent-colored progress bar
 * - "Sending message..." when the last file hits 100%
 */

interface UploadProgressProps {
  /** Current file being uploaded (0-indexed) */
  fileIndex: number
  /** Total number of files being uploaded */
  totalFiles: number
  /** Upload percent for the current file (0-100) */
  percent: number
}

export default function UploadProgress({ fileIndex, totalFiles, percent }: UploadProgressProps) {
  const isLastFileComplete = percent >= 100 && fileIndex + 1 >= totalFiles

  return (
    <div className="px-1 py-2">
      {/* Status text */}
      <div
        className="mb-1.5 text-xs"
        style={{ color: 'var(--color-text-muted, rgba(255,255,255,0.4))' }}
      >
        {isLastFileComplete
          ? 'Sending message...'
          : `Uploading file ${fileIndex + 1} of ${totalFiles}...`}
      </div>

      {/* Progress bar track */}
      <div
        className="w-full overflow-hidden rounded-full"
        style={{
          height: 4,
          backgroundColor: 'rgba(255,255,255,0.08)',
        }}
      >
        {/* Progress bar fill */}
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${Math.min(percent, 100)}%`,
            backgroundColor: 'var(--color-accent, #5865f2)',
          }}
        />
      </div>
    </div>
  )
}
