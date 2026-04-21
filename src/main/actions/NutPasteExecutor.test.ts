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

  it('restores the previous clipboard content after paste when available', async () => {
    const clipboard = {
      getContent: vi.fn().mockResolvedValue('existing clipboard'),
      setContent: vi.fn().mockResolvedValue(undefined)
    }
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

    expect(clipboard.getContent).toHaveBeenCalledOnce()
    expect(clipboard.setContent).toHaveBeenNthCalledWith(1, 'hello')
    expect(clipboard.setContent).toHaveBeenNthCalledWith(2, 'existing clipboard')
  })
})
