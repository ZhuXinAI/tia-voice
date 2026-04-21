export type RecordingArtifact = {
  mimeType: string
  buffer: Uint8Array
  durationMs: number
  sizeBytes?: number
}

export type RecordingCommand =
  | {
      type: 'start'
      startedAt: number
      deviceId?: string | null
    }
  | {
      type: 'stop'
    }

export type ChatPhase = 'idle' | 'thinking' | 'done' | 'error'

export type ChatState = {
  phase: ChatPhase
  text?: string
  detail?: string
}
