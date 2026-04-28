import type { TtsTranscriptSegment } from '../../../shared/tts'

type FetchLike = typeof fetch
type ApiKeyResolver = string | (() => string | Promise<string>)

type CosyVoiceWord = {
  text?: string
  begin_index?: number
  end_index?: number
  begin_time?: number
  end_time?: number
}

type CosyVoiceSentence = {
  index?: number
  text?: string
  original_text?: string
  words?: CosyVoiceWord[]
}

type CosyVoiceResponse = {
  request_id?: string
  output?: {
    audio?: {
      url?: string
      expires_at?: number
    }
    sentence?: CosyVoiceSentence | CosyVoiceSentence[]
    sentences?: CosyVoiceSentence[]
    original_text?: string
  }
}

export type TtsProviderResult = {
  requestId: string | null
  audioUrl: string
  audioExpiresAt: number | null
  segments: TtsTranscriptSegment[]
  model: string
  voice: string
}

export type TtsProvider = {
  synthesize(input: { text: string }): Promise<TtsProviderResult>
}

const DEFAULT_MODEL = 'cosyvoice-v3-flash'
const DEFAULT_VOICE = 'longanyang'

async function resolveApiKey(input: ApiKeyResolver): Promise<string> {
  const value = typeof input === 'function' ? await input() : input
  if (!value) {
    throw new Error('DashScope API key is unavailable.')
  }

  return value
}

function normalizeSentenceList(response: CosyVoiceResponse): CosyVoiceSentence[] {
  const direct = response.output?.sentences
  if (Array.isArray(direct)) {
    return direct
  }

  const singular = response.output?.sentence
  if (Array.isArray(singular)) {
    return singular
  }

  if (singular && typeof singular === 'object') {
    return [singular]
  }

  return []
}

function normalizeTimedSegments(
  text: string,
  sentences: CosyVoiceSentence[]
): TtsTranscriptSegment[] {
  const segments: TtsTranscriptSegment[] = []

  for (const sentence of sentences) {
    const sentenceText = sentence.text ?? sentence.original_text ?? ''
    const words = Array.isArray(sentence.words) ? sentence.words : []
    if (!sentenceText || words.length === 0) {
      continue
    }

    let cursor = 0

    for (const word of words) {
      const beginIndex =
        typeof word.begin_index === 'number' && Number.isFinite(word.begin_index)
          ? word.begin_index
          : cursor
      const endIndex =
        typeof word.end_index === 'number' && Number.isFinite(word.end_index)
          ? word.end_index
          : beginIndex + (word.text?.length ?? 0)
      const startSecond =
        typeof word.begin_time === 'number' && Number.isFinite(word.begin_time)
          ? word.begin_time / 1000
          : 0
      const endSecond =
        typeof word.end_time === 'number' && Number.isFinite(word.end_time)
          ? word.end_time / 1000
          : startSecond

      if (beginIndex > cursor) {
        segments.push({
          text: sentenceText.slice(cursor, beginIndex),
          startSecond,
          endSecond
        })
      }

      segments.push({
        text: sentenceText.slice(beginIndex, Math.max(beginIndex + 1, endIndex)) || word.text || '',
        startSecond,
        endSecond
      })

      cursor = Math.max(cursor, endIndex)
    }

    if (cursor < sentenceText.length) {
      const fallbackStart = segments[segments.length - 1]?.endSecond ?? 0
      segments.push({
        text: sentenceText.slice(cursor),
        startSecond: fallbackStart,
        endSecond: fallbackStart
      })
    }
  }

  if (segments.length > 0) {
    return segments
  }

  return text
    .split(/(\s+)/)
    .filter(Boolean)
    .map((segment) => ({
      text: segment,
      startSecond: 0,
      endSecond: 0
    }))
}

export function createCosyVoiceTtsProvider(input: {
  apiKey: ApiKeyResolver
  baseUrl?: string
  fetcher?: FetchLike
  model?: string
  voice?: string
}): TtsProvider {
  const fetcher = input.fetcher ?? fetch
  const baseUrl = input.baseUrl ?? 'https://dashscope.aliyuncs.com'
  const model = input.model ?? DEFAULT_MODEL
  const voice = input.voice ?? DEFAULT_VOICE

  return {
    async synthesize(request) {
      const apiKey = await resolveApiKey(input.apiKey)
      const response = await fetcher(`${baseUrl}/api/v1/services/audio/tts/SpeechSynthesizer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          input: {
            text: request.text,
            voice,
            format: 'mp3',
            sample_rate: 24000,
            word_timestamp_enabled: true
          }
        })
      })

      if (!response.ok) {
        throw new Error(`TTS request failed with status ${response.status}`)
      }

      const json = (await response.json()) as CosyVoiceResponse
      const audioUrl = json.output?.audio?.url

      if (!audioUrl) {
        throw new Error('TTS response did not include an audio URL')
      }

      return {
        requestId: json.request_id ?? null,
        audioUrl,
        audioExpiresAt:
          typeof json.output?.audio?.expires_at === 'number' ? json.output.audio.expires_at : null,
        segments: normalizeTimedSegments(request.text, normalizeSentenceList(json)),
        model,
        voice
      }
    }
  }
}
