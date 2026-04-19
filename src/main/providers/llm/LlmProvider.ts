export type LlmTransformInput = {
  transcriptText: string
  selectedText: string | null
}

export interface LlmProvider {
  transform(input: LlmTransformInput): Promise<{ text: string }>
}
