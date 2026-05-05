import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadRendererWindowMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const browserWindowState = vi.hoisted(() => ({
  instances: [] as Array<{
    options: Record<string, unknown>
    setVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>
    removeMenu: ReturnType<typeof vi.fn>
    setMenuBarVisibility: ReturnType<typeof vi.fn>
  }>
}))

const BrowserWindowMock = vi.hoisted(
  () =>
    class {
      options: Record<string, unknown>
      setVisibleOnAllWorkspaces = vi.fn()
      removeMenu = vi.fn()
      setMenuBarVisibility = vi.fn()

      constructor(options: Record<string, unknown>) {
        this.options = options
        browserWindowState.instances.push(this)
      }
    }
)

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowMock,
  screen: {
    getPrimaryDisplay: () => ({
      workArea: {
        x: 0,
        y: 0,
        width: 1440,
        height: 900
      }
    })
  }
}))

vi.mock('./windowManager', () => ({
  loadRendererWindow: loadRendererWindowMock
}))

import { createLiveCaptionConfigWindow } from './createLiveCaptionConfigWindow'
import { createLiveCaptionOverlayWindow } from './createLiveCaptionOverlayWindow'

describe('createLiveCaption windows', () => {
  beforeEach(() => {
    browserWindowState.instances.length = 0
    loadRendererWindowMock.mockClear()
  })

  it('creates a focused setup window for language choices', async () => {
    await createLiveCaptionConfigWindow('/tmp/preload.js')

    const window = browserWindowState.instances[0]
    expect(window?.options.width).toBe(460)
    expect(window?.options.height).toBe(460)
    expect(window?.options.resizable).toBe(false)
    expect(window?.options.title).toBe('Live Caption')
    expect(loadRendererWindowMock).toHaveBeenCalledWith(window, 'live-caption-config')
  })

  it('creates a draggable transparent caption overlay without mouse pass-through', async () => {
    await createLiveCaptionOverlayWindow('/tmp/preload.js')

    const window = browserWindowState.instances[0]
    expect(window?.options.width).toBe(640)
    expect(window?.options.height).toBe(180)
    expect(window?.options.frame).toBe(false)
    expect(window?.options.transparent).toBe(true)
    expect(window?.options.focusable).toBe(true)
    expect(window?.options.alwaysOnTop).toBe(true)
    expect(window?.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true
    })
    expect(loadRendererWindowMock).toHaveBeenCalledWith(window, 'live-caption-overlay')
  })
})
