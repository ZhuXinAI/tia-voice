import { logDebug } from '../logging/debugLogger'
import type { RecordingArtifact } from '../recording/types'
import type {
  GummyRealtimeTranscriptionClient,
  GummyTranscriptUpdate
} from '../providers/asr/GummyRealtimeTranscriptionClient'
import type { MeetingPostProcessor } from '../providers/llm/MeetingPostProcessor'
import type {
  MeetingCaptureRecord,
  MeetingStore,
  MeetingStreamId,
  MeetingTranscriptSegment
} from './types'
import type { MeetingCaptureState } from '../windows/windowManager'

type MeetingCapturePipelineState = 'idle' | 'starting' | 'recording' | 'processing'

type ActiveMeeting = {
  record: MeetingCaptureRecord
  startedAt: number
  clients: Record<MeetingStreamId, GummyRealtimeTranscriptionClient>
  transcriptSegments: MeetingTranscriptSegment[]
  transcriptionFinished: boolean
  mixedAudioSaved: boolean
  finalizing: boolean
}

export type MeetingCapturePipeline = {
  beginMeetingCapture(): Promise<boolean>
  receivePcmChunk(input: { streamId: MeetingStreamId; chunk: Uint8Array; capturedAt: number }): void
  finishMeetingCapture(source: 'shortcut' | 'renderer'): Promise<void>
  receiveMixedAudio(artifact: RecordingArtifact): Promise<void>
  failMeetingCapture(detail: string): void
  isMeetingCaptureBusy(): boolean
}

export function createMeetingCapturePipeline(dependencies: {
  meetingStore: MeetingStore
  getMicrophoneDeviceId: () => string | null
  createTranscriptionClient(input: {
    streamId: MeetingStreamId
    onTranscript(update: GummyTranscriptUpdate): void
  }): GummyRealtimeTranscriptionClient
  publishSystemLiveCaption?: (update: GummyTranscriptUpdate) => void
  meetingPostProcessor: MeetingPostProcessor
  showMeetingCapture(command: { type: 'start'; deviceId?: string | null }): void
  stopMeetingCapture(): void
  setMeetingCaptureState(state: MeetingCaptureState): void
}): MeetingCapturePipeline {
  let state: MeetingCapturePipelineState = 'idle'
  let activeMeeting: ActiveMeeting | null = null

  function getSpeaker(streamId: MeetingStreamId): MeetingTranscriptSegment['speaker'] {
    return streamId === 'microphone' ? 'you' : 'others'
  }

  function getSpeakerLabel(streamId: MeetingStreamId): 'You' | 'Others' {
    return streamId === 'microphone' ? 'You' : 'Others'
  }

  function sortSegments(segments: MeetingTranscriptSegment[]): MeetingTranscriptSegment[] {
    return [...segments].sort((a, b) => {
      if (a.beginMs !== b.beginMs) {
        return a.beginMs - b.beginMs
      }

      if (a.streamId === b.streamId) {
        return a.endMs - b.endMs
      }

      return a.streamId === 'microphone' ? -1 : 1
    })
  }

  function publishState(
    status: MeetingCaptureState['status'],
    errorDetail: string | null = null
  ): void {
    dependencies.setMeetingCaptureState({
      status,
      meetingId: activeMeeting?.record.id ?? null,
      startedAt: activeMeeting?.startedAt ?? null,
      transcriptItems: sortSegments(activeMeeting?.transcriptSegments ?? []).map((segment) => ({
        id: segment.id,
        speaker: getSpeakerLabel(segment.streamId),
        text: segment.text,
        createdAt: segment.createdAt
      })),
      errorDetail
    })
  }

  function handleTranscript(streamId: MeetingStreamId, update: GummyTranscriptUpdate): void {
    if (!activeMeeting) {
      return
    }

    if (streamId === 'system') {
      dependencies.publishSystemLiveCaption?.(update)
    }

    const segment: MeetingTranscriptSegment = {
      id: `${streamId}-${update.sentenceId}-${update.beginMs}-${update.endMs}`,
      streamId,
      speaker: getSpeaker(streamId),
      text: update.text.trim(),
      beginMs: update.beginMs,
      endMs: update.endMs,
      final: update.final,
      createdAt: Date.now()
    }

    if (!segment.text) {
      return
    }

    if (segment.final) {
      dependencies.meetingStore.appendTranscriptSegment(activeMeeting.record.id, segment)
      activeMeeting.transcriptSegments = sortSegments([
        ...activeMeeting.transcriptSegments.filter((item) => item.id !== segment.id),
        segment
      ])
    } else {
      activeMeeting.transcriptSegments = sortSegments([
        ...activeMeeting.transcriptSegments.filter(
          (item) => !(item.streamId === streamId && item.final === false)
        ),
        segment
      ])
    }

    publishState(state === 'processing' ? 'processing' : 'recording')
  }

  async function maybeFinalizeActiveMeeting(): Promise<void> {
    const meeting = activeMeeting
    if (
      !meeting ||
      meeting.finalizing ||
      !meeting.transcriptionFinished ||
      !meeting.mixedAudioSaved
    ) {
      return
    }

    meeting.finalizing = true
    const endedAt = Date.now()
    const finalSegments = dependencies.meetingStore.getTranscriptSegments(meeting.record.id)

    try {
      const processed = await dependencies.meetingPostProcessor.process({
        segments: finalSegments,
        startedAt: meeting.startedAt,
        endedAt
      })
      dependencies.meetingStore.updateMeeting(meeting.record.id, {
        endedAt,
        durationMs: endedAt - meeting.startedAt,
        status: 'completed',
        llmProcessing: 'completed',
        title: processed.title,
        summary: processed.summary,
        polishedTranscript: processed.polishedTranscript,
        errorDetail: undefined
      })
      publishState('completed')
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Meeting post-processing failed.'
      dependencies.meetingStore.updateMeeting(meeting.record.id, {
        endedAt,
        durationMs: endedAt - meeting.startedAt,
        status: 'completed',
        llmProcessing: 'failed',
        errorDetail: detail
      })
      logDebug('meeting-capture', 'Meeting post-processing failed', {
        meetingId: meeting.record.id,
        error
      })
      publishState('completed', detail)
    } finally {
      state = 'idle'
      activeMeeting = null
    }
  }

  function failActiveMeeting(detail: string): void {
    const meeting = activeMeeting
    if (meeting) {
      meeting.clients.microphone.abort(detail)
      meeting.clients.system.abort(detail)
      dependencies.meetingStore.updateMeeting(meeting.record.id, {
        status: 'failed',
        llmProcessing: 'failed',
        errorDetail: detail,
        endedAt: Date.now()
      })
    }

    publishState('failed', detail)
    state = 'idle'
    activeMeeting = null
  }

  return {
    async beginMeetingCapture() {
      if (state !== 'idle') {
        logDebug('meeting-capture', 'Ignored begin while meeting capture is active', { state })
        return false
      }

      state = 'starting'
      const startedAt = Date.now()
      const record = dependencies.meetingStore.createMeeting({ startedAt })
      const clients = {
        microphone: dependencies.createTranscriptionClient({
          streamId: 'microphone',
          onTranscript: (update) => handleTranscript('microphone', update)
        }),
        system: dependencies.createTranscriptionClient({
          streamId: 'system',
          onTranscript: (update) => handleTranscript('system', update)
        })
      }

      activeMeeting = {
        record,
        startedAt,
        clients,
        transcriptSegments: [],
        transcriptionFinished: false,
        mixedAudioSaved: false,
        finalizing: false
      }
      publishState('starting')

      try {
        await Promise.all([clients.microphone.start(), clients.system.start()])
        state = 'recording'
        dependencies.meetingStore.updateMeeting(record.id, { status: 'recording' })
        dependencies.showMeetingCapture({
          type: 'start',
          deviceId: dependencies.getMicrophoneDeviceId()
        })
        publishState('recording')
        return true
      } catch (error) {
        failActiveMeeting(
          error instanceof Error ? error.message : 'Unable to start meeting transcription.'
        )
        return false
      }
    },

    receivePcmChunk(input) {
      if (!activeMeeting || state === 'idle') {
        return
      }

      activeMeeting.clients[input.streamId].sendAudioChunk(input.chunk)
    },

    async finishMeetingCapture(source) {
      if (!activeMeeting || state === 'idle') {
        return
      }

      if (state !== 'recording') {
        logDebug('meeting-capture', 'Ignored finish while meeting capture is not recording', {
          source,
          state
        })
        return
      }

      logDebug('meeting-capture', 'Finishing meeting capture', { source, state })
      state = 'processing'
      dependencies.meetingStore.updateMeeting(activeMeeting.record.id, { status: 'processing' })
      publishState('processing')
      dependencies.stopMeetingCapture()

      try {
        await Promise.all([
          activeMeeting.clients.microphone.finish(),
          activeMeeting.clients.system.finish()
        ])
        activeMeeting.transcriptionFinished = true
        await maybeFinalizeActiveMeeting()
      } catch (error) {
        failActiveMeeting(error instanceof Error ? error.message : 'Meeting transcription failed.')
      }
    },

    async receiveMixedAudio(artifact) {
      if (!activeMeeting) {
        throw new Error('Meeting capture is not active.')
      }

      await dependencies.meetingStore.saveMixedAudio(activeMeeting.record.id, artifact)
      activeMeeting.mixedAudioSaved = true
      await maybeFinalizeActiveMeeting()
    },

    failMeetingCapture(detail) {
      failActiveMeeting(detail)
    },

    isMeetingCaptureBusy() {
      return state !== 'idle'
    }
  }
}
