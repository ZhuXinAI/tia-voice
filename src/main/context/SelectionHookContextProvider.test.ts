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
}): MockHook {
  let running = false

  const startResult = input?.startResult ?? true
  const selectionText = input?.selectionText ?? null
  const trusted = input?.trusted ?? true
  const selectionData: TextSelectionData | null = selectionText
    ? {
        text: selectionText,
        programName: 'Notes',
        startTop: { x: 0, y: 0 },
        startBottom: { x: 0, y: 1 },
        endTop: { x: 1, y: 0 },
        endBottom: { x: 1, y: 1 },
        mousePosStart: { x: 0, y: 0 },
        mousePosEnd: { x: 1, y: 1 },
        method: 1,
        posLevel: 3
      }
    : null

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
    isRunning: vi.fn(() => running),
    getCurrentSelection: vi.fn(() => selectionData),
    macIsProcessTrusted: vi.fn(() => trusted),
    macRequestProcessTrust: vi.fn(() => trusted)
  } as MockHook
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
    expect(snapshot).toEqual({
      isInputFocused: true,
      selectedText: 'Next week my time is coming',
      provider: 'selection-hook',
      capturedAt: 123
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

  it('stops and cleans up native hook on provider cleanup', () => {
    const hook = createMockHook()
    const provider = createSelectionHookContextProvider({
      createHook: () => hook
    })

    provider.cleanup?.()

    expect(hook.stop).toHaveBeenCalledOnce()
    expect(hook.cleanup).toHaveBeenCalledOnce()
  })
})
