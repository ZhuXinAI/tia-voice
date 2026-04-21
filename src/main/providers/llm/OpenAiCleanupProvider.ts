import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

import type { LlmProvider, LlmTransformInput } from './LlmProvider'
import {
  buildPostProcessPromptParts,
  DEFAULT_POST_PROCESS_PRESETS,
  normalizePostProcessPreset,
  type PostProcessPresetRecord
} from './postProcessPrompts'

type FetchLike = typeof fetch
type ApiKeyResolver = string | (() => string | Promise<string>)
type PostProcessPresetResolver =
  | PostProcessPresetRecord
  | (() => PostProcessPresetRecord | Promise<PostProcessPresetRecord>)

const OPENAI_CLEANUP_MODEL = 'gpt-5-mini'

async function resolveApiKey(input: ApiKeyResolver): Promise<string> {
  const value = typeof input === 'function' ? await input() : input
  if (!value) {
    throw new Error('OpenAI API key is unavailable.')
  }

  return value
}

async function resolvePostProcessPreset(input: PostProcessPresetResolver | undefined) {
  const value = typeof input === 'function' ? await input() : input
  return normalizePostProcessPreset(value, DEFAULT_POST_PROCESS_PRESETS[0])
}

export function createOpenAiCleanupProvider(input: {
  apiKey: ApiKeyResolver
  postProcessPreset?: PostProcessPresetResolver
  fetcher?: FetchLike
}): LlmProvider {
  return {
    async transform(request: LlmTransformInput) {
      const apiKey = await resolveApiKey(input.apiKey)
      const postProcessPreset = await resolvePostProcessPreset(input.postProcessPreset)
      const prompt = buildPostProcessPromptParts({
        request,
        preset: postProcessPreset
      })
      const provider = createOpenAI({
        apiKey,
        fetch: input.fetcher
      })
      const result = await generateText({
        model: provider(OPENAI_CLEANUP_MODEL),
        system: prompt.system,
        prompt: prompt.prompt
      })

      if (!result.text.trim()) {
        throw new Error('OpenAI transform response did not contain text')
      }

      return { text: result.text.trim() }
    }
  }
}
