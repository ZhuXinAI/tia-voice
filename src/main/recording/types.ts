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

export type QuestionRecordingCommand =
  | RecordingCommand
  | {
      type: 'pending'
      stage: 'transcribing' | 'answering'
      selectedText: string | null
      sourceApp: string | null
      question?: string | null
    }
  | {
      type: 'answer'
      question: string
      answer: string
      selectedText?: string | null
      sourceApp?: string | null
    }
  | {
      type: 'error'
      detail: string
    }
  | {
      type: 'clear'
    }

export type ChatPhase = 'idle' | 'thinking' | 'done' | 'error'

export type ChatState = {
  phase: ChatPhase
  text?: string
  detail?: string
}
