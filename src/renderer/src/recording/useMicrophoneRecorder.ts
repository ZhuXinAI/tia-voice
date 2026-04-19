import { useCallback, useMemo, useRef, useState } from 'react'

export type RecordingArtifact = {
  mimeType: string
  buffer: Uint8Array
  durationMs: number
  sizeBytes?: number
}

export type RecorderStatus = 'idle' | 'recording' | 'stopping' | 'error'

export function createRecorderState() {
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
}) {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number>(0)
  const mimeType = useMemo(resolveMimeType, [])

  const cleanupStream = useCallback((activeStream: MediaStream | null) => {
    activeStream?.getTracks().forEach((track) => track.stop())
    setStream(null)
  }, [])

  const stop = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return
    }

    setStatus('stopping')
    recorder.stop()
  }, [])

  const start = useCallback(async () => {
    if (recorderRef.current?.state === 'recording') {
      return
    }

    try {
      setError(null)
      const liveStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setStream(liveStream)
      chunksRef.current = []
      startedAtRef.current = Date.now()

      const recorder = mimeType ? new MediaRecorder(liveStream, { mimeType }) : new MediaRecorder(liveStream)
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setStatus('error')
        setError('Microphone recorder failed.')
        cleanupStream(liveStream)
      }

      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' })
          const buffer = new Uint8Array(await blob.arrayBuffer())

          if (buffer.byteLength > 0) {
            await input.onComplete({
              mimeType: blob.type || 'audio/webm',
              buffer,
              durationMs: Date.now() - startedAtRef.current,
              sizeBytes: buffer.byteLength
            })
          }

          setStatus('idle')
        } catch (submitError) {
          setStatus('error')
          setError(submitError instanceof Error ? submitError.message : 'Failed to submit recording.')
        } finally {
          cleanupStream(liveStream)
          recorderRef.current = null
          chunksRef.current = []
        }
      }

      recorder.start(120)
      setStatus('recording')
    } catch (startError) {
      setStatus('error')
      setError(startError instanceof Error ? startError.message : 'Microphone permission failed.')
    }
  }, [cleanupStream, input, mimeType])

  return {
    error,
    status,
    stream,
    start,
    stop
  }
}
