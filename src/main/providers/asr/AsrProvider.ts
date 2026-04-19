import type { RecordingArtifact } from '../../recording/types'

export interface AsrProvider {
  transcribe(input: RecordingArtifact): Promise<{ text: string; language?: string }>
}
