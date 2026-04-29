import { describe, expect, it, vi } from 'vitest'

import {
  createAppHotkeyService,
  createGlobalHotkeyService,
  keyboardKeyCodes,
  triggerKeyCodes
} from './globalHotkeyService'

describe('createGlobalHotkeyService', () => {
  it('starts once on matching keydown and stops on matching keyup', async () => {
    const onStart = vi.fn()
    const onStop = vi.fn()
    const hook = {
      on: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    }

    const service = createGlobalHotkeyService({
      triggerKey: 'ControlRight',
      hook,
      onStart,
      onStop
    })

    await service.handleKeyDown({ keycode: triggerKeyCodes.ControlRight })
    await service.handleKeyDown({ keycode: triggerKeyCodes.ControlRight })
    await service.handleKeyUp({ keycode: triggerKeyCodes.ControlRight })

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('starts and stops the Control+T question capture independently', async () => {
    const onDictationStart = vi.fn()
    const onDictationStop = vi.fn()
    const onQuestionStart = vi.fn()
    const onQuestionStop = vi.fn()
    const hook = {
      on: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    }

    const service = createAppHotkeyService({
      triggerKey: 'MetaRight',
      hook,
      onDictationStart,
      onDictationStop,
      onQuestionStart,
      onQuestionStop
    })

    await service.handleKeyDown({ keycode: keyboardKeyCodes.KeyT, ctrlKey: true })
    await service.handleKeyDown({ keycode: keyboardKeyCodes.KeyT, ctrlKey: true })
    await service.handleKeyUp({ keycode: keyboardKeyCodes.KeyT, ctrlKey: true })

    expect(onQuestionStart).toHaveBeenCalledTimes(1)
    expect(onQuestionStop).toHaveBeenCalledTimes(1)
    expect(onDictationStart).not.toHaveBeenCalled()
    expect(onDictationStop).not.toHaveBeenCalled()
  })

  it('recognizes Control+T when the native T event does not include ctrlKey', async () => {
    const onDictationStart = vi.fn()
    const onDictationStop = vi.fn()
    const onQuestionStart = vi.fn()
    const onQuestionStop = vi.fn()
    const onQuestionKeyEvent = vi.fn()
    const hook = {
      on: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    }

    const service = createAppHotkeyService({
      triggerKey: 'MetaRight',
      hook,
      onDictationStart,
      onDictationStop,
      onQuestionStart,
      onQuestionStop,
      onQuestionKeyEvent
    })

    await service.handleKeyDown({ keycode: keyboardKeyCodes.ControlLeft })
    await service.handleKeyDown({ keycode: keyboardKeyCodes.KeyT })
    await service.handleKeyUp({ keycode: keyboardKeyCodes.ControlLeft })

    expect(onQuestionStart).toHaveBeenCalledTimes(1)
    expect(onQuestionStop).toHaveBeenCalledTimes(1)
    expect(onDictationStart).not.toHaveBeenCalled()
    expect(onDictationStop).not.toHaveBeenCalled()
    expect(onQuestionKeyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        keycode: keyboardKeyCodes.KeyT,
        ctrlKey: true,
        rawCtrlKey: false,
        trackedCtrlKey: true
      })
    )
  })

  it('recognizes Control+T when macOS reports the raw virtual key code for T', async () => {
    const onDictationStart = vi.fn()
    const onDictationStop = vi.fn()
    const onQuestionStart = vi.fn()
    const onQuestionStop = vi.fn()
    const hook = {
      on: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    }

    const service = createAppHotkeyService({
      triggerKey: 'MetaRight',
      hook,
      onDictationStart,
      onDictationStop,
      onQuestionStart,
      onQuestionStop
    })

    await service.handleKeyDown({ keycode: keyboardKeyCodes.ControlLeft })
    await service.handleKeyDown({ keycode: keyboardKeyCodes.MacVirtualKeyT })
    await service.handleKeyUp({ keycode: keyboardKeyCodes.MacVirtualKeyT })

    expect(onQuestionStart).toHaveBeenCalledTimes(1)
    expect(onQuestionStop).toHaveBeenCalledTimes(1)
  })
})
