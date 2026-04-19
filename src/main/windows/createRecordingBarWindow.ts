import { BrowserWindow, screen } from 'electron'

import { loadRendererWindow } from './windowManager'

export async function createRecordingBarWindow(preloadPath: string): Promise<BrowserWindow> {
  const bounds = screen.getPrimaryDisplay().workArea
  const width = 400
  const height = 84
  const x = Math.round(bounds.x + bounds.width / 2 - width / 2)
  const y = Math.round(bounds.y + bounds.height - height - 28)

  const window = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.setIgnoreMouseEvents(true, { forward: true })

  await loadRendererWindow(window, 'recording-bar')
  return window
}
