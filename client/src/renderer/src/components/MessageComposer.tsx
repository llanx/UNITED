/**
 * Auto-expanding message composer with Enter-to-send, @mention autocomplete,
 * and file attachment support (paperclip button, drag-and-drop, clipboard paste).
 *
 * Features:
 * - Auto-expanding textarea (1-5 lines, then scrolls)
 * - Enter sends, Shift+Enter inserts newline
 * - Reply mode with preview bar and cancel
 * - @mention autocomplete on '@' keystroke
 * - Placeholder shows channel name
 * - File attachment via paperclip button, drag-and-drop, clipboard paste
 * - Staged file previews with remove buttons
 * - Upload progress bar during blocking send
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ChatMessage, FileAttachment, UploadProgress as UploadProgressType } from '@shared/ipc-bridge'
import { useStore } from '../stores'
import MentionAutocomplete, { type MentionItem } from './MentionAutocomplete'
import FilePreview from './FilePreview'
import UploadProgress from './UploadProgress'

interface MessageComposerProps {
  channelId: string
  channelName: string
  replyTo: ChatMessage | null
  onCancelReply: () => void
  onMessageSent: () => void
  /** Files dropped from parent (ChatView) drag-and-drop zone */
  droppedFiles?: FileAttachment[]
  /** Called after parent-dropped files are consumed */
  onDroppedFilesConsumed?: () => void
}

/** Min/max heights for auto-expand */
const MIN_HEIGHT = 40
const MAX_HEIGHT = 120
/** Maximum files per message */
const MAX_FILES = 10

export default function MessageComposer({
  channelId,
  channelName,
  replyTo,
  onCancelReply,
  onMessageSent,
  droppedFiles,
  onDroppedFilesConsumed,
}: MessageComposerProps) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Connection status awareness — disable input when WS is disconnected
  const status = useStore((s) => s.status)
  const isDisconnected = status !== 'connected'

  // File attachment state
  const [stagedFiles, setStagedFiles] = useState<FileAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgressType | null>(null)

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  // @mention autocomplete state
  const [mentionActive, setMentionActive] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStartIndex, setMentionStartIndex] = useState(-1)
  const [mentionAnchor, setMentionAnchor] = useState({ x: 0, y: 0 })

  // Handle files dropped from parent ChatView
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      setStagedFiles((prev) => {
        const combined = [...prev, ...droppedFiles]
        return combined.slice(0, MAX_FILES)
      })
      onDroppedFilesConsumed?.()
    }
  }, [droppedFiles, onDroppedFilesConsumed])

  // Clear staged files when switching channels
  useEffect(() => {
    setStagedFiles([])
    setUploadProgress(null)
    setUploading(false)
  }, [channelId])

  // Auto-resize textarea based on content
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = `${MIN_HEIGHT}px`
    const scrollHeight = ta.scrollHeight
    ta.style.height = `${Math.min(scrollHeight, MAX_HEIGHT)}px`
    ta.style.overflowY = scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [content, adjustHeight])

  // Focus textarea when reply mode activates
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus()
    }
  }, [replyTo])

  // Close mention autocomplete when switching channels
  useEffect(() => {
    setMentionActive(false)
  }, [channelId])

  // ============================================================
  // Send handlers
  // ============================================================

  const handleSend = useCallback(async () => {
    const trimmed = content.trim()
    const hasFiles = stagedFiles.length > 0
    const hasText = trimmed.length > 0

    // Need either text or files to send; block when disconnected
    if ((!hasText && !hasFiles) || sending || uploading || isDisconnected) return

    setSending(true)
    setMentionActive(false)

    try {
      if (hasFiles) {
        // Media upload path (blocking send with progress)
        setUploading(true)
        const cleanup = window.united.media.onUploadProgress((p) => {
          setUploadProgress(p)
        })

        try {
          await window.united.media.uploadFiles({
            channelId,
            content: trimmed,
            replyToId: replyTo?.id,
            files: stagedFiles,
          })
          setStagedFiles([])
          setContent('')
          onCancelReply()
          onMessageSent()
        } finally {
          cleanup()
          setUploading(false)
          setUploadProgress(null)
        }
      } else {
        // Text-only send path
        await window.united.chat.send(channelId, trimmed, replyTo?.id)
        setContent('')
        onCancelReply()
        onMessageSent()
      }

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_HEIGHT}px`
      }
      textareaRef.current?.focus()
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }, [content, channelId, replyTo, sending, uploading, isDisconnected, stagedFiles, onCancelReply, onMessageSent])

  // ============================================================
  // File attachment handlers
  // ============================================================

  const handleAttachClick = useCallback(async () => {
    try {
      const files = await window.united.media.pickFiles()
      if (files.length > 0) {
        setStagedFiles((prev) => {
          const combined = [...prev, ...files]
          return combined.slice(0, MAX_FILES)
        })
      }
    } catch (err) {
      console.error('Failed to pick files:', err)
    }
  }, [])

  const handleRemoveFile = useCallback((index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // ============================================================
  // Drag-and-drop handlers
  // ============================================================

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)

    const droppedFilesList = e.dataTransfer.files
    if (!droppedFilesList.length) return

    const newFiles: FileAttachment[] = []
    for (let i = 0; i < droppedFilesList.length; i++) {
      const file = droppedFilesList[i]
      // In Electron, File objects from drag-and-drop have a .path property
      const filePath = (file as File & { path?: string }).path || ''
      newFiles.push({
        path: filePath,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
      })
    }

    setStagedFiles((prev) => {
      const combined = [...prev, ...newFiles]
      return combined.slice(0, MAX_FILES)
    })
  }, [])

  // ============================================================
  // Clipboard paste handler
  // ============================================================

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: FileAttachment[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          // Clipboard files don't have a .path -- use the File object's path if available (Electron)
          const filePath = (file as File & { path?: string }).path || ''
          imageFiles.push({
            path: filePath,
            name: file.name || `pasted-image.${item.type.split('/')[1] || 'png'}`,
            mimeType: item.type,
          })
        }
      }
    }

    if (imageFiles.length > 0) {
      setStagedFiles((prev) => {
        const combined = [...prev, ...imageFiles]
        return combined.slice(0, MAX_FILES)
      })
    }
  }, [])

  // ============================================================
  // Mention and text handlers (unchanged)
  // ============================================================

  /** Get approximate caret position for dropdown anchor */
  const getCaretAnchor = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return { x: 0, y: 0 }
    const rect = ta.getBoundingClientRect()
    return { x: rect.left + 12, y: rect.top }
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      const cursorPos = e.target.selectionStart

      setContent(value)

      // Check for @mention trigger
      if (cursorPos > 0) {
        const textBefore = value.slice(0, cursorPos)
        const lastAtIndex = textBefore.lastIndexOf('@')

        if (lastAtIndex >= 0) {
          const charBefore = lastAtIndex > 0 ? textBefore[lastAtIndex - 1] : ' '
          const isWordBoundary = charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0

          if (isWordBoundary) {
            const query = textBefore.slice(lastAtIndex + 1)
            if (!query.includes(' ') && !query.includes('\n')) {
              setMentionActive(true)
              setMentionQuery(query)
              setMentionStartIndex(lastAtIndex)
              setMentionAnchor(getCaretAnchor())
              return
            }
          }
        }
      }

      setMentionActive(false)
    },
    [getCaretAnchor]
  )

  const handleMentionSelect = useCallback(
    (item: MentionItem) => {
      const prefix = item.type === 'user' ? 'user' : 'role'
      const token = `@[${item.displayName}](${prefix}:${item.id})`
      const before = content.slice(0, mentionStartIndex)
      const cursorPos = textareaRef.current?.selectionStart ?? content.length
      const after = content.slice(cursorPos)
      const newContent = before + token + ' ' + after

      setContent(newContent)
      setMentionActive(false)

      requestAnimationFrame(() => {
        const ta = textareaRef.current
        if (ta) {
          ta.focus()
          const newPos = before.length + token.length + 1
          ta.setSelectionRange(newPos, newPos)
        }
      })
    },
    [content, mentionStartIndex]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionActive) {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) {
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setMentionActive(false)
          return
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      if (e.key === 'Escape' && replyTo) {
        onCancelReply()
      }
    },
    [handleSend, replyTo, onCancelReply, mentionActive]
  )

  const isDisabled = sending || uploading || isDisconnected

  return (
    <div
      className="relative shrink-0 border-t border-white/5 px-4 py-3"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag-and-drop overlay */}
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(88, 101, 242, 0.15)',
            border: '2px dashed var(--color-accent, #5865f2)',
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--color-accent, #5865f2)',
            }}
          >
            Drop files here
          </span>
        </div>
      )}

      {/* Reply preview bar */}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded border-l-2 border-[var(--color-accent)] bg-white/5 px-3 py-1.5">
          <span className="flex-1 truncate text-xs text-[var(--color-text-muted)]">
            Replying to{' '}
            <span className="font-semibold text-[var(--color-text-primary)]">
              {replyTo.sender_display_name}
            </span>
            :{' '}
            {replyTo.content.length > 80
              ? replyTo.content.slice(0, 80) + '...'
              : replyTo.content}
          </span>
          <button
            onClick={onCancelReply}
            className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
            title="Cancel reply"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* @mention autocomplete dropdown */}
      {mentionActive && (
        <MentionAutocomplete
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={() => setMentionActive(false)}
          anchorX={mentionAnchor.x}
          anchorY={mentionAnchor.y}
        />
      )}

      {/* Staged file previews or upload progress */}
      {uploading && uploadProgress ? (
        <UploadProgress
          fileIndex={uploadProgress.fileIndex}
          totalFiles={uploadProgress.totalFiles}
          percent={uploadProgress.percent}
        />
      ) : stagedFiles.length > 0 ? (
        <div className="mb-2 flex gap-2 overflow-x-auto py-1">
          {stagedFiles.map((file, i) => (
            <FilePreview
              key={`${file.name}-${i}`}
              file={file}
              onRemove={() => handleRemoveFile(i)}
            />
          ))}
        </div>
      ) : null}

      {/* Input row: attachment button + textarea */}
      <div className="flex items-end gap-2">
        {/* Paperclip attachment button */}
        <button
          onClick={handleAttachClick}
          disabled={isDisabled}
          className="mb-1 shrink-0 rounded p-2 text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)] disabled:opacity-40"
          title="Attach files"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isDisconnected ? 'Reconnecting...' : `Message #${channelName}`}
          className={`w-full resize-none rounded-lg border border-white/10 bg-[var(--color-bg-tertiary)] p-3 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-white/20${isDisconnected ? ' opacity-50 cursor-not-allowed' : ''}`}
          style={{
            minHeight: `${MIN_HEIGHT}px`,
            maxHeight: `${MAX_HEIGHT}px`,
            overflowY: 'hidden',
          }}
          disabled={isDisabled}
        />
      </div>
    </div>
  )
}
