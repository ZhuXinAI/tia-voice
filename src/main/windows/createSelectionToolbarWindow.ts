import { BrowserWindow } from 'electron'

import { loadRendererWindow } from './windowManager'

export async function createSelectionToolbarWindow(
  preloadPath: string,
  options?: { load?: boolean }
): Promise<BrowserWindow> {
  const shouldLoad = options?.load ?? true
  const window = new BrowserWindow({
    width: 196,
    height: 56,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: true,
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
    await loadRendererWindow(window, 'selection-toolbar')
  }

  return window
}
