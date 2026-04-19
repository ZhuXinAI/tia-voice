import { BrowserWindow } from 'electron'

import { loadRendererWindow } from './windowManager'

export async function createMainAppWindow(
  preloadPath: string,
  options?: { showOnReady?: boolean }
): Promise<BrowserWindow> {
  const showOnReady = options?.showOnReady ?? true
  const window = new BrowserWindow({
    width: 1220,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'TIA Voice',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  window.on('ready-to-show', () => {
    if (showOnReady) {
      window.show()
    }
  })

  await loadRendererWindow(window, 'main-app')
  return window
}
