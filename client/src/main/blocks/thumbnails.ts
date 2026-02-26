/**
 * Micro-thumbnail generation for image content.
 *
 * Generates tiny JPEG previews (~100px) that are inlined with gossip
 * messages so recipients see a blurry preview while fetching full images.
 * Also provides MIME type detection from filenames.
 */

import sharp from 'sharp'

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

/**
 * Check if a MIME type is an image type that supports thumbnail generation.
 */
export function isImageMime(mimeType: string): boolean {
  return IMAGE_MIMES.has(mimeType)
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
