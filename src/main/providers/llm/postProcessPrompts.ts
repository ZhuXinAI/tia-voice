import type { LlmTransformInput } from './LlmProvider'

export type PostProcessPresetRecord = {
  id: string
  name: string
  systemPrompt: string
  builtIn: boolean
  enablePostProcessing: boolean
}

export const DEFAULT_POST_PROCESS_PRESET_ID = 'formal'

const BASE_POST_PROCESS_PROMPT = [
  'You are a voice-driven text assistant.',
  'You receive: (1) a spoken instruction transcript and (2) optional selected text from user screen.',
  'Decide if the spoken instruction is asking to modify the selected text.',
  'If it is an edit intent and selected text exists, rewrite the selected text to satisfy the instruction.',
  'If not, clean the spoken transcript for punctuation, grammar, and natural phrasing without changing meaning.',
  'Keep the output in the same language unless the instruction asks for translation.',
  'Return only the final text. No explanation, JSON, markdown, or quotes.'
].join(' ')

export const DEFAULT_POST_PROCESS_PRESETS: PostProcessPresetRecord[] = [
  {
    id: 'formal',
    name: 'Formal',
    builtIn: true,
    enablePostProcessing: true,
    systemPrompt:
      'Prefer polished punctuation, complete sentences, and a professional tone while preserving the speaker intent, wording, and meaning.'
  },
  {
    id: 'casual',
    name: 'Casual',
    builtIn: true,
    enablePostProcessing: true,
    systemPrompt:
      'Prefer a conversational, relaxed tone with lighter punctuation and natural shorthand when it fits, while preserving the speaker intent, wording, and meaning.'
  }
]

export function getDefaultPostProcessPreset(
  presetId: string
): PostProcessPresetRecord | null {
  const preset = DEFAULT_POST_PROCESS_PRESETS.find((candidate) => candidate.id === presetId)
  return preset ? { ...preset } : null
}

function normalizePresetText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed === '' ? fallback : trimmed
}

export function normalizePostProcessPreset(
  value: unknown,
  fallback: PostProcessPresetRecord
): PostProcessPresetRecord {
  if (typeof value === 'string') {
    const builtIn = DEFAULT_POST_PROCESS_PRESETS.find((preset) => preset.id === value)
    if (builtIn) {
      return { ...builtIn }
    }
  }

  return {
    id: normalizePresetText((value as PostProcessPresetRecord | undefined)?.id, fallback.id),
    name: normalizePresetText((value as PostProcessPresetRecord | undefined)?.name, fallback.name),
    systemPrompt: normalizePresetText(
      (value as PostProcessPresetRecord | undefined)?.systemPrompt,
      fallback.systemPrompt
    ),
    builtIn: (value as PostProcessPresetRecord | undefined)?.builtIn === true,
    enablePostProcessing:
      typeof (value as PostProcessPresetRecord | undefined)?.enablePostProcessing === 'boolean'
        ? (value as PostProcessPresetRecord).enablePostProcessing
        : fallback.enablePostProcessing
  }
}

export function normalizePostProcessPresetCollection(
  value: unknown
): PostProcessPresetRecord[] {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_POST_PROCESS_PRESETS.map((preset) => ({ ...preset }))
  }

  const fallbackById = new Map(DEFAULT_POST_PROCESS_PRESETS.map((preset) => [preset.id, preset]))
  const presets = value
    .map((item, index) => {
      const id =
        typeof (item as PostProcessPresetRecord | undefined)?.id === 'string'
          ? (item as PostProcessPresetRecord).id
          : ''
      const fallback =
        fallbackById.get(id) ??
        ({
          id: `preset-${index + 1}`,
          name: `Preset ${index + 1}`,
          systemPrompt: 'Preserve meaning while following these instructions.',
          builtIn: false,
          enablePostProcessing: true
        } satisfies PostProcessPresetRecord)

      return normalizePostProcessPreset(item, fallback)
    })
    .filter((preset, index, allPresets) => {
      return preset.id.trim() !== '' && allPresets.findIndex((item) => item.id === preset.id) === index
    })

  if (presets.length === 0) {
    return DEFAULT_POST_PROCESS_PRESETS.map((preset) => ({ ...preset }))
  }

  return presets
}

export function resolveSelectedPostProcessPreset(input: {
  selectedPresetId: string
  presets: PostProcessPresetRecord[]
}): PostProcessPresetRecord {
  return (
    input.presets.find((preset) => preset.id === input.selectedPresetId) ??
    input.presets[0] ??
    DEFAULT_POST_PROCESS_PRESETS[0]
  )
}

export function buildPostProcessPromptParts(input: {
  request: LlmTransformInput
  preset: PostProcessPresetRecord
}): {
  system: string
  prompt: string
} {
  return {
    system: `${BASE_POST_PROCESS_PROMPT}\n\nPreset prompt:\n${input.preset.systemPrompt}`,
    prompt: `Remaining context:\n${JSON.stringify(
      {
        instructionTranscript: input.request.transcriptText,
        selectedText: input.request.selectedText
      },
      null,
      2
    )}`
  }
}
