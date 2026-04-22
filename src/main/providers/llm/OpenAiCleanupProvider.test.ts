import { describe, expect, it, vi } from 'vitest'

const { generateTextMock, providerFactoryMock, createOpenAIMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  providerFactoryMock: vi.fn((model: string) => `openai:${model}`),
  createOpenAIMock: vi.fn()
}))

createOpenAIMock.mockImplementation(() => providerFactoryMock)

vi.mock('ai', () => ({
  generateText: generateTextMock
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock
}))

import { createOpenAiCleanupProvider } from './OpenAiCleanupProvider'

describe('createOpenAiCleanupProvider', () => {
  it('uses the configured OpenAI llm model when provided', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Cleaned sentence.'
    })

    const provider = createOpenAiCleanupProvider({
      apiKey: 'test-key',
      model: () => 'gpt-4.1-mini'
    })

    const result = await provider.transform({
      transcriptText: 'make this cleaner',
      selectedText: null
    })

    expect(result.text).toBe('Cleaned sentence.')
    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
      fetch: undefined
    })
    expect(providerFactoryMock).toHaveBeenCalledWith('gpt-4.1-mini')
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai:gpt-4.1-mini'
      })
    )
  })
})
