import { BrowserWindow, screen } from 'electron'

import { loadRendererWindow } from './windowManager'

export async function createLiveCaptionConfigWindow(
  preloadPath: string,
  options?: { load?: boolean }
): Promise<BrowserWindow> {
  const shouldLoad = options?.load ?? true
  const bounds = screen.getPrimaryDisplay().workArea
  const width = 460
  const height = 460
  const x = Math.round(bounds.x + bounds.width / 2 - width / 2)
  const y = Math.round(bounds.y + bounds.height / 2 - height / 2)

  const window = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'Live Caption',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  if (process.platform === 'win32') {
    window.removeMenu()
    window.setMenuBarVisibility(false)
  }

  if (shouldLoad) {
    await loadRendererWindow(window, 'live-caption-config')
  }

  return window
}
