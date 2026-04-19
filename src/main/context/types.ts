export type ContextSnapshot = {
  isInputFocused: boolean | null
  selectedText: string | null
  provider: 'noop' | 'selection-hook'
  capturedAt: number
}
