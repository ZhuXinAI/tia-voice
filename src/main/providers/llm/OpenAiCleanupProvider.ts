import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

import type { LlmProvider, LlmTransformInput } from './LlmProvider'
import type { QuestionAnswerInput, QuestionAnswerProvider } from './QuestionAnswerProvider'
import { buildQuestionAnswerPromptParts } from './QuestionAnswerProvider'
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

async function resolveApiKey(input: ApiKeyResolver): Promise<string> {
  const value = typeof input === 'function' ? await input() : input
  if (!value) {
    throw new Error('OpenAI API key is unavailable.')
  }

  return value
}

async function resolveModel(input: ModelResolver | undefined): Promise<string> {
  const value = typeof input === 'function' ? await input() : input
  return typeof value === 'string' && value.trim() !== '' ? value : 'gpt-5-mini'
}

async function resolvePostProcessPreset(input: PostProcessPresetResolver | undefined) {
  const value = typeof input === 'function' ? await input() : input
  return normalizePostProcessPreset(value, DEFAULT_POST_PROCESS_PRESETS[0])
}

export function createOpenAiCleanupProvider(input: {
  apiKey: ApiKeyResolver
  model?: ModelResolver
  postProcessPreset?: PostProcessPresetResolver
  fetcher?: FetchLike
}): LlmProvider {
  return {
    async transform(request: LlmTransformInput) {
      const apiKey = await resolveApiKey(input.apiKey)
      const model = await resolveModel(input.model)
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
        model: provider(model),
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

export function createOpenAiQuestionAnswerProvider(input: {
  apiKey: ApiKeyResolver
  model?: ModelResolver
  fetcher?: FetchLike
}): QuestionAnswerProvider {
  return {
    async answer(request: QuestionAnswerInput) {
      const apiKey = await resolveApiKey(input.apiKey)
      const model = await resolveModel(input.model)
      const prompt = buildQuestionAnswerPromptParts(request)
      const provider = createOpenAI({
        apiKey,
        fetch: input.fetcher
      })
      const result = await generateText({
        model: provider(model),
        system: prompt.system,
        prompt: prompt.prompt
      })

      if (!result.text.trim()) {
        throw new Error('OpenAI Q&A response did not contain text')
      }

      return { text: result.text.trim() }
    }
  }
}
