/**
 * File attachment card for non-image content.
 *
 * Displays filename, formatted size, MIME type icon, and a download trigger.
 * Fixed height (~60px) with no layout reflow. Styled consistently with dark theme.
 */

interface AttachmentCardProps {
  /** Original filename */
  filename: string
  /** File size in bytes */
  size: number
  /** MIME type of the file */
  mimeType: string
  /** Content hash for download resolution */
  hash?: string
  /** Callback when download is triggered */
  onDownload?: () => void
  /** Additional CSS classes */
  className?: string
}

// ============================================================
// File size formatter
// ============================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// ============================================================
// MIME type category detection
// ============================================================

type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'generic'

function getFileCategory(mimeType: string): FileCategory {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType === 'application/pdf' || mimeType.includes('document') || mimeType.includes('spreadsheet') || mimeType.includes('presentation') || mimeType.startsWith('text/plain') || mimeType === 'text/csv') return 'document'
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z') || mimeType.includes('tar') || mimeType.includes('gzip')) return 'archive'
  if (mimeType === 'text/javascript' || mimeType === 'text/typescript' || mimeType === 'application/json' || mimeType === 'text/html' || mimeType === 'text/css' || mimeType === 'application/xml') return 'code'
  return 'generic'
}

// ============================================================
// File type icons (inline SVG)
// ============================================================

function FileIcon({ category }: { category: FileCategory }) {
  const cls = "w-8 h-8 text-[var(--text-tertiary)] flex-shrink-0"

  switch (category) {
    case 'image':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      )

    case 'video':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
          <polygon points="10 9 15 12 10 15" fill="currentColor" />
        </svg>
      )

    case 'audio':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      )

    case 'document':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      )

    case 'archive':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="21 8 21 21 3 21 3 8" />
          <rect x="1" y="3" width="22" height="5" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
      )

    case 'code':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      )

    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )
  }
}

// ============================================================
// Download icon
// ============================================================

function DownloadIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// ============================================================
// AttachmentCard component
// ============================================================

export default function AttachmentCard({
  filename,
  size,
  mimeType,
  onDownload,
  className = '',
}: AttachmentCardProps) {
  const category = getFileCategory(mimeType)

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors h-[60px] ${className}`}
    >
      <FileIcon category={category} />

      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--text-primary)] truncate" title={filename}>
          {filename}
        </div>
        <div className="text-xs text-[var(--text-tertiary)]">
          {formatFileSize(size)}
        </div>
      </div>

      {onDownload && (
        <button
          onClick={onDownload}
          className="flex-shrink-0 p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-modifier-hover)] transition-colors"
          title="Download"
        >
          <DownloadIcon />
        </button>
      )}
    </div>
  )
}
