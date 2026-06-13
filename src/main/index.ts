import { app, shell, BrowserWindow, session, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { APP_ICON_DATA_URL } from './trayIcon'
import { setDataDir, ensureDataDir } from './store/paths'
import { importLegacyData } from './store/migrate'
import { registerIpc } from './ipc'
import { startScheduler, stopScheduler, runStartupBackups } from './scheduler'
import { createTray } from './tray'

let mainWindow: BrowserWindow | null = null
let isQuiting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Git Manager',
    backgroundColor: '#0b0d12',
    icon: nativeImage.createFromDataURL(APP_ICON_DATA_URL),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Closing the window hides it to the tray; backups keep running.
  mainWindow.on('close', (e) => {
    if (!isQuiting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Storage lives under the OS-standard userData dir.
  setDataDir(app.getPath('userData'))
  ensureDataDir()
  importLegacyData()

  electronApp.setAppUserModelId('com.gitmanager.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // Harden the renderer with a Content-Security-Policy in production. In dev,
  // Vite's HMR needs a looser policy, so this only applies to packaged builds.
  if (!is.dev) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"
          ]
        }
      })
    })
  }

  registerIpc()
  createWindow()
  createTray(
    () => mainWindow,
    () => {
      isQuiting = true
    }
  )
  startScheduler()
  void runStartupBackups()

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  isQuiting = true
  stopScheduler()
})

// Keep running in the tray when all windows are closed (Quit via the tray exits).
app.on('window-all-closed', () => {
  // Intentionally do not quit here; the tray keeps the scheduler alive.
})
