/**
 * Constrained inline image with micro-thumbnail placeholder and click-to-lightbox.
 *
 * Rendering strategy:
 * 1. Container div at fixed scaled dimensions (prevents reflow per APP-04)
 * 2. Micro-thumbnail shown as blurry <img> while full image loads
 * 3. Full image resolved via useBlockContent, replaces placeholder on load
 * 4. Click opens lightbox
 *
 * Max-box: 480px wide, 350px tall. Images smaller than max-box render at original size.
 */

import { useBlockContent } from '../hooks/useBlockContent'
import ContentPlaceholder from './ContentPlaceholder'
import type { BlockRefData } from '@shared/ipc-bridge'

interface InlineImageProps {
  /** Block reference data from message */
  blockRef: BlockRefData
  /** Called when image is clicked (opens lightbox) */
  onClick: () => void
}

/** Max inline image dimensions */
const MAX_WIDTH = 480
const MAX_HEIGHT = 350

export default function InlineImage({ blockRef, onClick }: InlineImageProps) {
  const { status, data, progress, retry } = useBlockContent(blockRef.hash)

  // Calculate scaled dimensions to fit within max-box
  const scale = Math.min(MAX_WIDTH / (blockRef.width || MAX_WIDTH), MAX_HEIGHT / (blockRef.height || MAX_HEIGHT), 1)
  const displayW = Math.round((blockRef.width || MAX_WIDTH) * scale)
  const displayH = Math.round((blockRef.height || MAX_HEIGHT) * scale)

  const isLoaded = status === 'loaded' && data

  return (
    <div
      style={{ width: displayW, height: displayH, position: 'relative', overflow: 'hidden' }}
      className="rounded-lg cursor-pointer"
      onClick={onClick}
    >
      {/* Layer 1: Micro-thumbnail or shimmer placeholder */}
      {!isLoaded && (
        blockRef.microThumbnail ? (
          <img
            src={`data:image/jpeg;base64,${blockRef.microThumbnail}`}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(4px)',
            }}
            draggable={false}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0 }}>
            <ContentPlaceholder
              width={displayW}
              height={displayH}
              progress={progress}
              onRetry={retry}
            />
          </div>
        )
      )}

      {/* Layer 2: Full-resolution image (fades in over placeholder) */}
      {isLoaded && (
        <img
          src={`data:${blockRef.mimeType};base64,${data}`}
          alt={blockRef.filename}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
          draggable={false}
        />
      )}
    </div>
  )
}
