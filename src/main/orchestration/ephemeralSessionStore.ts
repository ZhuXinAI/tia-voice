import type { ContextSnapshot } from '../context/types'

export type VoiceSession = {
  id: string
  snapshot: ContextSnapshot
}

export function createEphemeralSessionStore() {
  let currentSession: VoiceSession | null = null

  return {
    begin(snapshot: ContextSnapshot): VoiceSession {
      currentSession = {
        id: `session-${snapshot.capturedAt}`,
        snapshot
      }
      return currentSession
    },
    getCurrent(): VoiceSession | null {
      return currentSession
    },
    clear(): void {
      currentSession = null
    }
  }
}
