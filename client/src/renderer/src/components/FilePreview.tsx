/**
 * Composer file preview card with thumbnail, filename, size, and remove button.
 *
 * Displayed in the file staging area between the textarea and send button
 * when files are attached to a message before sending.
 */

import type { FileAttachment } from '@shared/ipc-bridge'

interface FilePreviewProps {
  /** The staged file attachment */
  file: FileAttachment
  /** Called when user clicks the remove button */
  onRemove: () => void
}

// ============================================================
// MIME type icon mapping
// ============================================================

type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'generic'

function getFileCategory(mimeType: string): FileCategory {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('presentation') ||
    mimeType.startsWith('text/plain') ||
    mimeType === 'text/csv'
  )
    return 'document'
  if (
    mimeType.includes('zip') ||
    mimeType.includes('rar') ||
    mimeType.includes('7z') ||
    mimeType.includes('tar') ||
    mimeType.includes('gzip')
  )
    return 'archive'
  if (
    mimeType === 'text/javascript' ||
    mimeType === 'text/typescript' ||
    mimeType === 'application/json' ||
    mimeType === 'text/html' ||
    mimeType === 'text/css' ||
    mimeType === 'application/xml'
  )
    return 'code'
  return 'generic'
}

function categoryEmoji(cat: FileCategory): string {
  switch (cat) {
    case 'image':
      return '🖼'
    case 'video':
      return '🎬'
    case 'audio':
      return '🎵'
    case 'document':
      return '📄'
    case 'archive':
      return '📦'
    case 'code':
      return '<>'
    default:
      return '📎'
  }
}

// ============================================================
// File size formatter
// ============================================================

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function truncateName(name: string, max: number = 30): string {
  if (name.length <= max) return name
  const ext = name.lastIndexOf('.')
  if (ext > 0 && name.length - ext < 8) {
    const extPart = name.slice(ext)
    const namePart = name.slice(0, max - extPart.length - 3)
    return `${namePart}...${extPart}`
  }
  return name.slice(0, max - 3) + '...'
}

// ============================================================
// FilePreview component
// ============================================================

export default function FilePreview({ file, onRemove }: FilePreviewProps) {
  const category = getFileCategory(file.mimeType)

  // Estimate size from path (not available in FileAttachment -- show mime instead)
  // For now, just display the MIME type as secondary info since FileAttachment doesn't carry size
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2"
      style={{
        backgroundColor: 'var(--color-bg-secondary, rgba(255,255,255,0.03))',
        minWidth: 160,
        maxWidth: 240,
        flexShrink: 0,
      }}
    >
      {/* File type icon */}
      <span className="text-lg shrink-0">{categoryEmoji(category)}</span>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div
          className="text-xs font-medium truncate"
          style={{ color: 'var(--color-text-primary, #fff)' }}
          title={file.name}
        >
          {truncateName(file.name)}
        </div>
        <div
          className="text-[10px]"
          style={{ color: 'var(--color-text-muted, rgba(255,255,255,0.4))' }}
        >
          {file.mimeType.split('/')[1]?.toUpperCase() || file.mimeType}
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="shrink-0 rounded p-0.5 transition-colors hover:bg-white/10"
        style={{ color: 'var(--color-text-muted, rgba(255,255,255,0.4))' }}
        title="Remove file"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
