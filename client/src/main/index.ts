import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { initDb } from './db/schema'
import { registerAuthHandlers } from './ipc/auth'
import { registerCryptoHandlers } from './ipc/crypto'
import { registerStorageHandlers } from './ipc/storage'
import { registerConnectionHandlers } from './ipc/connection'

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

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'united.db')
  initDb(dbPath)

  registerAuthHandlers(ipcMain)
  registerCryptoHandlers(ipcMain)
  registerStorageHandlers(ipcMain)
  registerConnectionHandlers(ipcMain)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
