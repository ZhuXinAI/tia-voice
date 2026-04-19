import type { ContextProvider } from './ContextProvider'

export function createNoopContextProvider(): ContextProvider {
  return {
    async captureSnapshot() {
      return {
        isInputFocused: null,
        selectedText: null,
        provider: 'noop' as const,
        capturedAt: Date.now()
      }
    }
  }
}
