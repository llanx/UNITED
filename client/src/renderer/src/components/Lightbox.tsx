/**
 * Full-screen lightbox gallery with blurhash placeholders.
 *
 * Wraps yet-another-react-lightbox (YARL) with:
 * - Custom slide renderer using BlurhashPlaceholder during load
 * - Block content resolution via useBlockContent
 * - Zoom plugin for pinch/scroll zoom
 * - Gallery navigation (left/right arrows, keyboard)
 */

import YarlLightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import type { BlockRefData } from '@shared/ipc-bridge'
import { useBlockContent } from '../hooks/useBlockContent'
import BlurhashPlaceholder from './BlurhashPlaceholder'

interface LightboxProps {
  /** Array of image block references */
  images: BlockRefData[]
  /** Whether the lightbox is open */
  open: boolean
  /** Initial slide index to display */
  initialIndex: number
  /** Called when lightbox is closed */
  onClose: () => void
}

export default function Lightbox({ images, open, initialIndex, onClose }: LightboxProps) {
  if (!open || images.length === 0) return null

  // Create slides for YARL with custom render
  const slides = images.map((img) => ({
    width: img.width || 1920,
    height: img.height || 1080,
    // Custom data for our render function
    blockRef: img,
  }))

  return (
    <YarlLightbox
      open={open}
      close={onClose}
      index={initialIndex}
      slides={slides}
      plugins={[Zoom]}
      render={{
        slide: ({ slide }) => {
          const blockRef = (slide as (typeof slides)[number]).blockRef
          if (!blockRef) return undefined
          return <LightboxSlide blockRef={blockRef} />
        },
      }}
      styles={{
        container: { backgroundColor: 'rgba(0, 0, 0, 0.92)' },
      }}
    />
  )
}

// ============================================================
// Lightbox slide with blurhash placeholder
// ============================================================

interface LightboxSlideProps {
  blockRef: BlockRefData
}

function LightboxSlide({ blockRef }: LightboxSlideProps) {
  const { status, data } = useBlockContent(blockRef.hash)
  const isLoaded = status === 'loaded' && data

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Blurhash placeholder (visible while loading) */}
      {!isLoaded && blockRef.blurhash && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: Math.min(blockRef.width || 800, window.innerWidth * 0.9),
              height: Math.min(blockRef.height || 600, window.innerHeight * 0.9),
              maxWidth: '90vw',
              maxHeight: '90vh',
            }}
          >
            <BlurhashPlaceholder
              hash={blockRef.blurhash}
              width={blockRef.width || 800}
              height={blockRef.height || 600}
            />
          </div>
        </div>
      )}

      {/* Loading spinner when no blurhash */}
      {!isLoaded && !blockRef.blurhash && (
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      )}

      {/* Full-resolution image */}
      {isLoaded && (
        <img
          src={`data:${blockRef.mimeType};base64,${data}`}
          alt={blockRef.filename}
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            objectFit: 'contain',
          }}
          draggable={false}
        />
      )}
    </div>
  )
}
