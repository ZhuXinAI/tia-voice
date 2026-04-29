import { BrowserWindow, screen } from 'electron'

import { loadRendererWindow } from './windowManager'

export async function createTtsPlayerWindow(
  preloadPath: string,
  options?: { load?: boolean }
): Promise<BrowserWindow> {
  const shouldLoad = options?.load ?? true
  const bounds = screen.getPrimaryDisplay().workArea
  const width = 440
  const height = 260
  const x = Math.round(bounds.x + bounds.width - width - 36)
  const y = Math.round(bounds.y + bounds.height - height - 120)

  const window = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    hasShadow: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (shouldLoad) {
    await loadRendererWindow(window, 'tts-player')
  }

  return window
}
