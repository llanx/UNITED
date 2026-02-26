/**
 * Adaptive multi-image grid layout for message attachments.
 *
 * Layouts per CONTEXT.md locked decisions:
 *   1 image:  single InlineImage, full max-box width
 *   2 images: side-by-side (1fr 1fr)
 *   3 images: first image spans 2 rows (2/3 width), two smaller stacked (1/3 width)
 *   4 images: 2x2 grid
 *   5+ images: 2x2 grid with "+N more" overlay on 4th image
 *
 * Max grid container width: 500px.
 */

import InlineImage from './InlineImage'
import type { BlockRefData } from '@shared/ipc-bridge'

interface ImageGridProps {
  /** Array of image block references */
  images: BlockRefData[]
  /** Called when an image is clicked (index into images array) */
  onImageClick: (index: number) => void
}

/** Max grid container width */
const GRID_MAX_WIDTH = 500
/** Cell height for multi-image grids */
const CELL_HEIGHT = 170

export default function ImageGrid({ images, onImageClick }: ImageGridProps) {
  if (images.length === 0) return null

  // Single image: render at full InlineImage max-box
  if (images.length === 1) {
    return (
      <div style={{ maxWidth: GRID_MAX_WIDTH }}>
        <InlineImage blockRef={images[0]} onClick={() => onImageClick(0)} />
      </div>
    )
  }

  // 2 images: side-by-side
  if (images.length === 2) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
          maxWidth: GRID_MAX_WIDTH,
        }}
      >
        {images.map((img, i) => (
          <div key={img.hash} style={{ height: CELL_HEIGHT, overflow: 'hidden' }} className="rounded-lg">
            <GridCell blockRef={img} onClick={() => onImageClick(i)} height={CELL_HEIGHT} />
          </div>
        ))}
      </div>
    )
  }

  // 3 images: first spans 2 rows, two smaller stacked
  if (images.length === 3) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: 4,
          maxWidth: GRID_MAX_WIDTH,
          height: CELL_HEIGHT * 2 + 4,
        }}
      >
        <div style={{ gridRow: '1 / 3', overflow: 'hidden' }} className="rounded-lg">
          <GridCell blockRef={images[0]} onClick={() => onImageClick(0)} height={CELL_HEIGHT * 2 + 4} />
        </div>
        <div style={{ overflow: 'hidden' }} className="rounded-lg">
          <GridCell blockRef={images[1]} onClick={() => onImageClick(1)} height={CELL_HEIGHT} />
        </div>
        <div style={{ overflow: 'hidden' }} className="rounded-lg">
          <GridCell blockRef={images[2]} onClick={() => onImageClick(2)} height={CELL_HEIGHT} />
        </div>
      </div>
    )
  }

  // 4+ images: 2x2 grid, with "+N more" overlay on 4th if 5+
  const displayImages = images.slice(0, 4)
  const remaining = images.length - 4

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 4,
        maxWidth: GRID_MAX_WIDTH,
        height: CELL_HEIGHT * 2 + 4,
      }}
    >
      {displayImages.map((img, i) => (
        <div
          key={img.hash}
          style={{ position: 'relative', overflow: 'hidden' }}
          className="rounded-lg"
        >
          <GridCell blockRef={img} onClick={() => onImageClick(i)} height={CELL_HEIGHT} />

          {/* "+N more" overlay on 4th image */}
          {i === 3 && remaining > 0 && (
            <div
              onClick={() => onImageClick(3)}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.55)',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: '#fff', fontSize: 20, fontWeight: 600 }}>
                +{remaining} more
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Grid cell (simplified image for grid context)
// ============================================================

interface GridCellProps {
  blockRef: BlockRefData
  onClick: () => void
  height: number
}

function GridCell({ blockRef, onClick, height }: GridCellProps) {
  // In grid cells, use the micro-thumbnail as a cover image
  // Full-resolution loading happens in the lightbox
  const thumbnailSrc = blockRef.microThumbnail
    ? `data:image/jpeg;base64,${blockRef.microThumbnail}`
    : undefined

  return (
    <div
      onClick={onClick}
      style={{
        width: '100%',
        height,
        cursor: 'pointer',
        position: 'relative',
        backgroundColor: 'var(--color-bg-tertiary, rgba(255,255,255,0.05))',
      }}
    >
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={blockRef.filename}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(2px)',
          }}
          draggable={false}
        />
      ) : (
        <div
          className="animate-pulse"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}
        />
      )}
    </div>
  )
}
