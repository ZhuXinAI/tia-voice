import type { ContextSnapshot } from '../context/types'

export function routeIntent(snapshot: ContextSnapshot) {
  if (snapshot.isInputFocused && snapshot.selectedText) {
    return { mode: 'selection-aware' as const }
  }

  if (!snapshot.isInputFocused && snapshot.selectedText) {
    return { mode: 'answer-query' as const }
  }

  return { mode: 'generate-text' as const }
}
