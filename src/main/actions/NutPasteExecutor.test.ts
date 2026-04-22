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

  it('clears the clipboard after paste when clear is unavailable', async () => {
    const clipboard = {
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

    expect(clipboard.setContent).toHaveBeenNthCalledWith(1, 'hello')
    expect(clipboard.setContent).toHaveBeenNthCalledWith(2, '')
  })

  it('prefers clearing the clipboard after paste when supported', async () => {
    const clipboard = {
      clear: vi.fn().mockResolvedValue(undefined),
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

    expect(clipboard.setContent).toHaveBeenCalledOnce()
    expect(clipboard.clear).toHaveBeenCalledOnce()
  })
})
