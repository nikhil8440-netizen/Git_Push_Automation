import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { APP_ICON_DATA_URL } from './trayIcon'

let tray: Tray | null = null

function showWindow(getWindow: () => BrowserWindow | null): void {
  const w = getWindow()
  if (!w) return
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

/**
 * System-tray presence so backups keep running when the window is closed.
 * Closing the window hides it to the tray; Quit (here) actually exits.
 */
export function createTray(getWindow: () => BrowserWindow | null, onQuit: () => void): void {
  if (tray) return
  const icon = nativeImage.createFromDataURL(APP_ICON_DATA_URL).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Git Manager')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Git Manager', click: () => showWindow(getWindow) },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          onQuit()
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => showWindow(getWindow))
}

/** Enable or disable launching the app automatically at login. */
export function setLaunchAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled })
}
