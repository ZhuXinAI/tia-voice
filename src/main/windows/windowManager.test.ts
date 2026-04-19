import { beforeAll, describe, expect, it, vi } from 'vitest'

import { IPC_CHANNELS } from '../ipc/channels'

const existsSyncMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {}
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: false
  }
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  default: {
    existsSync: existsSyncMock
  }
}))

let buildRendererRoute: typeof import('./windowManager').buildRendererRoute
let createWindowManager: typeof import('./windowManager').createWindowManager
let loadRendererWindow: typeof import('./windowManager').loadRendererWindow

beforeAll(async () => {
  ;({ buildRendererRoute, createWindowManager, loadRendererWindow } =
    await import('./windowManager'))
})

describe('buildRendererRoute', () => {
  it('builds deterministic urls for each window role', () => {
    expect(buildRendererRoute('recording-bar')).toContain('window=recording-bar')
    expect(buildRendererRoute('chat')).toContain('window=chat')
    expect(buildRendererRoute('main-app')).toContain('window=main-app')
  })
})

describe('loadRendererWindow', () => {
  it('prefers packaged out/renderer path when available', async () => {
    existsSyncMock.mockImplementation((path: string) => path.includes('/main/renderer/index.html'))
    const window = {
      loadURL: vi.fn(),
      loadFile: vi.fn().mockResolvedValue(undefined)
    } as unknown as import('electron').BrowserWindow

    await loadRendererWindow(window, 'recording-bar')

    const [filePath, options] = (window.loadFile as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]
    expect(filePath).toContain('/main/renderer/index.html')
    expect(options).toEqual({ query: { window: 'recording-bar' } })
  })

  it('falls back to legacy renderer path when needed', async () => {
    existsSyncMock.mockImplementation(
      (path: string) => path.includes('/renderer/index.html') && !path.includes('/main/renderer/')
    )
    const window = {
      loadURL: vi.fn(),
      loadFile: vi.fn().mockResolvedValue(undefined)
    } as unknown as import('electron').BrowserWindow

    await loadRendererWindow(window, 'main-app')

    const [filePath, options] = (window.loadFile as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]
    expect(filePath).toContain('/renderer/index.html')
    expect(filePath).not.toContain('/main/renderer/')
    expect(options).toEqual({ query: { window: 'main-app' } })
  })
})

describe('createWindowManager', () => {
  it('does not throw when recording window is already destroyed', () => {
    const mainAppWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        isLoadingMainFrame: vi.fn(() => false),
        once: vi.fn(),
        send: vi.fn()
      }
    } as unknown as import('electron').BrowserWindow
    const recordingBarWindow = {
      isDestroyed: vi.fn(() => true),
      setAlwaysOnTop: vi.fn(),
      showInactive: vi.fn()
    } as unknown as import('electron').BrowserWindow

    Object.defineProperty(recordingBarWindow, 'webContents', {
      get: () => {
        throw new Error('webContents should not be accessed when window is destroyed')
      }
    })

    const manager = createWindowManager({
      mainAppWindow,
      recordingBarWindow
    })

    expect(() =>
      manager.showRecordingBar({
        type: 'start',
        startedAt: Date.now()
      })
    ).not.toThrow()
    expect(recordingBarWindow.setAlwaysOnTop).not.toHaveBeenCalled()
    expect(recordingBarWindow.showInactive).not.toHaveBeenCalled()
  })

  it('queues recording command until the recording window finishes loading', () => {
    const send = vi.fn()
    const once = vi.fn()

    const mainAppWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        isLoadingMainFrame: vi.fn(() => false),
        once: vi.fn(),
        send: vi.fn()
      }
    } as unknown as import('electron').BrowserWindow

    const recordingBarWindow = {
      isDestroyed: vi.fn(() => false),
      setAlwaysOnTop: vi.fn(),
      showInactive: vi.fn(),
      webContents: {
        isDestroyed: vi.fn(() => false),
        isLoadingMainFrame: vi.fn(() => true),
        once,
        send
      }
    } as unknown as import('electron').BrowserWindow

    const manager = createWindowManager({
      mainAppWindow,
      recordingBarWindow
    })

    const command = {
      type: 'start' as const,
      startedAt: 123
    }

    manager.showRecordingBar(command)

    expect(recordingBarWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    expect(recordingBarWindow.showInactive).toHaveBeenCalledOnce()
    expect(once).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
    const didFinishLoadHandler = once.mock.calls[0]?.[1]
    expect(didFinishLoadHandler).toBeTypeOf('function')

    if (typeof didFinishLoadHandler !== 'function') {
      throw new Error('expected did-finish-load handler to be registered')
    }

    didFinishLoadHandler()
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.recording.command, command)
  })
})
