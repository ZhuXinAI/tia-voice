import type { DictionaryEntryRecord } from '../../../shared/dictionary'

export type LlmTransformInput = {
  transcriptText: string
  selectedText: string | null
  dictionaryEntries?: DictionaryEntryRecord[]
}

export interface LlmProvider {
  transform(input: LlmTransformInput): Promise<{ text: string }>
}
