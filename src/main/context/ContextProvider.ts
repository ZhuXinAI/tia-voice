import type { ContextSelection, ContextSnapshot } from './types'

export type CaptureSelectionOptions = {
  allowAnySource?: boolean
  fallbackBounds?: ContextSelection['bounds']
}

export interface ContextProvider {
  captureSnapshot(): Promise<ContextSnapshot>
  captureSelection?(options?: CaptureSelectionOptions): Promise<ContextSelection | null>
  subscribeToSelection?(listener: (selection: ContextSelection | null) => void): () => void
  cleanup?(): void
}
