import { useCallback, useRef, useState } from 'react'

import { encodeChannelsToPcm16Chunks } from '../meeting/audio/pcmEncoder'

export type SystemAudioCaptureStatus = 'idle' | 'starting' | 'capturing' | 'error'

export type SystemAudioCaptureDependencies = {
  mediaDevices?: Pick<MediaDevices, 'getDisplayMedia'>
  createAudioContext?: () => AudioContext
  now?: () => number
  onPcmChunk?: (input: { chunk: Uint8Array; capturedAt: number }) => Promise<void> | void
  onFailure?: (detail: string) => Promise<void> | void
}

export type SystemAudioCaptureController = {
  status: SystemAudioCaptureStatus
  error: string | null
  lastChunkAt: number | null
  start(): Promise<boolean>
  stop(): void
}

type SystemAudioGraph = {
  audioContext: AudioContext
  stream: MediaStream
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  silentGain: GainNode
}

function getDefaultMediaDevices(): SystemAudioCaptureDependencies['mediaDevices'] {
  return navigator.mediaDevices as SystemAudioCaptureDependencies['mediaDevices']
}

function createDefaultAudioContext(): AudioContext {
  return new AudioContext()
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

export function useSystemAudioCapture(
  dependencies: SystemAudioCaptureDependencies = {}
): SystemAudioCaptureController {
  const [status, setStatus] = useState<SystemAudioCaptureStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastChunkAt, setLastChunkAt] = useState<number | null>(null)
  const graphRef = useRef<SystemAudioGraph | null>(null)
  const statusRef = useRef<SystemAudioCaptureStatus>('idle')
  const now = dependencies.now ?? Date.now

  const setCaptureStatus = useCallback((nextStatus: SystemAudioCaptureStatus) => {
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  const stop = useCallback(() => {
    const graph = graphRef.current
    graphRef.current = null

    if (!graph) {
      setCaptureStatus('idle')
      setLastChunkAt(null)
      return
    }

    graph.processor.disconnect()
    graph.source.disconnect()
    graph.silentGain.disconnect()
    stopStream(graph.stream)
    void graph.audioContext.close()
    setCaptureStatus('idle')
    setLastChunkAt(null)
  }, [setCaptureStatus])

  const fail = useCallback(
    async (detail: string): Promise<boolean> => {
      stop()
      setError(detail)
      setCaptureStatus('error')
      await dependencies.onFailure?.(detail)
      return false
    },
    [dependencies, setCaptureStatus, stop]
  )

  const start = useCallback(async (): Promise<boolean> => {
    if (statusRef.current !== 'idle' && statusRef.current !== 'error') {
      return false
    }

    const mediaDevices = dependencies.mediaDevices ?? getDefaultMediaDevices()
    if (!mediaDevices?.getDisplayMedia) {
      return fail('System audio capture is not available in this window.')
    }

    setCaptureStatus('starting')
    setError(null)

    let stream: MediaStream | null = null

    try {
      stream = await mediaDevices.getDisplayMedia({
        audio: true,
        video: {
          width: 1,
          height: 1,
          frameRate: 1
        }
      })
      stream.getVideoTracks().forEach((track) => track.stop())

      if (stream.getAudioTracks().length === 0) {
        throw new Error('System audio was not available for Live Caption.')
      }

      const audioContext = dependencies.createAudioContext?.() ?? createDefaultAudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const silentGain = audioContext.createGain()
      silentGain.gain.value = 0
      silentGain.connect(audioContext.destination)

      const processor = audioContext.createScriptProcessor(4096, 2, 1)
      processor.onaudioprocess = (event) => {
        const capturedAt = now()
        const chunks = encodeChannelsToPcm16Chunks({
          channels: cloneChannelData(event.inputBuffer),
          sourceSampleRate: audioContext.sampleRate
        })

        for (const chunk of chunks) {
          void dependencies.onPcmChunk?.({ chunk, capturedAt })
        }

        if (chunks.length > 0) {
          setLastChunkAt(capturedAt)
        }
      }

      source.connect(processor)
      processor.connect(silentGain)
      graphRef.current = {
        audioContext,
        stream,
        source,
        processor,
        silentGain
      }
      setCaptureStatus('capturing')
      return true
    } catch (startError) {
      stopAudioTracks(stream)
      return fail(startError instanceof Error ? startError.message : 'Unable to capture audio.')
    }
  }, [dependencies, fail, now, setCaptureStatus])

  return {
    status,
    error,
    lastChunkAt,
    start,
    stop
  }
}
