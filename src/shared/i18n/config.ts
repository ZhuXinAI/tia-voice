export const APP_LANGUAGES = ['en', 'zh-CN', 'zh-TW'] as const
export const LANGUAGE_PREFERENCES = ['system', ...APP_LANGUAGES] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number]

function normalizeLocale(input: string): string {
  return input.replace(/_/g, '-').trim().toLowerCase()
}

export function matchSupportedLanguage(locale: string | null | undefined): AppLanguage | null {
  if (!locale) {
    return null
  }

  const normalized = normalizeLocale(locale)
  if (normalized === '') {
    return null
  }

  if (normalized.startsWith('en')) {
    return 'en'
  }

  if (!normalized.startsWith('zh')) {
    return null
  }

  if (
    normalized.includes('hant') ||
    normalized.includes('-tw') ||
    normalized.includes('-hk') ||
    normalized.includes('-mo')
  ) {
    return 'zh-TW'
  }

  return 'zh-CN'
}

export function resolveSystemLanguage(preferredLocales: readonly string[]): AppLanguage {
  for (const locale of preferredLocales) {
    const matched = matchSupportedLanguage(locale)
    if (matched) {
      return matched
    }
  }

  return 'en'
}

export function resolveAppLanguage(
  preference: LanguagePreference,
  preferredLocales: readonly string[]
): AppLanguage {
  if (preference !== 'system') {
    return preference
  }

  return resolveSystemLanguage(preferredLocales)
}

export function getNavigatorPreferredLocales(): string[] {
  if (typeof navigator === 'undefined') {
    return ['en']
  }

  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language
  ]

  return candidates.filter((value): value is string => typeof value === 'string' && value !== '')
}

export function getIntlLocale(language: AppLanguage): string {
  return language
}
