/**
 * Micro-thumbnail generation for image content.
 *
 * Generates tiny JPEG previews (~100px) that are inlined with gossip
 * messages so recipients see a blurry preview while fetching full images.
 * Also provides MIME type detection from filenames.
 */

import sharp from 'sharp'
import { encode as blurhashEncode } from 'blurhash'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { randomBytes } from 'crypto'

// ============================================================
// MIME type utilities
// ============================================================

const EXTENSION_TO_MIME: Record<string, string> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',

  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',

  // Audio
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aac: 'audio/aac',

  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',

  // Archives
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',

  // Code
  js: 'text/javascript',
  ts: 'text/typescript',
  json: 'application/json',
  html: 'text/html',
  css: 'text/css',
  xml: 'application/xml',
}

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
])

/**
 * Check if a MIME type is an image type that supports thumbnail generation.
 */
export function isImageMime(mimeType: string): boolean {
  return IMAGE_MIMES.has(mimeType)
}

/**
 * Check if a MIME type is a video type.
 */
export function isVideoMime(mimeType: string): boolean {
  return VIDEO_MIMES.has(mimeType)
}

/**
 * Get MIME type from a filename based on extension.
 * Returns 'application/octet-stream' for unknown types.
 */
export function getFileMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext) return 'application/octet-stream'
  return EXTENSION_TO_MIME[ext] ?? 'application/octet-stream'
}

// ============================================================
// Thumbnail generation
// ============================================================

export interface MicroThumbnailResult {
  /** Resized JPEG thumbnail (~100px max width) */
  thumbnail: Buffer
  /** Original image width in pixels */
  width: number
  /** Original image height in pixels */
  height: number
}

/**
 * Generate a micro-thumbnail from image data.
 *
 * Resizes to max 100px width (maintaining aspect ratio) and converts to
 * JPEG at quality 40. Returns the thumbnail buffer and original dimensions.
 *
 * @param imageData - Raw image buffer (JPEG, PNG, GIF, or WebP)
 * @throws Error if image dimensions cannot be read
 */
export async function generateMicroThumbnail(
  imageData: Buffer
): Promise<MicroThumbnailResult> {
  // Read original dimensions
  const metadata = await sharp(imageData).metadata()

  if (!metadata.width || !metadata.height) {
    throw new Error('Cannot read image dimensions: metadata.width or metadata.height is undefined')
  }

  const width = metadata.width
  const height = metadata.height

  // Resize to max 100px width (maintain aspect ratio), convert to JPEG quality 40
  const thumbnail = await sharp(imageData)
    .resize(100, undefined, { fit: 'inside' })
    .jpeg({ quality: 40 })
    .toBuffer()

  return { thumbnail, width, height }
}

// ============================================================
// Blurhash generation
// ============================================================

/**
 * Generate a blurhash string from image data.
 *
 * Resizes image to 32x32 (for fast encoding), extracts raw RGBA pixels,
 * and encodes with 4 x-components and 3 y-components.
 * Returns a ~30 byte blurhash string suitable for inline transmission.
 *
 * @param imageData - Raw image buffer (JPEG, PNG, GIF, or WebP)
 */
export async function generateBlurhash(imageData: Buffer): Promise<string> {
  const { data, info } = await sharp(imageData)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return blurhashEncode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    4, // x-components
    3  // y-components
  )
}

// ============================================================
// Video thumbnail extraction
// ============================================================

// Set ffmpeg binary path from the bundled static binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

export interface VideoThumbnailResult {
  /** Still frame extracted from video as a PNG buffer */
  thumbnail: Buffer
  /** Video width in pixels */
  width: number
  /** Video height in pixels */
  height: number
}

/**
 * Extract a still frame from a video file at the 1-second mark.
 *
 * Uses ffmpeg to grab a single frame, writes to a temp file, reads it back,
 * and returns the PNG buffer with dimensions. Falls back to null on any error
 * (video will display with play button but no preview).
 *
 * @param videoPath - Absolute path to the video file
 * @returns Thumbnail result or null on failure (graceful degradation)
 */
export async function generateVideoThumbnail(
  videoPath: string
): Promise<VideoThumbnailResult | null> {
  const tmpDir = os.tmpdir()
  const tmpFilename = `united-thumb-${randomBytes(8).toString('hex')}.png`
  const tmpPath = path.join(tmpDir, tmpFilename)

  try {
    // Extract frame at 1 second to avoid black first-frames
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(1)
        .frames(1)
        .output(tmpPath)
        .outputOptions(['-vf', 'scale=320:-1'])
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run()
    })

    // Read the generated thumbnail
    const thumbnail = await fs.readFile(tmpPath)

    // Get dimensions via sharp (more reliable than parsing ffmpeg output)
    const metadata = await sharp(thumbnail).metadata()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0

    // Clean up temp file
    await fs.unlink(tmpPath).catch(() => {})

    return { thumbnail, width, height }
  } catch {
    // Clean up temp file on error
    await fs.unlink(tmpPath).catch(() => {})
    return null
  }
}
