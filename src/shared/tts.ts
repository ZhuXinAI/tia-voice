export type TtsSource = 'manual' | 'question-answer'

export type TtsTranscriptSegment = {
  text: string
  startSecond: number
  endSecond: number
}

export type TtsStatePayload = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  sessionId: string | null
  source: TtsSource | null
  text: string
  audioUrl: string | null
  audioExpiresAt: number | null
  segments: TtsTranscriptSegment[]
  voice: string | null
  model: string | null
  createdAt: number | null
  error: string | null
}
