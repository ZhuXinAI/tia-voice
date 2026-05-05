export const LIVE_CAPTION_SOURCE_LANGUAGES = [
  'auto',
  'zh',
  'en',
  'ja',
  'ko',
  'yue',
  'de',
  'fr',
  'ru',
  'es',
  'it',
  'pt',
  'id',
  'ar',
  'th'
] as const

export const LIVE_CAPTION_TARGET_LANGUAGES = [
  'zh',
  'en',
  'ja',
  'ko',
  'yue',
  'de',
  'fr',
  'ru',
  'es',
  'it',
  'pt',
  'id',
  'ar',
  'th',
  'hi',
  'da',
  'ur',
  'tr',
  'nl',
  'ms',
  'vi'
] as const

export type LiveCaptionSourceLanguage = (typeof LIVE_CAPTION_SOURCE_LANGUAGES)[number]
export type LiveCaptionTargetLanguage = (typeof LIVE_CAPTION_TARGET_LANGUAGES)[number]

export type LiveCaptionPreferences = {
  sourceLanguage: LiveCaptionSourceLanguage
  targetLanguage: LiveCaptionTargetLanguage | null
  showOriginalWhenTranslating: boolean
}

export type LiveCaptionLine = {
  id: string
  sentenceId: number
  beginMs: number
  endMs: number
  sourceText: string
  translatedText: string | null
  targetLanguage: LiveCaptionTargetLanguage | null
  final: boolean
  createdAt: number
}

export type LiveCaptionState = {
  status: 'idle' | 'configuring' | 'starting' | 'listening' | 'stopping' | 'error'
  source: 'standalone' | 'meeting' | null
  preferences: LiveCaptionPreferences
  lines: LiveCaptionLine[]
  error: string | null
}

export type LiveCaptionCommand =
  | {
      type: 'state'
      state: LiveCaptionState
    }
  | {
      type: 'start-capture'
    }
  | {
      type: 'stop-capture'
    }

export const DEFAULT_LIVE_CAPTION_PREFERENCES: LiveCaptionPreferences = {
  sourceLanguage: 'auto',
  targetLanguage: null,
  showOriginalWhenTranslating: true
}

export function isLiveCaptionSourceLanguage(value: unknown): value is LiveCaptionSourceLanguage {
  return (
    typeof value === 'string' &&
    (LIVE_CAPTION_SOURCE_LANGUAGES as readonly string[]).includes(value)
  )
}

export function isLiveCaptionTargetLanguage(value: unknown): value is LiveCaptionTargetLanguage {
  return (
    typeof value === 'string' &&
    (LIVE_CAPTION_TARGET_LANGUAGES as readonly string[]).includes(value)
  )
}

export function normalizeLiveCaptionPreferences(value: unknown): LiveCaptionPreferences {
  const input = value as Partial<LiveCaptionPreferences> | undefined
  return {
    sourceLanguage: isLiveCaptionSourceLanguage(input?.sourceLanguage)
      ? input.sourceLanguage
      : DEFAULT_LIVE_CAPTION_PREFERENCES.sourceLanguage,
    targetLanguage: isLiveCaptionTargetLanguage(input?.targetLanguage)
      ? input.targetLanguage
      : null,
    showOriginalWhenTranslating: input?.showOriginalWhenTranslating !== false
  }
}
