import { describe, expect, it, vi } from 'vitest'

import type {
  GummyRealtimeTranscriptionClient,
  GummyTranscriptUpdate
} from '../providers/asr/GummyRealtimeTranscriptionClient'
import type { MeetingPostProcessor } from '../providers/llm/MeetingPostProcessor'
import type { MeetingStore, MeetingTranscriptSegment } from './types'
import { createMeetingCapturePipeline } from './meetingCapturePipeline'

type Deferred = {
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
}

type ClientMock = {
  client: GummyRealtimeTranscriptionClient
  started: Deferred
  finished: Deferred
}

function createDeferred(): Deferred {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

function createClientMock(): ClientMock {
  const started = createDeferred()
  const finished = createDeferred()
  const client: GummyRealtimeTranscriptionClient = {
    start: vi.fn(() => started.promise),
    sendAudioChunk: vi.fn(),
    finish: vi.fn(() => finished.promise),
    abort: vi.fn()
  }

  return { client, started, finished }
}

function createStoreMock(): MeetingStore {
  const segments: MeetingTranscriptSegment[] = []
  const record = {
    id: 'meeting-1',
    createdAt: 1000,
    updatedAt: 1000,
    startedAt: 1000,
    endedAt: null,
    durationMs: 0,
    status: 'recording' as const,
    llmProcessing: 'pending' as const,
    title: 'Meeting capture',
    summary: '',
    polishedTranscript: '',
    transcriptFileName: 'raw-transcript.json'
  }

  return {
    createMeeting: vi.fn(() => record),
    getMeeting: vi.fn(() => record),
    updateMeeting: vi.fn((_meetingId, patch) => ({ ...record, ...patch })),
    appendTranscriptSegment: vi.fn((_meetingId, segment) => {
      segments.push(segment)
      return segment
    }),
    getTranscriptSegments: vi.fn(() => segments),
    saveMixedAudio: vi.fn(async () => ({
      fileName: 'audio.webm',
      mimeType: 'audio/webm',
      durationMs: 1000,
      sizeBytes: 3
    })),
    getMixedAudioFile: vi.fn(() => null),
    readMixedAudio: vi.fn(async () => null),
    listRecentMeetings: vi.fn(() => ({ items: [record], totalCount: 1 }))
  }
}

function setupPipeline(): {
  pipeline: ReturnType<typeof createMeetingCapturePipeline>
  store: MeetingStore
  microphone: ClientMock
  system: ClientMock
  callbacks: Map<string, (update: GummyTranscriptUpdate) => void>
  meetingPostProcessor: MeetingPostProcessor
  showMeetingCapture: ReturnType<typeof vi.fn>
  stopMeetingCapture: ReturnType<typeof vi.fn>
  hideMeetingCapture: ReturnType<typeof vi.fn>
  setMeetingCaptureState: ReturnType<typeof vi.fn>
} {
  const store = createStoreMock()
  const microphone = createClientMock()
  const system = createClientMock()
  const callbacks = new Map<string, (update: GummyTranscriptUpdate) => void>()
  const showMeetingCapture = vi.fn()
  const stopMeetingCapture = vi.fn()
  const hideMeetingCapture = vi.fn()
  const setMeetingCaptureState = vi.fn()
  const meetingPostProcessor: MeetingPostProcessor = {
    process: vi.fn(async () => ({
      title: 'Processed meeting',
      summary: 'Meeting summary',
      polishedTranscript: 'You: Polished transcript.'
    }))
  }

  const pipeline = createMeetingCapturePipeline({
    meetingStore: store,
    getMicrophoneDeviceId: () => 'mic-1',
    createTranscriptionClient: ({ streamId, onTranscript }) => {
      callbacks.set(streamId, onTranscript)
      return streamId === 'microphone' ? microphone.client : system.client
    },
    meetingPostProcessor,
    showMeetingCapture,
    stopMeetingCapture,
    hideMeetingCapture,
    setMeetingCaptureState
  })

  return {
    pipeline,
    store,
    microphone,
    system,
    callbacks,
    meetingPostProcessor,
    showMeetingCapture,
    stopMeetingCapture,
    hideMeetingCapture,
    setMeetingCaptureState
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function waitForMicrotasks(assertion: () => void): Promise<void> {
  let lastError: unknown

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await Promise.resolve()
    }
  }

  throw lastError
}

describe('createMeetingCapturePipeline', () => {
  it('starts two Gummy realtime clients before sending renderer start command', async () => {
    const { pipeline, microphone, system, showMeetingCapture } = setupPipeline()
    const started = pipeline.beginMeetingCapture()

    expect(microphone.client.start).toHaveBeenCalledOnce()
    expect(system.client.start).toHaveBeenCalledOnce()
    expect(showMeetingCapture).not.toHaveBeenCalled()

    microphone.started.resolve()
    await Promise.resolve()
    expect(showMeetingCapture).not.toHaveBeenCalled()

    system.started.resolve()
    await started

    expect(showMeetingCapture).toHaveBeenCalledWith({ type: 'start', deviceId: 'mic-1' })
  })

  it('labels microphone transcript as You and system transcript as Others', async () => {
    const { pipeline, callbacks, microphone, system, store, setMeetingCaptureState } =
      setupPipeline()
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    callbacks.get('microphone')?.({
      sentenceId: 1,
      beginMs: 200,
      endMs: 400,
      text: 'I can take this',
      final: true
    })
    callbacks.get('system')?.({
      sentenceId: 1,
      beginMs: 500,
      endMs: 900,
      text: 'Thanks',
      final: true
    })

    expect(store.appendTranscriptSegment).toHaveBeenCalledWith(
      'meeting-1',
      expect.objectContaining({ streamId: 'microphone', speaker: 'you' })
    )
    expect(store.appendTranscriptSegment).toHaveBeenCalledWith(
      'meeting-1',
      expect.objectContaining({ streamId: 'system', speaker: 'others' })
    )
    expect(setMeetingCaptureState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transcriptItems: [
          expect.objectContaining({ speaker: 'You' }),
          expect.objectContaining({ speaker: 'Others' })
        ]
      })
    )
  })

  it('sorts final segments by begin time and prefers microphone on ties', async () => {
    const { pipeline, callbacks, microphone, system, setMeetingCaptureState } = setupPipeline()
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    callbacks.get('system')?.({
      sentenceId: 1,
      beginMs: 100,
      endMs: 300,
      text: 'Others first call',
      final: true
    })
    callbacks.get('microphone')?.({
      sentenceId: 2,
      beginMs: 100,
      endMs: 220,
      text: 'You tie call',
      final: true
    })

    const lastState = setMeetingCaptureState.mock.calls.at(-1)?.[0]
    expect(lastState.transcriptItems.map((item: { text: string }) => item.text)).toEqual([
      'You tie call',
      'Others first call'
    ])
  })

  it('forwards PCM chunks to the matching stream client', async () => {
    const { pipeline, microphone, system } = setupPipeline()
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    pipeline.receivePcmChunk({
      streamId: 'system',
      chunk: new Uint8Array([1, 2, 3]),
      capturedAt: 123
    })

    expect(system.client.sendAudioChunk).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]))
    expect(microphone.client.sendAudioChunk).not.toHaveBeenCalled()
  })

  it('hides the capture window immediately and waits for transcript plus audio before completing', async () => {
    const { pipeline, microphone, system, store, stopMeetingCapture, hideMeetingCapture } =
      setupPipeline()
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    await pipeline.finishMeetingCapture('shortcut')
    expect(stopMeetingCapture).toHaveBeenCalledOnce()
    expect(hideMeetingCapture).toHaveBeenCalledOnce()
    expect(microphone.client.finish).toHaveBeenCalledOnce()
    expect(system.client.finish).toHaveBeenCalledOnce()

    await pipeline.receiveMixedAudio({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1, 2, 3]),
      durationMs: 1000
    })
    expect(store.updateMeeting).not.toHaveBeenCalledWith(
      'meeting-1',
      expect.objectContaining({ status: 'completed' })
    )

    microphone.finished.resolve()
    system.finished.resolve()
    await waitForMicrotasks(() => {
      expect(store.updateMeeting).toHaveBeenCalledWith(
        'meeting-1',
        expect.objectContaining({ status: 'completed', llmProcessing: 'completed' })
      )
    })

    expect(store.saveMixedAudio).toHaveBeenCalledOnce()
    expect(pipeline.isMeetingCaptureBusy()).toBe(false)
  })

  it('runs no post-processing until both clients finish and mixed audio arrives', async () => {
    const { pipeline, microphone, system, meetingPostProcessor } = setupPipeline()
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    await pipeline.finishMeetingCapture('shortcut')
    microphone.finished.resolve()
    system.finished.resolve()
    await flushPromises()

    expect(meetingPostProcessor.process).not.toHaveBeenCalled()

    await pipeline.receiveMixedAudio({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1, 2, 3]),
      durationMs: 1000
    })

    await waitForMicrotasks(() => {
      expect(meetingPostProcessor.process).toHaveBeenCalledOnce()
    })
  })

  it('stores post-processing output after raw transcript and audio are saved', async () => {
    const { pipeline, callbacks, microphone, system, store, meetingPostProcessor } = setupPipeline()
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    callbacks.get('microphone')?.({
      sentenceId: 1,
      beginMs: 100,
      endMs: 200,
      text: 'Ship it',
      final: true
    })

    await pipeline.finishMeetingCapture('shortcut')
    await pipeline.receiveMixedAudio({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1, 2, 3]),
      durationMs: 1000
    })
    microphone.finished.resolve()
    system.finished.resolve()
    await waitForMicrotasks(() => {
      expect(meetingPostProcessor.process).toHaveBeenCalledWith(
        expect.objectContaining({
          segments: [expect.objectContaining({ text: 'Ship it' })]
        })
      )
    })

    expect(store.updateMeeting).toHaveBeenCalledWith(
      'meeting-1',
      expect.objectContaining({
        status: 'completed',
        llmProcessing: 'completed',
        title: 'Processed meeting',
        summary: 'Meeting summary',
        polishedTranscript: 'You: Polished transcript.'
      })
    )
  })

  it('marks llmProcessing failed without failing saved transcript and audio', async () => {
    const { pipeline, microphone, system, store, meetingPostProcessor } = setupPipeline()
    vi.mocked(meetingPostProcessor.process).mockRejectedValueOnce(new Error('provider down'))
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    await pipeline.finishMeetingCapture('shortcut')
    await pipeline.receiveMixedAudio({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1, 2, 3]),
      durationMs: 1000
    })
    microphone.finished.resolve()
    system.finished.resolve()
    await waitForMicrotasks(() => {
      expect(store.updateMeeting).toHaveBeenCalledWith(
        'meeting-1',
        expect.objectContaining({
          status: 'completed',
          llmProcessing: 'failed',
          errorDetail: 'provider down'
        })
      )
    })

    expect(store.saveMixedAudio).toHaveBeenCalledOnce()
    expect(pipeline.isMeetingCaptureBusy()).toBe(false)
  })

  it('persists raw capture completion before background post-processing finishes', async () => {
    const { pipeline, microphone, system, store, meetingPostProcessor } = setupPipeline()
    const postProcessing = createDeferred()
    vi.mocked(meetingPostProcessor.process).mockReturnValueOnce(
      postProcessing.promise.then(() => ({
        title: 'Processed meeting',
        summary: 'Meeting summary',
        polishedTranscript: 'You: Polished transcript.'
      }))
    )
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    await pipeline.finishMeetingCapture('shortcut')
    await pipeline.receiveMixedAudio({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1, 2, 3]),
      durationMs: 1000
    })
    microphone.finished.resolve()
    system.finished.resolve()
    await waitForMicrotasks(() => {
      expect(store.updateMeeting).toHaveBeenCalledWith(
        'meeting-1',
        expect.objectContaining({
          status: 'completed',
          llmProcessing: 'pending'
        })
      )
    })

    expect(pipeline.isMeetingCaptureBusy()).toBe(false)

    postProcessing.resolve()
    await waitForMicrotasks(() => {
      expect(store.updateMeeting).toHaveBeenCalledWith(
        'meeting-1',
        expect.objectContaining({ status: 'completed', llmProcessing: 'completed' })
      )
    })
  })

  it('keeps partial transcript and audio when realtime transcription finish fails', async () => {
    const { pipeline, microphone, system, store } = setupPipeline()
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    await pipeline.finishMeetingCapture('shortcut')
    await pipeline.receiveMixedAudio({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1, 2, 3]),
      durationMs: 1000
    })
    microphone.finished.resolve()
    system.finished.reject(new Error('socket closed'))
    await waitForMicrotasks(() => {
      expect(system.client.abort).toHaveBeenCalledWith('socket closed')
      expect(store.updateMeeting).toHaveBeenCalledWith(
        'meeting-1',
        expect.objectContaining({
          status: 'completed',
          llmProcessing: 'pending',
          errorDetail: 'socket closed'
        })
      )
    })

    expect(store.saveMixedAudio).toHaveBeenCalledOnce()
    expect(pipeline.isMeetingCaptureBusy()).toBe(false)
  })

  it('ignores a duplicate finish request while already processing', async () => {
    const { pipeline, microphone, system, stopMeetingCapture } = setupPipeline()
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    void pipeline.finishMeetingCapture('shortcut')
    await pipeline.finishMeetingCapture('renderer')

    expect(stopMeetingCapture).toHaveBeenCalledOnce()
    expect(microphone.client.finish).toHaveBeenCalledOnce()
    expect(system.client.finish).toHaveBeenCalledOnce()
  })

  it('aborts both clients and cleans state on renderer failure', async () => {
    const { pipeline, microphone, system, store } = setupPipeline()
    const started = pipeline.beginMeetingCapture()
    microphone.started.resolve()
    system.started.resolve()
    await started

    pipeline.failMeetingCapture('system audio unavailable')

    expect(microphone.client.abort).toHaveBeenCalledWith('system audio unavailable')
    expect(system.client.abort).toHaveBeenCalledWith('system audio unavailable')
    expect(store.updateMeeting).toHaveBeenCalledWith(
      'meeting-1',
      expect.objectContaining({ status: 'failed', llmProcessing: 'failed' })
    )
    expect(pipeline.isMeetingCaptureBusy()).toBe(false)
  })
})
