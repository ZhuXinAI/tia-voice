import { BrowserWindow, screen } from 'electron'

import { loadRendererWindow } from './windowManager'

export async function createLiveCaptionOverlayWindow(
  preloadPath: string,
  options?: { load?: boolean }
): Promise<BrowserWindow> {
  const shouldLoad = options?.load ?? true
  const bounds = screen.getPrimaryDisplay().workArea
  const width = 640
  const height = 180
  const x = Math.round(bounds.x + bounds.width / 2 - width / 2)
  const y = Math.round(bounds.y + bounds.height - height - 88)

  const window = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
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
    await loadRendererWindow(window, 'live-caption-overlay')
  }

  return window
}
