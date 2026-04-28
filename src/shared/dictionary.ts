export type DictionaryEntryRecord = {
  id: string
  phrase: string
  replacement: string
  notes: string
}

export const DEFAULT_DICTIONARY_ENTRIES: DictionaryEntryRecord[] = [
  {
    id: 'buildmind',
    phrase: 'Buildmind',
    replacement: 'BuildMind',
    notes: 'Always keep the capital M in product and company references.'
  },
  {
    id: 'tia-voice',
    phrase: 'TIA voice',
    replacement: 'TIA Voice',
    notes: 'Use title case when referring to the desktop product.'
  }
]

const MAX_DICTIONARY_ENTRIES = 100

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDictionaryEntry(
  value: unknown,
  fallbackId: string
): DictionaryEntryRecord | null {
  const raw = value as Partial<DictionaryEntryRecord> | undefined
  const phrase = normalizeString(raw?.phrase)
  const replacement = normalizeString(raw?.replacement)

  if (!phrase || !replacement) {
    return null
  }

  return {
    id: normalizeString(raw?.id) || fallbackId,
    phrase,
    replacement,
    notes: normalizeString(raw?.notes)
  }
}

export function normalizeDictionaryEntries(value: unknown): DictionaryEntryRecord[] {
  const source = Array.isArray(value) ? value : DEFAULT_DICTIONARY_ENTRIES
  const entries: DictionaryEntryRecord[] = []
  const seenRules = new Set<string>()
  const seenIds = new Set<string>()

  for (const [index, item] of source.entries()) {
    if (entries.length >= MAX_DICTIONARY_ENTRIES) {
      break
    }

    const entry = normalizeDictionaryEntry(item, `dictionary-${index + 1}`)
    if (!entry) {
      continue
    }

    const ruleKey = `${entry.phrase.toLocaleLowerCase()}\n${entry.replacement.toLocaleLowerCase()}`
    if (seenRules.has(ruleKey)) {
      continue
    }

    seenRules.add(ruleKey)

    let id = entry.id
    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`
    }
    seenIds.add(id)

    entries.push({
      ...entry,
      id
    })
  }

  return entries
}
