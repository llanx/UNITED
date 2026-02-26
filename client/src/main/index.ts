import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import path from 'path'
import { initDb } from './db/schema'
import { registerAuthHandlers } from './ipc/auth'
import { registerCryptoHandlers } from './ipc/crypto'
import { registerStorageHandlers } from './ipc/storage'
import { registerConnectionHandlers } from './ipc/connection'
import { registerProvisioningHandlers } from './ipc/provisioning'
import { registerChannelHandlers } from './ipc/channels-api'
import { registerRoleHandlers } from './ipc/roles-api'
import { registerInviteHandlers } from './ipc/invite'
import { parseInviteInput } from './ipc/invite'
import { registerP2PHandlers, initP2PListener } from './ipc/p2p'
import { registerChatHandlers } from './ipc/chat'
import { registerPresenceHandlers } from './ipc/presence'
import { registerNotificationHandlers } from './ipc/notifications'
import { registerDmHandlers } from './ipc/dm'
import { registerBlockHandlers } from './ipc/blocks'
import { setupChatEventListener } from './ws/chat-events'
import { setupDmEventListener } from './ws/dm-events'
import { IPC } from './ipc/channels'

// ============================================================
// Custom protocol: united://
// Must be registered before app.whenReady()
// ============================================================

protocol.registerSchemesAsPrivileged([
  { scheme: 'united', privileges: { standard: true, secure: true } }
])

// ============================================================
// Single instance lock — deep links go to existing window
// ============================================================

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

// ============================================================
// Deep link handling
// ============================================================

function handleDeepLink(url: string): void {
  if (!url.startsWith('united://')) return

  const parsed = parseInviteInput(url)
  if (!parsed.inviteCode) return

  // Send to all renderer windows
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.send(IPC.PUSH_DEEP_LINK, parsed.inviteCode, parsed.serverUrl)
  }
}

// CSP must match the meta tag in renderer/index.html
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'"
].join('; ')

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 940,
    minHeight: 500,
    backgroundColor: '#1a1a2e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    })
  })

  win.once('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

// Windows/Linux: second-instance event carries the deep link URL in argv
app.on('second-instance', (_event, argv) => {
  const deepLinkUrl = argv.find((arg) => arg.startsWith('united://'))
  if (deepLinkUrl) {
    handleDeepLink(deepLinkUrl)
  }
})

// macOS: open-url event for deep links
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'united.db')
  initDb(dbPath)

  // Register as default protocol handler for united://
  app.setAsDefaultProtocolClient('united')

  registerAuthHandlers(ipcMain)
  registerCryptoHandlers(ipcMain)
  registerStorageHandlers(ipcMain)
  registerConnectionHandlers(ipcMain)
  registerProvisioningHandlers(ipcMain)
  registerChannelHandlers(ipcMain)
  registerRoleHandlers(ipcMain)
  registerInviteHandlers(ipcMain)
  registerP2PHandlers(ipcMain)
  registerChatHandlers(ipcMain)
  registerPresenceHandlers(ipcMain)
  registerNotificationHandlers(ipcMain)
  registerDmHandlers(ipcMain)
  registerBlockHandlers(ipcMain)
  initP2PListener()
  setupChatEventListener()
  setupDmEventListener()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Handle deep links from initial launch (when app was opened via deep link)
  if (process.platform !== 'darwin') {
    const deepLinkUrl = process.argv.find((arg) => arg.startsWith('united://'))
    if (deepLinkUrl) {
      // Delay to ensure window is created and renderer is ready
      setTimeout(() => handleDeepLink(deepLinkUrl), 1000)
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
