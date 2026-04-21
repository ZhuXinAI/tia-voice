import { experimental_transcribe as transcribe } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

import type { RecordingArtifact } from '../../recording/types'
import type { AsrProvider } from './AsrProvider'

type FetchLike = typeof fetch
type ApiKeyResolver = string | (() => string | Promise<string>)

const OPENAI_ASR_MODEL = 'gpt-4o-mini-transcribe'

async function resolveApiKey(input: ApiKeyResolver): Promise<string> {
  const value = typeof input === 'function' ? await input() : input
  if (!value) {
    throw new Error('OpenAI API key is unavailable.')
  }

  return value
}

export function createOpenAiAsrProvider(input: {
  apiKey: ApiKeyResolver
  fetcher?: FetchLike
}): AsrProvider {
  return {
    async transcribe(artifact: RecordingArtifact) {
      const apiKey = await resolveApiKey(input.apiKey)
      const provider = createOpenAI({
        apiKey,
        fetch: input.fetcher
      })

      const result = await transcribe({
        model: provider.transcription(OPENAI_ASR_MODEL),
        audio: artifact.buffer
      })

      return {
        text: result.text,
        language: result.language
      }
    }
  }
}
