/**
 * Media upload IPC handlers.
 *
 * Implements the blocking send pattern: files are read, chunked into blocks,
 * thumbnails and blurhash placeholders generated, blocks uploaded to server,
 * then the message is published with block_refs.
 *
 * Progress events are pushed to the renderer during upload.
 */

import type { BrowserWindow } from 'electron'
import { dialog, ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'

import { IPC } from './channels'
import { getAccessToken, getServerUrl } from './auth'
import { computeBlockHash } from '../blocks/crypto'
import { putBlock } from '../blocks/index'
import { ContentTier } from '../blocks/types'
import {
  generateMicroThumbnail,
  generateBlurhash,
  generateVideoThumbnail,
  isImageMime,
  isVideoMime,
  getFileMimeType,
} from '../blocks/thumbnails'
import type { BlockRefData, FileAttachment, ChatMessage } from '@shared/ipc-bridge'

// ============================================================
// Constants
// ============================================================

/** Default max upload size per file in bytes (100 MB) */
const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024

/** Maximum number of files per message */
const MAX_FILES_PER_MESSAGE = 10

// ============================================================
// Handlers
// ============================================================

/**
 * Register media upload IPC handlers.
 * @param mainWindow - The main BrowserWindow for sending progress events
 */
export function registerMediaHandlers(mainWindow: BrowserWindow): void {
  // ---- MEDIA_UPLOAD_FILES ----
  // Blocking send: read files, store blocks, generate thumbnails + blurhash,
  // upload to server, then send message with block_refs.
  ipcMain.handle(
    IPC.MEDIA_UPLOAD_FILES,
    async (
      _event,
      params: {
        channelId: string
        content: string
        replyToId?: string
        files: FileAttachment[]
      }
    ): Promise<ChatMessage> => {
      const { channelId, content, replyToId, files } = params

      if (!files || files.length === 0) {
        throw new Error('No files provided')
      }
      if (files.length > MAX_FILES_PER_MESSAGE) {
        throw new Error(`Maximum ${MAX_FILES_PER_MESSAGE} files per message`)
      }

      const serverUrl = getServerUrl()
      const accessToken = getAccessToken()
      if (!serverUrl || !accessToken) {
        throw new Error('Not connected to server')
      }

      const blockRefs: BlockRefData[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        // Read file from disk
        const data = await fs.readFile(file.path)

        // Validate file size
        if (data.length > MAX_UPLOAD_SIZE_BYTES) {
          throw new Error(
            `File "${file.name}" exceeds maximum upload size of ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)} MB`
          )
        }

        // Compute content hash
        const hash = computeBlockHash(data)

        // Store block locally
        putBlock(data, ContentTier.P2_HOT, {
          mimeType: file.mimeType,
          filename: file.name,
        })

        // Upload block to server
        const uploadResp = await fetch(`${serverUrl}/api/blocks`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Block-Hash': hash,
            'X-Channel-Id': channelId,
            'Content-Type': 'application/octet-stream',
          },
          body: data,
        })

        if (!uploadResp.ok) {
          const errorText = await uploadResp.text()
          throw new Error(`Block upload failed for "${file.name}": ${uploadResp.status} ${errorText}`)
        }

        // Generate thumbnails and blurhash based on file type
        let width = 0
        let height = 0
        let microThumbnail: string | undefined
        let blurhash: string | undefined

        if (isImageMime(file.mimeType)) {
          // For images: get dimensions, micro-thumbnail, and blurhash
          try {
            const thumbResult = await generateMicroThumbnail(data)
            width = thumbResult.width
            height = thumbResult.height
            microThumbnail = thumbResult.thumbnail.toString('base64')
            blurhash = await generateBlurhash(data)
          } catch {
            // Graceful degradation: proceed without thumbnails
          }
        } else if (isVideoMime(file.mimeType)) {
          // For videos: extract still frame, generate micro-thumbnail and blurhash from it
          try {
            const videoThumb = await generateVideoThumbnail(file.path)
            if (videoThumb) {
              width = videoThumb.width
              height = videoThumb.height
              const thumbResult = await generateMicroThumbnail(videoThumb.thumbnail)
              microThumbnail = thumbResult.thumbnail.toString('base64')
              blurhash = await generateBlurhash(videoThumb.thumbnail)
            }
          } catch {
            // Graceful degradation: video shows play button without preview
          }
        }

        // Build block ref
        blockRefs.push({
          hash,
          size: data.length,
          mimeType: file.mimeType,
          width,
          height,
          microThumbnail,
          blurhash,
          filename: file.name,
        })

        // Send progress event to renderer
        mainWindow.webContents.send(IPC.PUSH_UPLOAD_PROGRESS, {
          fileIndex: i,
          totalFiles: files.length,
          percent: 100,
        })
      }

      // Send message with block_refs via REST
      const msgResp = await fetch(
        `${serverUrl}/api/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: content || '',
            reply_to_id: replyToId ?? null,
            block_refs_json: JSON.stringify(blockRefs),
          }),
        }
      )

      if (!msgResp.ok) {
        const errorText = await msgResp.text()
        throw new Error(`Message send failed: ${msgResp.status} ${errorText}`)
      }

      const msgData = await msgResp.json()
      return msgData as ChatMessage
    }
  )

  // ---- MEDIA_PICK_FILES ----
  // Open native file picker dialog
  ipcMain.handle(IPC.MEDIA_PICK_FILES, async (): Promise<FileAttachment[]> => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return []
    }

    return result.filePaths.map((filePath) => ({
      path: filePath,
      name: path.basename(filePath),
      mimeType: getFileMimeType(path.basename(filePath)),
    }))
  })
}
