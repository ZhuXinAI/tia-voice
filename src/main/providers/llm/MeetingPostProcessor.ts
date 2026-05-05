import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

import type { MeetingTranscriptSegment } from '../../meetings/types'

export type MeetingPostProcessInput = {
  segments: MeetingTranscriptSegment[]
  startedAt: number
  endedAt: number
}

export type MeetingPostProcessResult = {
  title: string
  summary: string
  polishedTranscript: string
}

export interface MeetingPostProcessor {
  process(input: MeetingPostProcessInput): Promise<MeetingPostProcessResult>
}

export type MeetingLlmRequest = {
  model?: string
  system: string
  prompt: string
}

export type MeetingLlmAdapter = {
  generate(input: MeetingLlmRequest): Promise<{ text: string }>
}

type FetchLike = typeof fetch
type ApiKeyResolver = string | (() => string | Promise<string>)
type ModelResolver = string | (() => string | Promise<string>)

type MeetingPostProcessorDependencies = {
  adapter: MeetingLlmAdapter
  model?: ModelResolver
}

type MeetingPromptParts = {
  system: string
  prompt: string
}

type QwenMessageContent = string | Array<{ type?: string; text?: string }>

type QwenResponse = {
  choices?: Array<{
    message?: {
      content?: QwenMessageContent
    }
  }>
}

async function resolveApiKey(input: ApiKeyResolver, label: string): Promise<string> {
  const value = typeof input === 'function' ? await input() : input
  if (!value) {
    throw new Error(`${label} API key is unavailable.`)
  }

  return value
}

function extractQwenText(content: QwenMessageContent | undefined): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  return (
    content
      ?.map((item) => item.text?.trim())
      .filter(Boolean)
      .join('\n') ?? ''
  )
}

function formatTimecode(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms))
  const minutes = Math.floor(safeMs / 60_000)
  const seconds = Math.floor((safeMs % 60_000) / 1_000)
  const milliseconds = safeMs % 1_000

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    milliseconds
  ).padStart(3, '0')}`
}

function getSpeakerLabel(segment: MeetingTranscriptSegment): 'You' | 'Others' {
  return segment.speaker === 'you' ? 'You' : 'Others'
}

function sortSegments(segments: MeetingTranscriptSegment[]): MeetingTranscriptSegment[] {
  return [...segments].sort((a, b) => {
    if (a.beginMs !== b.beginMs) {
      return a.beginMs - b.beginMs
    }

    if (a.streamId === b.streamId) {
      return a.endMs - b.endMs
    }

    return a.streamId === 'microphone' ? -1 : 1
  })
}

function buildTranscriptLines(segments: MeetingTranscriptSegment[]): string {
  const lines = sortSegments(segments)
    .filter((segment) => segment.final && segment.text.trim() !== '')
    .map((segment) => {
      const start = formatTimecode(segment.beginMs)
      const end = formatTimecode(segment.endMs)
      return `[${start} - ${end}] ${getSpeakerLabel(segment)}: ${segment.text.trim()}`
    })

  return lines.length > 0 ? lines.join('\n') : '(No final transcript segments were captured.)'
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced?.[1]?.trim() ?? trimmed
}

function parseResult(text: string): MeetingPostProcessResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(stripJsonFence(text))
  } catch {
    throw new Error('Meeting post-processing response was not valid JSON.')
  }

  const record = parsed as Partial<MeetingPostProcessResult> | undefined
  const title = normalizeString(record?.title)
  const summary = normalizeString(record?.summary)
  const polishedTranscript = normalizeString(record?.polishedTranscript)

  if (!title || !summary || !polishedTranscript) {
    throw new Error('Meeting post-processing response was missing required fields.')
  }

  return {
    title,
    summary,
    polishedTranscript
  }
}

async function resolveModel(input: ModelResolver | undefined): Promise<string | undefined> {
  const value = typeof input === 'function' ? await input() : input
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function buildMeetingPostProcessPromptParts(
  input: MeetingPostProcessInput
): MeetingPromptParts {
  return {
    system: [
      'You are TIA Voice, a meeting post-processing assistant.',
      'Create a concise meeting title, a useful summary, and a polished transcript from the raw transcript.',
      'The transcript has only two speaker labels: "You" for the local microphone and "Others" for system audio.',
      'Preserve the speaker labels exactly as "You" and "Others" in the polished transcript.',
      'Do not invent names, roles, or individual identities for "Others".',
      'Include decisions and action items in the summary when they are present. Do not fabricate them.',
      'Keep the title short, ideally 6 words or fewer.',
      'Return only valid JSON with this exact shape:',
      '{"title":"string","summary":"string","polishedTranscript":"string"}'
    ].join('\n'),
    prompt: JSON.stringify(
      {
        meeting: {
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          durationMs: Math.max(0, input.endedAt - input.startedAt)
        },
        transcript: buildTranscriptLines(input.segments)
      },
      null,
      2
    )
  }
}

export function createMeetingPostProcessor(
  dependencies: MeetingPostProcessorDependencies
): MeetingPostProcessor {
  return {
    async process(input) {
      const prompt = buildMeetingPostProcessPromptParts(input)
      const result = await dependencies.adapter.generate({
        model: await resolveModel(dependencies.model),
        system: prompt.system,
        prompt: prompt.prompt
      })

      return parseResult(result.text)
    }
  }
}

export function createQwenMeetingLlmAdapter(input: {
  apiKey: ApiKeyResolver
  baseUrl: string
  fetcher?: FetchLike
}): MeetingLlmAdapter {
  const fetcher = input.fetcher ?? fetch

  return {
    async generate(request) {
      const apiKey = await resolveApiKey(input.apiKey, 'DashScope')
      const response = await fetcher(`${input.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: request.model ?? 'qwen3.5-flash',
          messages: [
            {
              role: 'system',
              content: request.system
            },
            {
              role: 'user',
              content: request.prompt
            }
          ],
          response_format: { type: 'json_object' }
        })
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(
          `Meeting post-processing request failed with status ${response.status}${
            detail ? `: ${detail.slice(0, 300)}` : ''
          }`
        )
      }

      const json = (await response.json()) as QwenResponse
      const text = extractQwenText(json.choices?.[0]?.message?.content)
      if (!text) {
        throw new Error('Meeting post-processing response did not contain text.')
      }

      return { text }
    }
  }
}

export function createOpenAiMeetingLlmAdapter(input: {
  apiKey: ApiKeyResolver
  fetcher?: FetchLike
}): MeetingLlmAdapter {
  return {
    async generate(request) {
      const apiKey = await resolveApiKey(input.apiKey, 'OpenAI')
      const provider = createOpenAI({
        apiKey,
        fetch: input.fetcher
      })
      const result = await generateText({
        model: provider(request.model ?? 'gpt-5-mini'),
        system: request.system,
        prompt: request.prompt
      })

      if (!result.text.trim()) {
        throw new Error('Meeting post-processing response did not contain text.')
      }

      return { text: result.text.trim() }
    }
  }
}
