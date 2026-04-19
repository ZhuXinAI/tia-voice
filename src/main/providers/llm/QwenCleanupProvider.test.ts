import { describe, expect, it, vi } from 'vitest'

import { createQwenCleanupProvider } from './QwenCleanupProvider'

describe('createQwenCleanupProvider', () => {
  it('sends transcript and selected text for intent-aware transform', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Next week, my long-awaited moment finally arrives.' } }]
      })
    })

    const provider = createQwenCleanupProvider({
      apiKey: 'test-key',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      fetcher: fetcher as unknown as typeof fetch
    })

    const result = await provider.transform({
      transcriptText: 'Change this sentence to a more emotional one',
      selectedText: 'Next week my time is coming'
    })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.text).toBe('Next week, my long-awaited moment finally arrives.')
    const [, request] = fetcher.mock.calls[0] ?? []
    const payload = JSON.parse((request as { body: string }).body)
    const userMessage = payload.messages[1].content as string

    expect(payload.model).toBe('qwen-plus')
    expect(userMessage).toContain('"selectedText": "Next week my time is coming"')
  })

  it('supports async api key resolution', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'cleaned sentence' } }]
      })
    })
    const resolveApiKey = vi.fn(async () => 'ephemeral-token')

    const provider = createQwenCleanupProvider({
      apiKey: resolveApiKey,
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      fetcher: fetcher as unknown as typeof fetch
    })

    await provider.transform({
      transcriptText: 'raw text',
      selectedText: null
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
