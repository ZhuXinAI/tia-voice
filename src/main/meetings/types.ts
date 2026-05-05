import type { RecordingArtifact } from '../recording/types'

export type MeetingSpeaker = 'you' | 'others'
export type MeetingStreamId = 'microphone' | 'system'

export type MeetingTranscriptSegment = {
  id: string
  streamId: MeetingStreamId
  speaker: MeetingSpeaker
  text: string
  beginMs: number
  endMs: number
  final: boolean
  createdAt: number
}

export type MeetingAudioAsset = {
  fileName: string
  mimeType: string
  durationMs: number
  sizeBytes: number
}

export type MeetingAudioFile = MeetingAudioAsset & {
  filePath: string
}

export type MeetingCaptureRecord = {
  id: string
  createdAt: number
  updatedAt: number
  startedAt: number
  endedAt: number | null
  durationMs: number
  status: 'recording' | 'processing' | 'completed' | 'failed'
  llmProcessing: 'pending' | 'completed' | 'failed'
  title: string
  summary: string
  polishedTranscript: string
  errorDetail?: string
  audio?: MeetingAudioAsset
  transcriptFileName: string
}

export type CreateMeetingInput = {
  startedAt?: number
}

export type MeetingPageInput = {
  offset?: number
  limit?: number
}

export type MeetingPage = {
  items: MeetingCaptureRecord[]
  totalCount: number
}

export type SaveMeetingAudioInput = RecordingArtifact

export type MeetingStore = {
  createMeeting(input?: CreateMeetingInput): MeetingCaptureRecord
  getMeeting(meetingId: string): MeetingCaptureRecord | null
  updateMeeting(
    meetingId: string,
    patch: Partial<Omit<MeetingCaptureRecord, 'id' | 'createdAt' | 'transcriptFileName'>>
  ): MeetingCaptureRecord | null
  appendTranscriptSegment(
    meetingId: string,
    segment: MeetingTranscriptSegment
  ): MeetingTranscriptSegment | null
  getTranscriptSegments(meetingId: string): MeetingTranscriptSegment[]
  saveMixedAudio(meetingId: string, input: SaveMeetingAudioInput): Promise<MeetingAudioAsset | null>
  getMixedAudioFile(meetingId: string): MeetingAudioFile | null
  readMixedAudio(meetingId: string): Promise<(MeetingAudioAsset & { buffer: Uint8Array }) | null>
  listRecentMeetings(input?: MeetingPageInput): MeetingPage
}
