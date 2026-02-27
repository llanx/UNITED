/**
 * Push-to-talk module using uiohook-napi for global keyboard hooks.
 *
 * Registers system-wide keydown/keyup events so PTT works even when
 * the app is not focused. Default key is backtick/grave (top-left of
 * keyboard, rarely used in typing, common PTT default).
 */

import { uIOhook, UiohookKey } from 'uiohook-napi'
import { BrowserWindow } from 'electron'
import { IPC } from '../ipc/channels'

/** Default PTT key: backtick/grave (common PTT default, top-left keyboard) */
export const DEFAULT_PTT_KEY = UiohookKey.Backquote

let currentKey: number = DEFAULT_PTT_KEY
let pttActive = false
let running = false

let keydownHandler: ((e: { keycode: number }) => void) | null = null
let keyupHandler: ((e: { keycode: number }) => void) | null = null

/**
 * Start listening for PTT key events.
 */
export function startPTT(
  key: number = currentKey,
  onActivate?: () => void,
  onDeactivate?: () => void
): void {
  if (running) stopPTT()

  currentKey = key
  pttActive = false

  keydownHandler = (e: { keycode: number }) => {
    if (e.keycode === currentKey && !pttActive) {
      pttActive = true
      onActivate?.()
      broadcastPttState(true)
    }
  }

  keyupHandler = (e: { keycode: number }) => {
    if (e.keycode === currentKey && pttActive) {
      pttActive = false
      onDeactivate?.()
      broadcastPttState(false)
    }
  }

  uIOhook.on('keydown', keydownHandler)
  uIOhook.on('keyup', keyupHandler)
  uIOhook.start()
  running = true
}

/**
 * Stop listening for PTT key events.
 */
export function stopPTT(): void {
  if (!running) return

  try {
    uIOhook.stop()
  } catch {
    // May already be stopped
  }

  if (keydownHandler) {
    uIOhook.off('keydown', keydownHandler)
    keydownHandler = null
  }
  if (keyupHandler) {
    uIOhook.off('keyup', keyupHandler)
    keyupHandler = null
  }

  pttActive = false
  running = false
}

/**
 * Change the PTT key. Stops and restarts with new key.
 */
export function changePTTKey(newKey: number): void {
  currentKey = newKey
  if (running) {
    stopPTT()
    startPTT(newKey)
  }
}

/**
 * Get the current PTT key code.
 */
export function getCurrentPTTKey(): number {
  return currentKey
}

/**
 * Check if PTT hook is currently running.
 */
export function isPTTRunning(): boolean {
  return running
}

/**
 * Broadcast PTT state change to all renderer windows.
 */
function broadcastPttState(active: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.PUSH_PTT_STATE, active)
  }
}
