import { describe, expect, it, vi } from 'vitest'
import type { TextSelectionData } from 'selection-hook'

import { createSelectionHookContextProvider } from './SelectionHookContextProvider'

type CreateHook = NonNullable<
  NonNullable<Parameters<typeof createSelectionHookContextProvider>[0]>['createHook']
>
type MockHook = ReturnType<CreateHook>

function createMockHook(input?: {
  startResult?: boolean
  selectionText?: string | null
  trusted?: boolean
  programName?: string
  selectionData?: TextSelectionData | null
}): MockHook {
  let running = false
  const eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>()

  const startResult = input?.startResult ?? true
  const selectionText = input?.selectionText ?? null
  const trusted = input?.trusted ?? true
  const selectionData: TextSelectionData | null =
    input?.selectionData ??
    (selectionText
      ? {
          text: selectionText,
          programName: input?.programName ?? 'Google Chrome',
          startTop: { x: 0, y: 0 },
          startBottom: { x: 0, y: 1 },
          endTop: { x: 1, y: 0 },
          endBottom: { x: 1, y: 1 },
          mousePosStart: { x: 0, y: 0 },
          mousePosEnd: { x: 1, y: 1 },
          method: 1,
          posLevel: 3
        }
      : null)

  return {
    start: vi.fn(() => {
      running = startResult
      return startResult
    }),
    stop: vi.fn(() => {
      running = false
      return true
    }),
    cleanup: vi.fn(),
    setSelectionPassiveMode: vi.fn(() => true),
    setGlobalFilterMode: vi.fn(() => true),
    isRunning: vi.fn(() => running),
    getCurrentSelection: vi.fn(() => selectionData),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const handlers = eventHandlers.get(event) ?? new Set()
      handlers.add(handler)
      eventHandlers.set(event, handlers)
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers.get(event)?.delete(handler)
    }),
    macIsProcessTrusted: vi.fn(() => trusted),
    macRequestProcessTrust: vi.fn(() => trusted),
    emit: (event: string, payload?: unknown) => {
      for (const handler of eventHandlers.get(event) ?? []) {
        handler(payload)
      }
    }
  } as unknown as MockHook
}

describe('createSelectionHookContextProvider', () => {
  it('starts selection-hook in passive mode and returns selected text', async () => {
    const hook = createMockHook({ selectionText: '  Next week my time is coming  ' })
    const provider = createSelectionHookContextProvider({
      platform: 'darwin',
      createHook: () => hook,
      now: () => 123
    })

    const snapshot = await provider.captureSnapshot()

    expect(hook.start).toHaveBeenCalledWith({
      selectionPassiveMode: true,
      enableMouseMoveEvent: false
    })
    expect(hook.setSelectionPassiveMode).toHaveBeenCalledWith(true)
    expect(hook.setGlobalFilterMode).not.toHaveBeenCalled()
    expect(snapshot).toEqual({
      isInputFocused: true,
      selectedText: 'Next week my time is coming',
      provider: 'selection-hook',
      capturedAt: 123
    })
  })

  it('captures the current selection with bounds on demand', async () => {
    const hook = createMockHook({ selectionText: '  Shortcut selected text  ' })
    const provider = createSelectionHookContextProvider({
      platform: 'darwin',
      createHook: () => hook,
      now: () => 654
    })

    const selection = await provider.captureSelection?.()

    expect(selection).toEqual({
      text: 'Shortcut selected text',
      sourceApp: 'Google Chrome',
      bounds: {
        x: 0,
        y: 0,
        width: 1,
        height: 1
      },
      capturedAt: 654
    })
    expect(hook.start).toHaveBeenCalledWith({
      selectionPassiveMode: true,
      enableMouseMoveEvent: false
    })
  })

  it('captures non-Chrome selected text on demand with fallback bounds', async () => {
    const hook = createMockHook({
      selectionData: {
        text: 'latestContextSelection',
        programName: 'com.todesktop.230313mzl4w4u92',
        startTop: { x: 0, y: 0 },
        startBottom: { x: 0, y: 0 },
        endTop: { x: 0, y: 0 },
        endBottom: { x: 0, y: 0 },
        mousePosStart: { x: 0, y: 0 },
        mousePosEnd: { x: 0, y: 0 },
        method: 99,
        posLevel: 0
      }
    })
    const provider = createSelectionHookContextProvider({
      platform: 'darwin',
      createHook: () => hook,
      now: () => 777
    })

    const selection = await provider.captureSelection?.({
      allowAnySource: true,
      fallbackBounds: {
        x: 320,
        y: 240,
        width: 1,
        height: 1
      }
    })

    expect(selection).toEqual({
      text: 'latestContextSelection',
      sourceApp: 'com.todesktop.230313mzl4w4u92',
      bounds: {
        x: 320,
        y: 240,
        width: 1,
        height: 1
      },
      capturedAt: 777
    })
  })

  it('requests macOS trust check before start when not trusted', async () => {
    const hook = createMockHook({ trusted: false })
    const provider = createSelectionHookContextProvider({
      platform: 'darwin',
      createHook: () => hook
    })

    await provider.captureSnapshot()

    expect(hook.macIsProcessTrusted).toHaveBeenCalledOnce()
    expect(hook.macRequestProcessTrust).toHaveBeenCalledOnce()
  })

  it('returns null selection when hook cannot start', async () => {
    const hook = createMockHook({ startResult: false, selectionText: 'ignored' })
    const provider = createSelectionHookContextProvider({
      platform: 'win32',
      createHook: () => hook,
      now: () => 456
    })

    const snapshot = await provider.captureSnapshot()

    expect(snapshot).toEqual({
      isInputFocused: null,
      selectedText: null,
      provider: 'selection-hook',
      capturedAt: 456
    })
    expect(hook.getCurrentSelection).not.toHaveBeenCalled()
  })

  it('ignores selected text outside the Chrome whitelist', async () => {
    const hook = createMockHook({ selectionText: 'Outside Chrome', programName: 'Notes' })
    const provider = createSelectionHookContextProvider({
      createHook: () => hook,
      now: () => 321
    })

    const snapshot = await provider.captureSnapshot()

    expect(snapshot).toEqual({
      isInputFocused: null,
      selectedText: null,
      provider: 'selection-hook',
      capturedAt: 321
    })
  })

  it('stops and cleans up native hook on provider cleanup', () => {
    const hook = createMockHook()
    const provider = createSelectionHookContextProvider({
      createHook: () => hook
    })

    provider.cleanup?.()

    expect(hook.stop).toHaveBeenCalledOnce()
    expect(hook.cleanup).toHaveBeenCalledOnce()
  })

  it('subscribes to live selection events', () => {
    const hook = createMockHook({ selectionText: 'Selected now' })
    const provider = createSelectionHookContextProvider({
      createHook: () => hook
    })

    const listener = vi.fn()
    const unsubscribe = provider.subscribeToSelection?.(listener)

    expect(hook.on).toHaveBeenCalledWith('text-selection', expect.any(Function))
    expect(hook.on).toHaveBeenCalledWith('mouse-up', expect.any(Function))
    expect(hook.on).toHaveBeenCalledWith('key-up', expect.any(Function))

    unsubscribe?.()

    expect(hook.removeListener).toHaveBeenCalledWith('text-selection', expect.any(Function))
    expect(hook.removeListener).toHaveBeenCalledWith('mouse-up', expect.any(Function))
    expect(hook.removeListener).toHaveBeenCalledWith('key-up', expect.any(Function))
  })

  it('emits normalized selections to listeners from text-selection events', () => {
    const hook = createMockHook({ selectionText: '  Selected now  ' }) as MockHook & {
      emit: (event: string, payload?: unknown) => void
    }
    const provider = createSelectionHookContextProvider({
      createHook: () => hook,
      now: () => 789
    })
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const listener = vi.fn()

    provider.subscribeToSelection?.(listener)
    hook.emit('text-selection', {
      text: '  Selected now  ',
      programName: 'Google Chrome',
      startTop: { x: 10, y: 20 },
      startBottom: { x: 10, y: 40 },
      endTop: { x: 90, y: 20 },
      endBottom: { x: 90, y: 40 },
      mousePosStart: { x: 10, y: 20 },
      mousePosEnd: { x: 90, y: 40 },
      method: 1,
      posLevel: 3
    } satisfies TextSelectionData)

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[selection] Received live selection event')
    )
    expect(listener).toHaveBeenCalledWith({
      text: 'Selected now',
      sourceApp: 'Google Chrome',
      bounds: {
        x: 10,
        y: 20,
        width: 80,
        height: 20
      },
      capturedAt: 789
    })

    consoleSpy.mockRestore()
  })

  it('uses mouse coordinates when Chrome does not provide full selection bounds', () => {
    const hook = createMockHook({ selectionText: null }) as MockHook & {
      emit: (event: string, payload?: unknown) => void
    }
    const provider = createSelectionHookContextProvider({
      createHook: () => hook,
      now: () => 987
    })
    const listener = vi.fn()

    provider.subscribeToSelection?.(listener)
    hook.emit('text-selection', {
      text: 'Chrome selected text',
      programName: 'Google Chrome',
      startTop: { x: -99999, y: -99999 },
      startBottom: { x: -99999, y: -99999 },
      endTop: { x: -99999, y: -99999 },
      endBottom: { x: -99999, y: -99999 },
      mousePosStart: { x: 40, y: 80 },
      mousePosEnd: { x: 160, y: 120 },
      method: 1,
      posLevel: 2
    } satisfies TextSelectionData)

    expect(listener).toHaveBeenCalledWith({
      text: 'Chrome selected text',
      sourceApp: 'Google Chrome',
      bounds: {
        x: 40,
        y: 80,
        width: 120,
        height: 40
      },
      capturedAt: 987
    })
  })
})
