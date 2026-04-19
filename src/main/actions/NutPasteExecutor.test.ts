import { describe, expect, it, vi } from 'vitest'

import { createNutPasteExecutor } from './NutPasteExecutor'

describe('createNutPasteExecutor', () => {
  it('uses the clipboard and keyboard combo for paste', async () => {
    const clipboard = { setContent: vi.fn().mockResolvedValue(undefined) }
    const keyboard = {
      pressKey: vi.fn().mockResolvedValue(undefined),
      releaseKey: vi.fn().mockResolvedValue(undefined)
    }

    const executor = createNutPasteExecutor({
      platform: 'darwin',
      clipboard,
      keyboard: keyboard as never
    })

    await executor.execute({ kind: 'paste-text', text: 'hello' })

    expect(clipboard.setContent).toHaveBeenCalledWith('hello')
    expect(keyboard.pressKey).toHaveBeenCalledOnce()
    expect(keyboard.releaseKey).toHaveBeenCalledOnce()
  })
})
