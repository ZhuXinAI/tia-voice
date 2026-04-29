import type { DictionaryEntryRecord } from '../../../shared/dictionary'

export type QuestionAnswerInput = {
  questionText: string
  selectedText: string | null
  sourceApp?: string | null
  dictionaryEntries?: DictionaryEntryRecord[]
}

export type QuestionAnswerProvider = {
  answer(input: QuestionAnswerInput): Promise<{ text: string }>
}

function buildDictionaryPrompt(dictionaryEntries: QuestionAnswerInput['dictionaryEntries']): string {
  const entries = (dictionaryEntries ?? []).map((entry) => ({
    spokenPhrase: entry.phrase,
    normalizedOutput: entry.replacement,
    ...(entry.notes ? { notes: entry.notes } : {})
  }))

  if (entries.length === 0) {
    return 'No dictionary normalization rules configured.'
  }

  return JSON.stringify(entries, null, 2)
}

export function buildQuestionAnswerPromptParts(input: QuestionAnswerInput): {
  system: string
  prompt: string
} {
  return {
    system: [
      'You are TIA Voice, a concise voice Q&A assistant.',
      'Answer the user question using the selected text as the primary context when selected text is provided.',
      'If there is no selected text, answer from general knowledge and say when the context is missing.',
      'Apply dictionary normalization rules when they affect names, brands, acronyms, or special terms.',
      'Use the same language as the spoken question unless the question asks for another language.',
      'Return only the final answer. No JSON, markdown fences, or preambles.',
      '',
      'Dictionary normalization rules:',
      buildDictionaryPrompt(input.dictionaryEntries)
    ].join('\n'),
    prompt: JSON.stringify(
      {
        spokenQuestion: input.questionText,
        selectedText: input.selectedText,
        sourceApp: input.sourceApp ?? null
      },
      null,
      2
    )
  }
}
