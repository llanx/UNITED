/**
 * Progressive content loading placeholder.
 *
 * Renders at exact dimensions (zero reflow per APP-04) with three states:
 *   - cache:       Shimmer animation (SkeletonShimmer pattern)
 *   - fetching:    Shimmer background + "Fetching from network..." text
 *   - unavailable: Gray background + broken-image icon + retry button
 */

import type { BlockLoadingProgress } from '../hooks/useBlockContent'

interface ContentPlaceholderProps {
  /** Original content width in pixels */
  width: number
  /** Original content height in pixels */
  height: number
  /** Current loading progress state */
  progress: BlockLoadingProgress
  /** Callback when user clicks retry */
  onRetry?: () => void
  /** Additional CSS classes */
  className?: string
}

/** Broken image SVG icon */
function BrokenImageIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--text-tertiary)]"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="3" x2="21" y2="21" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

export default function ContentPlaceholder({
  width,
  height,
  progress,
  onRetry,
  className = '',
}: ContentPlaceholderProps) {
  const aspectRatio = width && height ? `${width} / ${height}` : undefined

  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: `${width}px`,
    aspectRatio,
    overflow: 'hidden',
  }

  if (progress === 'cache') {
    return (
      <div
        className={`relative rounded-lg bg-white/5 ${className}`}
        style={containerStyle}
      >
        {/* Shimmer animation consistent with SkeletonShimmer pattern */}
        <div className="absolute inset-0 animate-pulse bg-white/5 rounded-lg" />
      </div>
    )
  }

  if (progress === 'fetching') {
    return (
      <div
        className={`relative flex items-center justify-center rounded-lg bg-white/5 ${className}`}
        style={containerStyle}
      >
        {/* Shimmer background */}
        <div className="absolute inset-0 animate-pulse bg-white/5 rounded-lg" />
        {/* Status text */}
        <span className="relative z-10 text-sm text-[var(--text-tertiary)] select-none">
          Fetching from network...
        </span>
      </div>
    )
  }

  // progress === 'unavailable'
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-lg bg-[var(--bg-secondary)] ${className}`}
      style={containerStyle}
    >
      <BrokenImageIcon />
      <span className="text-sm text-[var(--text-tertiary)] select-none">
        Content unavailable
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-modifier-hover)] transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}
