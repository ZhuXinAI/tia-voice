import { BrowserWindow, screen } from 'electron'

import { loadRendererWindow } from './windowManager'

export async function createChatWindow(preloadPath: string): Promise<BrowserWindow> {
  const bounds = screen.getPrimaryDisplay().workArea
  const width = 360
  const height = 240
  const x = Math.round(bounds.x + bounds.width - width - 28)
  const y = Math.round(bounds.y + 28)

  const window = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
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

  await loadRendererWindow(window, 'chat')
  return window
}
