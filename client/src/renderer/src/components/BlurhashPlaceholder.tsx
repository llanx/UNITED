/**
 * Canvas-based blurhash decoding component.
 *
 * Decodes a blurhash string and renders to a canvas element at small resolution,
 * then scales up via CSS for a smooth gradient placeholder effect.
 * Used in the Lightbox for full-screen placeholders while high-res images load.
 */

import React, { useRef, useEffect } from 'react'
import { decode, isBlurhashValid } from 'blurhash'

interface BlurhashPlaceholderProps {
  /** Blurhash string to decode */
  hash: string
  /** Display width in pixels (CSS, not decode resolution) */
  width: number
  /** Display height in pixels (CSS, not decode resolution) */
  height: number
}

/**
 * Renders a blurhash to a canvas at small resolution (max 32px per side),
 * CSS scales it up for smooth gradient appearance.
 */
const BlurhashPlaceholder = React.memo(function BlurhashPlaceholder({
  hash,
  width,
  height,
}: BlurhashPlaceholderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Validate before decoding
    if (!isBlurhashValid(hash).result) return

    // Decode at small resolution for performance -- CSS scales up
    const decodeW = Math.min(width, 32)
    const decodeH = Math.min(height, 32)

    try {
      const pixels = decode(hash, decodeW, decodeH)
      canvas.width = decodeW
      canvas.height = decodeH

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const imageData = ctx.createImageData(decodeW, decodeH)
      imageData.data.set(pixels)
      ctx.putImageData(imageData, 0, 0)
    } catch {
      // Silently ignore decode errors
    }
  }, [hash, width, height])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
      }}
    />
  )
})

export default BlurhashPlaceholder
