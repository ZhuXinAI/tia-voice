import type { ContextSnapshot } from './types'

export interface ContextProvider {
  captureSnapshot(): Promise<ContextSnapshot>
  cleanup?(): void
}
