export type SelectionBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type ContextSelection = {
  text: string
  sourceApp: string | null
  bounds: SelectionBounds | null
  capturedAt: number
}

export type ContextSnapshot = {
  isInputFocused: boolean | null
  selectedText: string | null
  provider: 'noop' | 'selection-hook'
  capturedAt: number
}
