import { describe, expect, it, vi } from 'vitest'

import { createGlobalHotkeyService, triggerKeyCodes } from './globalHotkeyService'

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
      triggerKey: 'AltRight',
      hook,
      onStart,
      onStop
    })

    await service.handleKeyDown({ keycode: triggerKeyCodes.AltRight })
    await service.handleKeyDown({ keycode: triggerKeyCodes.AltRight })
    await service.handleKeyUp({ keycode: triggerKeyCodes.AltRight })

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStop).toHaveBeenCalledTimes(1)
  })
})
