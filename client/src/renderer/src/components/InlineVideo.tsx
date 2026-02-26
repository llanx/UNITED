/**
 * Inline video with thumbnail + play overlay, loads only on user click.
 *
 * Prevents bandwidth drain from multiple videos in scroll history by
 * deferring video resolution until the user explicitly clicks play.
 * (Research Pitfall 7)
 *
 * States:
 * 1. Idle: thumbnail + play button overlay
 * 2. Loading: thumbnail + spinner (resolving block)
 * 3. Playing: <video> element with standard controls
 */

import { useState, useEffect, useRef } from 'react'
import { useBlockContent } from '../hooks/useBlockContent'
import ContentPlaceholder from './ContentPlaceholder'
import type { BlockRefData } from '@shared/ipc-bridge'

interface InlineVideoProps {
  /** Block reference data for the video */
  blockRef: BlockRefData
}

/** Max inline video dimensions */
const MAX_WIDTH = 480
const MAX_HEIGHT = 350

export default function InlineVideo({ blockRef }: InlineVideoProps) {
  const [playing, setPlaying] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  // Only resolve block content when user clicks play
  const { status, data } = useBlockContent(playing ? blockRef.hash : null)

  // Calculate scaled dimensions
  const scale = Math.min(MAX_WIDTH / (blockRef.width || MAX_WIDTH), MAX_HEIGHT / (blockRef.height || MAX_HEIGHT), 1)
  const displayW = Math.round((blockRef.width || MAX_WIDTH) * scale)
  const displayH = Math.round((blockRef.height || MAX_HEIGHT) * scale)

  // Create blob URL when data is loaded
  useEffect(() => {
    if (status === 'loaded' && data && !blobUrl) {
      try {
        const binary = atob(data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        const url = URL.createObjectURL(new Blob([bytes], { type: blockRef.mimeType }))
        setBlobUrl(url)
        blobUrlRef.current = url
      } catch {
        // Silently handle decode errors
      }
    }
  }, [status, data, blobUrl, blockRef.mimeType])

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }
    }
  }, [])

  const handlePlay = () => {
    setPlaying(true)
  }

  return (
    <div
      style={{ width: displayW, height: displayH, position: 'relative', overflow: 'hidden' }}
      className="rounded-lg"
    >
      {/* Playing state: video element */}
      {blobUrl ? (
        <video
          src={blobUrl}
          controls
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <>
          {/* Thumbnail or placeholder */}
          {blockRef.microThumbnail ? (
            <img
              src={`data:image/jpeg;base64,${blockRef.microThumbnail}`}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              draggable={false}
            />
          ) : (
            <ContentPlaceholder
              width={displayW}
              height={displayH}
              progress="cache"
            />
          )}

          {/* Play button overlay */}
          <button
            onClick={handlePlay}
            disabled={playing && !blobUrl}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: playing ? 'wait' : 'pointer',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {playing && !blobUrl ? (
                // Loading spinner
                <div
                  style={{
                    width: 24,
                    height: 24,
                    border: '3px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              ) : (
                // Play triangle
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <polygon points="8,5 20,12 8,19" />
                </svg>
              )}
            </div>
          </button>
        </>
      )}
    </div>
  )
}
