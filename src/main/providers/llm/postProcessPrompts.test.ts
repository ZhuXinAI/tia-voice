import { describe, expect, it } from 'vitest'

import {
  buildPostProcessPromptParts,
  normalizePostProcessPreset,
  normalizePostProcessPresetCollection
} from './postProcessPrompts'

describe('postProcessPrompts', () => {
  it('builds a base prompt plus preset prompt and remaining context', () => {
    const prompt = buildPostProcessPromptParts({
      preset: {
        id: 'casual',
        name: 'Casual',
        builtIn: true,
        enablePostProcessing: true,
        systemPrompt:
          'Prefer a conversational, relaxed tone with lighter punctuation and natural shorthand when it fits, while preserving the speaker intent, wording, and meaning.'
      },
      request: {
        transcriptText: 'make this feel more relaxed',
        selectedText: 'Hello there, how are you doing today?'
      }
    })

    expect(prompt.system).toContain('You are a voice-driven text assistant.')
    expect(prompt.system).toContain('Preset prompt:')
    expect(prompt.system).toContain('Prefer a conversational, relaxed tone')
    expect(prompt.prompt).toContain('Remaining context:')
    expect(prompt.prompt).toContain('"instructionTranscript": "make this feel more relaxed"')
    expect(prompt.prompt).toContain('"selectedText": "Hello there, how are you doing today?"')
  })

  it('falls back to the formal preset for unknown values', () => {
    expect(normalizePostProcessPreset('something-else', {
      id: 'formal',
      name: 'Formal',
      builtIn: true,
      enablePostProcessing: true,
      systemPrompt: 'Formal prompt'
    }).id).toBe('formal')
  })

  it('falls back to built-ins when the preset collection is missing', () => {
    expect(normalizePostProcessPresetCollection(undefined).map((preset) => preset.id)).toEqual([
      'formal',
      'casual'
    ])
  })

  it('defaults preset post-processing to enabled for legacy preset records', () => {
    expect(
      normalizePostProcessPreset(
        {
          id: 'legacy',
          name: 'Legacy',
          systemPrompt: 'Keep it clean.',
          builtIn: false
        },
        {
          id: 'fallback',
          name: 'Fallback',
          builtIn: false,
          enablePostProcessing: true,
          systemPrompt: 'Fallback prompt'
        }
      ).enablePostProcessing
    ).toBe(true)
  })
})
