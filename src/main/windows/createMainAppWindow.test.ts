import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const loadRendererWindowMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const browserWindowState = vi.hoisted(() => ({
  instances: [] as Array<{
    on: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    removeMenu: ReturnType<typeof vi.fn>
    setMenuBarVisibility: ReturnType<typeof vi.fn>
  }>
}))
const BrowserWindowMock = vi.hoisted(
  () =>
    class {
      on = vi.fn()
      show = vi.fn()
      removeMenu = vi.fn()
      setMenuBarVisibility = vi.fn()

      constructor() {
        browserWindowState.instances.push(this)
      }
    }
)

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowMock
}))

vi.mock('./windowManager', () => ({
  loadRendererWindow: loadRendererWindowMock
}))

import { createMainAppWindow } from './createMainAppWindow'

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

function setProcessPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform
  })
}

describe('createMainAppWindow', () => {
  beforeEach(() => {
    browserWindowState.instances.length = 0
    loadRendererWindowMock.mockClear()
    setProcessPlatform('darwin')
  })

  it('removes the window menu on Windows so Alt does not reveal it', async () => {
    setProcessPlatform('win32')

    await createMainAppWindow('/tmp/preload.js', { showOnReady: false })

    const window = browserWindowState.instances[0]
    expect(window).toBeDefined()
    expect(window?.removeMenu).toHaveBeenCalledOnce()
    expect(window?.setMenuBarVisibility).toHaveBeenCalledWith(false)
    expect(loadRendererWindowMock).toHaveBeenCalledWith(window, 'main-app')
  })

  it('leaves the menu wiring alone on macOS', async () => {
    await createMainAppWindow('/tmp/preload.js', { showOnReady: false })

    const window = browserWindowState.instances[0]
    expect(window?.removeMenu).not.toHaveBeenCalled()
    expect(window?.setMenuBarVisibility).not.toHaveBeenCalled()
  })
})

afterAll(() => {
  if (platformDescriptor) {
    Object.defineProperty(process, 'platform', platformDescriptor)
  }
})
