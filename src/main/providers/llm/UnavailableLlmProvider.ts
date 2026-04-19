import type { LlmProvider } from './LlmProvider'

export function createUnavailableLlmProvider(reason: string): LlmProvider {
  return {
    async transform(_input) {
      throw new Error(reason)
    }
  }
}
