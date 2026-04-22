import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadRendererWindowMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const browserWindowState = vi.hoisted(() => ({
  instances: [] as Array<{
    options: Record<string, unknown>
    setVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>
    setIgnoreMouseEvents: ReturnType<typeof vi.fn>
  }>
}))

const BrowserWindowMock = vi.hoisted(
  () =>
    class {
      options: Record<string, unknown>
      setVisibleOnAllWorkspaces = vi.fn()
      setIgnoreMouseEvents = vi.fn()

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

import { createRecordingBarWindow } from './createRecordingBarWindow'

describe('createRecordingBarWindow', () => {
  beforeEach(() => {
    browserWindowState.instances.length = 0
    loadRendererWindowMock.mockClear()
  })

  it('creates a compact 60px-tall overlay window', async () => {
    await createRecordingBarWindow('/tmp/preload.js')

    const window = browserWindowState.instances[0]
    expect(window).toBeDefined()
    expect(window?.options.height).toBe(60)
    expect(window?.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true
    })
    expect(window?.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
    expect(loadRendererWindowMock).toHaveBeenCalledWith(window, 'recording-bar')
  })
})
