import type { LlmProvider, LlmTransformInput } from './LlmProvider'
import {
  buildPostProcessPromptParts,
  DEFAULT_POST_PROCESS_PRESETS,
  normalizePostProcessPreset,
  type PostProcessPresetRecord
} from './postProcessPrompts'

type FetchLike = typeof fetch
type ApiKeyResolver = string | (() => string | Promise<string>)
type ModelResolver = string | (() => string | Promise<string>)
type PostProcessPresetResolver =
  | PostProcessPresetRecord
  | (() => PostProcessPresetRecord | Promise<PostProcessPresetRecord>)

type QwenMessageContent = string | Array<{ type?: string; text?: string }>

type QwenResponse = {
  choices?: Array<{
    message?: {
      content?: QwenMessageContent
    }
  }>
}

function extractText(content: QwenMessageContent | undefined): string {
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

async function resolveApiKey(input: ApiKeyResolver): Promise<string> {
  const value = typeof input === 'function' ? await input() : input
  if (!value) {
    throw new Error('DashScope API key is unavailable.')
  }

  return value
}

async function resolveModel(input: ModelResolver | undefined): Promise<string> {
  const value = typeof input === 'function' ? await input() : input
  return typeof value === 'string' && value.trim() !== '' ? value : 'qwen3.5-flash'
}

async function resolvePostProcessPreset(input: PostProcessPresetResolver | undefined) {
  const value = typeof input === 'function' ? await input() : input
  return normalizePostProcessPreset(value, DEFAULT_POST_PROCESS_PRESETS[0])
}

export function createQwenCleanupProvider(input: {
  apiKey: ApiKeyResolver
  baseUrl: string
  model?: ModelResolver
  postProcessPreset?: PostProcessPresetResolver
  fetcher?: FetchLike
}): LlmProvider {
  const fetcher = input.fetcher ?? fetch

  return {
    async transform(request: LlmTransformInput) {
      const apiKey = await resolveApiKey(input.apiKey)
      const model = await resolveModel(input.model)
      const postProcessPreset = await resolvePostProcessPreset(input.postProcessPreset)
      const prompt = buildPostProcessPromptParts({
        request,
        preset: postProcessPreset
      })
      const response = await fetcher(`${input.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: prompt.system
            },
            {
              role: 'user',
              content: prompt.prompt
            }
          ]
        })
      })

      if (!response.ok) {
        throw new Error(`LLM transform request failed with status ${response.status}`)
      }

      const json = (await response.json()) as QwenResponse
      const text = extractText(json.choices?.[0]?.message?.content)

      if (!text) {
        throw new Error('LLM transform response did not contain text')
      }

      return { text }
    }
  }
}
