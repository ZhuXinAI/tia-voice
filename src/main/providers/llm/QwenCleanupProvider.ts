import type { LlmProvider, LlmTransformInput } from './LlmProvider'

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

const SYSTEM_PROMPT = [
  'You are a voice-driven text assistant.',
  'You receive: (1) a spoken instruction transcript and (2) optional selected text from user screen.',
  'Decide if the spoken instruction is asking to modify the selected text.',
  'If it is an edit intent and selected text exists, rewrite the selected text to satisfy the instruction.',
  'If not, clean the spoken transcript for punctuation, grammar, and natural phrasing without changing meaning.',
  'Keep the output in the same language unless the instruction asks for translation.',
  'Return only the final text. No explanation, JSON, markdown, or quotes.'
].join(' ')

function buildUserPrompt(input: LlmTransformInput): string {
  return JSON.stringify(
    {
      instructionTranscript: input.transcriptText,
      selectedText: input.selectedText
    },
    null,
    2
  )
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

export function createQwenCleanupProvider(input: {
  apiKey: ApiKeyResolver
  baseUrl: string
  fetcher?: FetchLike
}): LlmProvider {
  const fetcher = input.fetcher ?? fetch

  return {
    async transform(request: LlmTransformInput) {
      const apiKey = await resolveApiKey(input.apiKey)
      const response = await fetcher(`${input.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: buildUserPrompt(request)
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
