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
      postProcessPreset: {
        id: 'casual',
        name: 'Casual',
        builtIn: true,
        enablePostProcessing: true,
        systemPrompt:
          'Prefer a conversational, relaxed tone with lighter punctuation and natural shorthand when it fits, while preserving the speaker intent, wording, and meaning.'
      },
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
    const systemMessage = payload.messages[0].content as string
    const userMessage = payload.messages[1].content as string

    expect(payload.model).toBe('qwen3.5-flash')
    expect(systemMessage).toContain('Preset prompt:')
    expect(systemMessage).toContain('Prefer a conversational, relaxed tone')
    expect(userMessage).toContain('Remaining context:')
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

  it('uses the configured DashScope llm model when provided', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'cleaned sentence' } }]
      })
    })

    const provider = createQwenCleanupProvider({
      apiKey: 'test-key',
      model: () => 'qwen3-max',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      fetcher: fetcher as unknown as typeof fetch
    })

    await provider.transform({
      transcriptText: 'raw text',
      selectedText: null
    })

    const [, request] = fetcher.mock.calls[0] ?? []
    const payload = JSON.parse((request as { body: string }).body)
    expect(payload.model).toBe('qwen3-max')
  })
})
