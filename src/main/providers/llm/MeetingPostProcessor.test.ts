import { describe, expect, it, vi } from 'vitest'

import type { MeetingTranscriptSegment } from '../../meetings/types'
import {
  buildMeetingPostProcessPromptParts,
  createMeetingPostProcessor,
  type MeetingLlmAdapter
} from './MeetingPostProcessor'

function segment(
  input: Pick<MeetingTranscriptSegment, 'streamId' | 'speaker' | 'text' | 'beginMs' | 'endMs'>
): MeetingTranscriptSegment {
  return {
    id: `${input.streamId}-${input.beginMs}-${input.endMs}`,
    final: true,
    createdAt: input.beginMs,
    ...input
  }
}

describe('buildMeetingPostProcessPromptParts', () => {
  it('builds a prompt from ordered You and Others transcript segments', () => {
    const prompt = buildMeetingPostProcessPromptParts({
      startedAt: 1_000,
      endedAt: 61_000,
      segments: [
        segment({
          streamId: 'system',
          speaker: 'others',
          beginMs: 5_000,
          endMs: 8_000,
          text: 'The launch metric looks healthy.'
        }),
        segment({
          streamId: 'microphone',
          speaker: 'you',
          beginMs: 1_000,
          endMs: 3_000,
          text: 'Can we ship the meeting capture beta?'
        })
      ]
    })

    expect(prompt.prompt).toContain('[00:01.000 - 00:03.000] You: Can we ship')
    expect(prompt.prompt).toContain('[00:05.000 - 00:08.000] Others: The launch metric')
    expect(prompt.prompt.indexOf('You:')).toBeLessThan(prompt.prompt.indexOf('Others:'))
  })

  it('asks the LLM to preserve speaker labels and not invent identities for Others', () => {
    const prompt = buildMeetingPostProcessPromptParts({
      startedAt: 1_000,
      endedAt: 2_000,
      segments: [
        segment({
          streamId: 'system',
          speaker: 'others',
          beginMs: 1_000,
          endMs: 2_000,
          text: 'I can review it.'
        })
      ]
    })

    expect(prompt.system).toContain('Preserve the speaker labels exactly as "You" and "Others"')
    expect(prompt.system).toContain('Do not invent names, roles, or individual identities')
    expect(prompt.system).toContain('Return only valid JSON')
  })
})

describe('createMeetingPostProcessor', () => {
  it('returns a short title, summary, and polished transcript from provider JSON', async () => {
    const adapter: MeetingLlmAdapter = {
      generate: vi.fn(async () => ({
        text: JSON.stringify({
          title: 'Beta launch review',
          summary: 'The team agreed the beta launch metrics look healthy.',
          polishedTranscript: '[00:01.000] You: Can we ship?\n[00:05.000] Others: Yes.'
        })
      }))
    }
    const processor = createMeetingPostProcessor({ adapter, model: 'qwen3-max' })

    const result = await processor.process({
      startedAt: 1_000,
      endedAt: 61_000,
      segments: [
        segment({
          streamId: 'microphone',
          speaker: 'you',
          beginMs: 1_000,
          endMs: 3_000,
          text: 'Can we ship?'
        })
      ]
    })

    expect(result).toEqual({
      title: 'Beta launch review',
      summary: 'The team agreed the beta launch metrics look healthy.',
      polishedTranscript: '[00:01.000] You: Can we ship?\n[00:05.000] Others: Yes.'
    })
  })

  it('uses the currently selected provider model when available', async () => {
    const adapter: MeetingLlmAdapter = {
      generate: vi.fn(async () => ({
        text: JSON.stringify({
          title: 'Standup',
          summary: 'Short sync.',
          polishedTranscript: 'You: Short sync.'
        })
      }))
    }
    const resolveModel = vi.fn(() => 'gpt-5-mini')
    const processor = createMeetingPostProcessor({ adapter, model: resolveModel })

    await processor.process({
      startedAt: 1_000,
      endedAt: 2_000,
      segments: [
        segment({
          streamId: 'microphone',
          speaker: 'you',
          beginMs: 1_000,
          endMs: 2_000,
          text: 'Quick update.'
        })
      ]
    })

    expect(resolveModel).toHaveBeenCalledOnce()
    expect(adapter.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5-mini'
      })
    )
  })

  it('lets provider failures reject so callers can mark llmProcessing as failed', async () => {
    const adapter: MeetingLlmAdapter = {
      generate: vi.fn(async () => {
        throw new Error('provider unavailable')
      })
    }
    const processor = createMeetingPostProcessor({ adapter, model: 'qwen3.5-flash' })

    await expect(
      processor.process({
        startedAt: 1_000,
        endedAt: 2_000,
        segments: [
          segment({
            streamId: 'system',
            speaker: 'others',
            beginMs: 1_000,
            endMs: 2_000,
            text: 'Status is blocked.'
          })
        ]
      })
    ).rejects.toThrow('provider unavailable')
  })
})
