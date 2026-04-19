import { describe, expect, it, vi } from 'vitest'

import { createQwenAsrProvider } from './QwenAsrProvider'

describe('createQwenAsrProvider', () => {
  it('posts audio as a data url and returns transcript text', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '你好世界' } }]
      })
    })

    const provider = createQwenAsrProvider({
      apiKey: 'test-key',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      fetcher: fetcher as unknown as typeof fetch
    })

    const result = await provider.transcribe({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1, 2, 3]),
      durationMs: 800
    })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.text).toBe('你好世界')
  })

  it('supports async api key resolution', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi there' } }]
      })
    })
    const resolveApiKey = vi.fn(async () => 'ephemeral-token')

    const provider = createQwenAsrProvider({
      apiKey: resolveApiKey,
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      fetcher: fetcher as unknown as typeof fetch
    })

    await provider.transcribe({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1, 2, 3]),
      durationMs: 320
    })

    expect(resolveApiKey).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ephemeral-token'
        })
      })
    )
  })
})
