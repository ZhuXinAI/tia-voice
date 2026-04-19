import type { RecordingArtifact } from '../../recording/types'
import type { AsrProvider } from './AsrProvider'

type FetchLike = typeof fetch
type ApiKeyResolver = string | (() => string | Promise<string>)

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

export function createQwenAsrProvider(input: {
  apiKey: ApiKeyResolver
  baseUrl: string
  fetcher?: FetchLike
}): AsrProvider {
  const fetcher = input.fetcher ?? fetch

  return {
    async transcribe(artifact: RecordingArtifact) {
      const apiKey = await resolveApiKey(input.apiKey)
      const dataUrl = `data:${artifact.mimeType};base64,${Buffer.from(artifact.buffer).toString('base64')}`
      const response = await fetcher(`${input.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen3-asr-flash',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: {
                    data: dataUrl
                  }
                }
              ]
            }
          ],
          stream: false,
          asr_options: {
            enable_itn: false
          }
        })
      })

      if (!response.ok) {
        throw new Error(`ASR request failed with status ${response.status}`)
      }

      const json = (await response.json()) as QwenResponse
      const text = extractText(json.choices?.[0]?.message?.content)

      if (!text) {
        throw new Error('ASR response did not contain transcript text')
      }

      return { text }
    }
  }
}
