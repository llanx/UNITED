/**
 * IPC handlers for desktop notifications.
 *
 * Handles notification display for mentions, coalescing rapid notifications
 * per channel (2s window), and click-to-navigate behavior.
 */

import { BrowserWindow, Notification, type IpcMain } from 'electron'
import { IPC } from './channels'
import type { ChatMessage, NotificationPrefs } from '@shared/ipc-bridge'

// ============================================================
// Notification state
// ============================================================

/** Per-channel notification preferences (stored in memory, persisted via renderer) */
const channelPrefs: Map<string, NotificationPrefs> = new Map()

/** Per-channel coalescing timers to prevent notification spam */
const coalescingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

/** The channel ID the user is currently viewing (if window is focused) */
let activeViewChannelId: string | null = null

// ============================================================
// Notification display
// ============================================================

/**
 * Show a desktop notification for a chat message.
 * Coalesces rapid notifications within a 2-second window per channel.
 * Does not notify if the window is focused and user is viewing the same channel.
 */
export function showMessageNotification(
  message: ChatMessage,
  channelName: string,
  serverName: string,
  isMention: boolean
): void {
  // Check if channel is muted
  const prefs = channelPrefs.get(message.channel_id)
  if (prefs?.muted) return

  // Check if user should be notified
  // Default: only mentions. notifyAll: all messages.
  if (!isMention && !prefs?.notifyAll) return

  // Don't notify if window is focused and user is viewing this channel
  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (focusedWindow && activeViewChannelId === message.channel_id) return

  // Coalesce notifications per channel (2-second window)
  const existingTimer = coalescingTimers.get(message.channel_id)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  coalescingTimers.set(
    message.channel_id,
    setTimeout(() => {
      coalescingTimers.delete(message.channel_id)
      displayNotification(message, channelName, serverName)
    }, 100) // Small delay for coalescing; actual 2s window handled by timer reset
  )

  // If no timer was active, show immediately and start coalescing window
  if (!existingTimer) {
    displayNotification(message, channelName, serverName)
    // Set a coalescing window -- further notifications within 2s are suppressed
    coalescingTimers.set(
      message.channel_id,
      setTimeout(() => {
        coalescingTimers.delete(message.channel_id)
      }, 2000)
    )
  }
}

function displayNotification(
  message: ChatMessage,
  channelName: string,
  serverName: string
): void {
  if (!Notification.isSupported()) return

  const preview = message.content.length > 100
    ? message.content.substring(0, 97) + '...'
    : message.content

  const notification = new Notification({
    title: `${message.sender_display_name} in #${channelName}`,
    body: preview,
    subtitle: serverName,
    silent: false
  })

  notification.on('click', () => {
    // Focus the window and navigate to the channel
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      if (win.isMinimized()) win.restore()
      win.focus()
      // Send IPC to renderer to navigate to the channel
      win.webContents.send(IPC.PUSH_CHAT_EVENT, {
        type: 'navigate',
        channelId: message.channel_id
      })
    }
  })

  notification.show()
}

/**
 * Update the active channel ID for notification suppression.
 * Called when the renderer reports which channel the user is viewing.
 */
export function setActiveViewChannel(channelId: string | null): void {
  activeViewChannelId = channelId
}

// ============================================================
// IPC handlers
// ============================================================

export function registerNotificationHandlers(ipcMain: IpcMain): void {
  // Set notification preferences for a channel
  ipcMain.handle(IPC.NOTIFICATIONS_SET_PREFS, async (
    _event,
    channelId: string,
    prefs: NotificationPrefs
  ): Promise<void> => {
    channelPrefs.set(channelId, prefs)
  })

  // Show a desktop notification (triggered by renderer for @mentions)
  ipcMain.handle(IPC.NOTIFICATIONS_SHOW, async (
    _event,
    opts: { title: string; body: string; channelId: string; serverName?: string }
  ): Promise<void> => {
    if (!Notification.isSupported()) return

    // Don't notify if window is focused on this channel
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow && activeViewChannelId === opts.channelId) return

    // Check coalescing
    const existingTimer = coalescingTimers.get(opts.channelId)
    if (existingTimer) return // Already coalescing, skip

    const notification = new Notification({
      title: opts.title,
      body: opts.body,
      subtitle: opts.serverName || '',
      silent: false,
    })

    notification.on('click', () => {
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        const win = windows[0]
        if (win.isMinimized()) win.restore()
        win.focus()
        win.webContents.send(IPC.PUSH_CHAT_EVENT, {
          type: 'navigate',
          channelId: opts.channelId,
        })
      }
    })

    notification.show()

    // Start coalescing window
    coalescingTimers.set(
      opts.channelId,
      setTimeout(() => {
        coalescingTimers.delete(opts.channelId)
      }, 2000)
    )
  })
}
