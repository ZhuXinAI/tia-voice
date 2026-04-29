import { useCallback, useMemo, useRef, useState } from 'react'

export type RecordingArtifact = {
  mimeType: string
  buffer: Uint8Array
  durationMs: number
  sizeBytes?: number
}

export type RecorderStatus = 'idle' | 'recording' | 'stopping' | 'error'
export type RecorderState = {
  start(): void
  stop(): void
  status(): RecorderStatus | 'completed'
}
export type MicrophoneRecorder = {
  error: string | null
  status: RecorderStatus
  stream: MediaStream | null
  cancel(): Promise<boolean>
  start(deviceId?: string | null): Promise<boolean>
  stop(): Promise<boolean>
}

export function createRecorderState(): RecorderState {
  let currentStatus: RecorderStatus | 'completed' = 'idle'

  return {
    start() {
      currentStatus = 'recording'
    },
    stop() {
      currentStatus = 'completed'
    },
    status() {
      return currentStatus
    }
  }
}

function resolveMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }

  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
}

export function useMicrophoneRecorder(input: {
  onComplete: (artifact: RecordingArtifact) => Promise<void> | void
}): MicrophoneRecorder {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const statusRef = useRef<RecorderStatus>('idle')
  const discardOnStopRef = useRef(false)
  const mimeType = useMemo(resolveMimeType, [])

  const setRecorderStatus = useCallback((nextStatus: RecorderStatus) => {
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  const cleanupStream = useCallback((activeStream: MediaStream | null) => {
    activeStream?.getTracks().forEach((track) => track.stop())
    setStream(null)
  }, [])

  const stop = useCallback(async (): Promise<boolean> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return false
    }

    setRecorderStatus('stopping')
    recorder.stop()
    return true
  }, [setRecorderStatus])

  const cancel = useCallback(async (): Promise<boolean> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return false
    }

    discardOnStopRef.current = true
    setRecorderStatus('stopping')
    recorder.stop()
    return true
  }, [setRecorderStatus])

  const start = useCallback(
    async (deviceId?: string | null): Promise<boolean> => {
      if (statusRef.current !== 'idle' || recorderRef.current) {
        return false
      }

      let liveStream: MediaStream | null = null

      try {
        setRecorderStatus('recording')
        setError(null)
        try {
          liveStream = await navigator.mediaDevices.getUserMedia(
            deviceId
              ? {
                  audio: {
                    deviceId: {
                      exact: deviceId
                    }
                  }
                }
              : { audio: true }
          )
        } catch (error) {
          if (!deviceId) {
            throw error
          }

          liveStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        }
        setStream(liveStream)

        const recordingChunks: Blob[] = []
        const recordingStartedAt = Date.now()

        const recorder = mimeType
          ? new MediaRecorder(liveStream, { mimeType })
          : new MediaRecorder(liveStream)
        recorderRef.current = recorder

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordingChunks.push(event.data)
          }
        }

        recorder.onerror = () => {
          setRecorderStatus('error')
          setError('Microphone recorder failed.')
          cleanupStream(liveStream)
          if (recorderRef.current === recorder) {
            recorderRef.current = null
          }
        }

        recorder.onstop = async () => {
          try {
            if (discardOnStopRef.current) {
              discardOnStopRef.current = false
              setRecorderStatus('idle')
              return
            }

            const blob = new Blob(recordingChunks, {
              type: recorder.mimeType || mimeType || 'audio/webm'
            })
            const buffer = new Uint8Array(await blob.arrayBuffer())

            if (buffer.byteLength > 0) {
              await input.onComplete({
                mimeType: blob.type || 'audio/webm',
                buffer,
                durationMs: Date.now() - recordingStartedAt,
                sizeBytes: buffer.byteLength
              })
            }

            setRecorderStatus('idle')
          } catch (submitError) {
            setRecorderStatus('error')
            setError(
              submitError instanceof Error ? submitError.message : 'Failed to submit recording.'
            )
          } finally {
            cleanupStream(liveStream)
            if (recorderRef.current === recorder) {
              recorderRef.current = null
            }
          }
        }

        recorder.start(120)
        return true
      } catch (startError) {
        setRecorderStatus('error')
        setError(startError instanceof Error ? startError.message : 'Microphone permission failed.')
        recorderRef.current = null
        discardOnStopRef.current = false
        cleanupStream(liveStream)
        return false
      }
    },
    [cleanupStream, input, mimeType, setRecorderStatus]
  )

  return {
    error,
    status,
    stream,
    cancel,
    start,
    stop
  }
}
