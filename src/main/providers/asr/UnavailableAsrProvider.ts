import type { RecordingArtifact } from '../../recording/types'
import type { AsrProvider } from './AsrProvider'

export function createUnavailableAsrProvider(reason: string): AsrProvider {
  return {
    async transcribe(_input: RecordingArtifact) {
      throw new Error(reason)
    }
  }
}
