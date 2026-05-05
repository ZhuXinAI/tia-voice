import { useCallback, useMemo, useRef, useState } from 'react'

import { encodeChannelsToPcm16Chunks } from './audio/pcmEncoder'

export type MeetingStreamId = 'microphone' | 'system'
export type MeetingCaptureStatus = 'idle' | 'starting' | 'recording' | 'processing' | 'error'

export type MeetingTranscriptPreviewItem = {
  id: string
  speaker: 'You' | 'Others'
  text: string
  createdAt: number
}

export type MeetingStreamHealth = {
  active: boolean
  lastChunkAt: number | null
}

export type MeetingRecordingArtifact = {
  mimeType: string
  buffer: Uint8Array
  durationMs: number
  sizeBytes?: number
}

export type MeetingCaptureDependencies = {
  mediaDevices?: Pick<MediaDevices, 'getUserMedia' | 'getDisplayMedia'>
  createAudioContext?: () => AudioContext
  createMediaRecorder?: (stream: MediaStream, options?: MediaRecorderOptions) => MediaRecorder
  now?: () => number
  sendPcmChunk?: (input: {
    streamId: MeetingStreamId
    chunk: Uint8Array
    capturedAt: number
  }) => Promise<void> | void
  submitMixedAudio?: (artifact: MeetingRecordingArtifact) => Promise<void> | void
  reportFailure?: (detail: string) => Promise<void> | void
}

export type StartMeetingCaptureInput = {
  deviceId?: string | null
}

export type MeetingCaptureController = {
  status: MeetingCaptureStatus
  error: string | null
  startedAt: number | null
  durationMs: number
  streams: Record<MeetingStreamId, MeetingStreamHealth>
  transcriptItems: MeetingTranscriptPreviewItem[]
  setTranscriptItems(items: MeetingTranscriptPreviewItem[]): void
  start(input?: StartMeetingCaptureInput): Promise<boolean>
  stop(): Promise<boolean>
  fail(detail: string): Promise<void>
}

type MediaGraph = {
  audioContext: AudioContext
  microphoneStream: MediaStream
  systemStream: MediaStream
  mixedDestination: MediaStreamAudioDestinationNode
  recorder: MediaRecorder
  processors: AudioNode[]
  sources: AudioNode[]
  silentGain: GainNode
  startedAt: number
}

function getDefaultMediaDevices(): MeetingCaptureDependencies['mediaDevices'] {
  return navigator.mediaDevices as MeetingCaptureDependencies['mediaDevices']
}

function createDefaultAudioContext(): AudioContext {
  return new AudioContext()
}

function createDefaultMediaRecorder(
  stream: MediaStream,
  options?: MediaRecorderOptions
): MediaRecorder {
  return new MediaRecorder(stream, options)
}

function resolveMixedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }

  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
}

function cloneChannelData(inputBuffer: AudioBuffer): Float32Array[] {
  return new Array(inputBuffer.numberOfChannels).fill(null).map((_, index) => {
    return new Float32Array(inputBuffer.getChannelData(index))
  })
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

function stopAudioTracks(stream: MediaStream | null): void {
  stream?.getAudioTracks().forEach((track) => track.stop())
}

export function useMeetingCapture(
  dependencies: MeetingCaptureDependencies = {}
): MeetingCaptureController {
  const [status, setStatus] = useState<MeetingCaptureStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [durationMs, setDurationMs] = useState(0)
  const [streams, setStreams] = useState<Record<MeetingStreamId, MeetingStreamHealth>>({
    microphone: { active: false, lastChunkAt: null },
    system: { active: false, lastChunkAt: null }
  })
  const [transcriptItems, setTranscriptItems] = useState<MeetingTranscriptPreviewItem[]>([])
  const graphRef = useRef<MediaGraph | null>(null)
  const statusRef = useRef<MeetingCaptureStatus>('idle')
  const timerRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeType = useMemo(resolveMixedAudioMimeType, [])

  const now = dependencies.now ?? Date.now

  const setCaptureStatus = useCallback((nextStatus: MeetingCaptureStatus) => {
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) {
      return
    }

    window.clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const cleanupGraph = useCallback(() => {
    const graph = graphRef.current
    graphRef.current = null

    if (!graph) {
      return
    }

    graph.processors.forEach((node) => node.disconnect())
    graph.sources.forEach((node) => node.disconnect())
    graph.silentGain.disconnect()
    stopStream(graph.microphoneStream)
    stopStream(graph.systemStream)
    void graph.audioContext.close()
  }, [])

  const markStreamChunk = useCallback((streamId: MeetingStreamId, capturedAt: number) => {
    setStreams((current) => ({
      ...current,
      [streamId]: {
        active: true,
        lastChunkAt: capturedAt
      }
    }))
  }, [])

  const connectPcmProcessor = useCallback(
    (input: {
      audioContext: AudioContext
      source: MediaStreamAudioSourceNode
      streamId: MeetingStreamId
      silentGain: GainNode
    }): AudioNode => {
      const processor = input.audioContext.createScriptProcessor(4096, 2, 1)
      processor.onaudioprocess = (event) => {
        const capturedAt = now()
        const chunks = encodeChannelsToPcm16Chunks({
          channels: cloneChannelData(event.inputBuffer),
          sourceSampleRate: input.audioContext.sampleRate
        })

        for (const chunk of chunks) {
          void dependencies.sendPcmChunk?.({
            streamId: input.streamId,
            chunk,
            capturedAt
          })
        }

        if (chunks.length > 0) {
          markStreamChunk(input.streamId, capturedAt)
        }
      }

      input.source.connect(processor)
      processor.connect(input.silentGain)
      return processor
    },
    [dependencies, markStreamChunk, now]
  )

  const fail = useCallback(
    async (detail: string): Promise<void> => {
      clearTimer()
      cleanupGraph()
      setDurationMs(0)
      setStartedAt(null)
      setStreams({
        microphone: { active: false, lastChunkAt: null },
        system: { active: false, lastChunkAt: null }
      })
      setError(detail)
      setCaptureStatus('error')
      await dependencies.reportFailure?.(detail)
    },
    [cleanupGraph, clearTimer, dependencies, setCaptureStatus]
  )

  const start = useCallback(
    async (input: StartMeetingCaptureInput = {}): Promise<boolean> => {
      if (statusRef.current !== 'idle' && statusRef.current !== 'error') {
        return false
      }

      const mediaDevices = dependencies.mediaDevices ?? getDefaultMediaDevices()
      if (!mediaDevices?.getUserMedia || !mediaDevices.getDisplayMedia) {
        await fail('Meeting capture is not supported in this browser context.')
        return false
      }

      setCaptureStatus('starting')
      setError(null)
      chunksRef.current = []

      let microphoneStream: MediaStream | null = null
      let systemStream: MediaStream | null = null

      try {
        microphoneStream = await mediaDevices.getUserMedia(
          input.deviceId
            ? {
                audio: {
                  deviceId: {
                    exact: input.deviceId
                  }
                }
              }
            : { audio: true }
        )

        systemStream = await mediaDevices.getDisplayMedia({
          audio: true,
          video: {
            width: 1,
            height: 1,
            frameRate: 1
          }
        })
        systemStream.getVideoTracks().forEach((track) => track.stop())

        if (systemStream.getAudioTracks().length === 0) {
          throw new Error('System audio was not available for this meeting capture.')
        }

        const audioContext = dependencies.createAudioContext?.() ?? createDefaultAudioContext()
        const mixedDestination = audioContext.createMediaStreamDestination()
        const silentGain = audioContext.createGain()
        silentGain.gain.value = 0
        silentGain.connect(audioContext.destination)

        const microphoneSource = audioContext.createMediaStreamSource(microphoneStream)
        const systemSource = audioContext.createMediaStreamSource(systemStream)
        microphoneSource.connect(mixedDestination)
        systemSource.connect(mixedDestination)

        const recorder = dependencies.createMediaRecorder
          ? dependencies.createMediaRecorder(
              mixedDestination.stream,
              mimeType ? { mimeType } : undefined
            )
          : createDefaultMediaRecorder(mixedDestination.stream, mimeType ? { mimeType } : undefined)

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }

        recorder.onerror = () => {
          void fail('Meeting audio recorder failed.')
        }

        recorder.onstop = async () => {
          try {
            const graph = graphRef.current
            const stoppedAt = now()
            const blob = new Blob(chunksRef.current, {
              type: recorder.mimeType || mimeType || 'audio/webm'
            })
            const buffer = new Uint8Array(await blob.arrayBuffer())
            await dependencies.submitMixedAudio?.({
              mimeType: blob.type || 'audio/webm',
              buffer,
              durationMs: graph ? stoppedAt - graph.startedAt : durationMs,
              sizeBytes: buffer.byteLength
            })
          } catch (submitError) {
            await fail(
              submitError instanceof Error ? submitError.message : 'Failed to submit meeting audio.'
            )
            return
          } finally {
            clearTimer()
            cleanupGraph()
          }

          setDurationMs(0)
          setStartedAt(null)
          setStreams({
            microphone: { active: false, lastChunkAt: null },
            system: { active: false, lastChunkAt: null }
          })
          setCaptureStatus('idle')
        }

        const processors = [
          connectPcmProcessor({
            audioContext,
            source: microphoneSource,
            streamId: 'microphone',
            silentGain
          }),
          connectPcmProcessor({
            audioContext,
            source: systemSource,
            streamId: 'system',
            silentGain
          })
        ]
        const captureStartedAt = now()

        graphRef.current = {
          audioContext,
          microphoneStream,
          systemStream,
          mixedDestination,
          recorder,
          processors,
          sources: [microphoneSource, systemSource],
          silentGain,
          startedAt: captureStartedAt
        }

        recorder.start(250)
        setStartedAt(captureStartedAt)
        setDurationMs(0)
        timerRef.current = window.setInterval(() => {
          setDurationMs(now() - captureStartedAt)
        }, 250)
        setStreams({
          microphone: { active: true, lastChunkAt: null },
          system: { active: true, lastChunkAt: null }
        })
        setCaptureStatus('recording')
        return true
      } catch (startError) {
        stopStream(microphoneStream)
        stopAudioTracks(systemStream)
        await fail(
          startError instanceof Error ? startError.message : 'Unable to start meeting capture.'
        )
        return false
      }
    },
    [
      cleanupGraph,
      clearTimer,
      connectPcmProcessor,
      dependencies,
      durationMs,
      fail,
      mimeType,
      now,
      setCaptureStatus
    ]
  )

  const stop = useCallback(async (): Promise<boolean> => {
    const graph = graphRef.current
    if (!graph || statusRef.current !== 'recording') {
      return false
    }

    setCaptureStatus('processing')
    graph.recorder.stop()
    return true
  }, [setCaptureStatus])

  return {
    status,
    error,
    startedAt,
    durationMs,
    streams,
    transcriptItems,
    setTranscriptItems,
    start,
    stop,
    fail
  }
}
