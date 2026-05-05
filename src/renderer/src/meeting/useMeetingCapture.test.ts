import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useMeetingCapture, type MeetingCaptureDependencies } from './useMeetingCapture'

class FakeTrack {
  stop = vi.fn()
}

class FakeMediaStream {
  constructor(
    private readonly audioTracks: FakeTrack[] = [new FakeTrack()],
    private readonly videoTracks: FakeTrack[] = []
  ) {}

  getTracks(): FakeTrack[] {
    return [...this.audioTracks, ...this.videoTracks]
  }

  getAudioTracks(): FakeTrack[] {
    return this.audioTracks
  }

  getVideoTracks(): FakeTrack[] {
    return this.videoTracks
  }
}

class FakeAudioProcessEvent {
  inputBuffer: AudioBuffer

  constructor(samples: Float32Array<ArrayBufferLike> = new Float32Array(4800)) {
    this.inputBuffer = {
      numberOfChannels: 1,
      getChannelData: () => samples
    } as unknown as AudioBuffer
  }
}

class FakeAudioNode {
  connect = vi.fn()
  disconnect = vi.fn()
}

class FakeScriptProcessor extends FakeAudioNode {
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null = null

  emit(samples?: Float32Array): void {
    this.onaudioprocess?.(new FakeAudioProcessEvent(samples) as unknown as AudioProcessingEvent)
  }
}

class FakeAudioContext {
  sampleRate = 48000
  destination = new FakeAudioNode() as unknown as AudioDestinationNode
  processors: FakeScriptProcessor[] = []
  close = vi.fn().mockResolvedValue(undefined)

  createMediaStreamSource(): MediaStreamAudioSourceNode {
    return new FakeAudioNode() as unknown as MediaStreamAudioSourceNode
  }

  createMediaStreamDestination(): MediaStreamAudioDestinationNode {
    return {
      ...new FakeAudioNode(),
      stream: new FakeMediaStream() as unknown as MediaStream
    } as unknown as MediaStreamAudioDestinationNode
  }

  createGain(): GainNode {
    return {
      ...new FakeAudioNode(),
      gain: {
        value: 1
      }
    } as unknown as GainNode
  }

  createScriptProcessor(): ScriptProcessorNode {
    const processor = new FakeScriptProcessor()
    this.processors.push(processor)
    return processor as unknown as ScriptProcessorNode
  }
}

class FakeMediaRecorder {
  static isTypeSupported(): boolean {
    return true
  }

  mimeType = 'audio/webm;codecs=opus'
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onerror: (() => void) | null = null
  onstop: (() => void | Promise<void>) | null = null

  start = vi.fn(() => {
    this.state = 'recording'
  })

  stop = vi.fn(() => {
    this.state = 'inactive'
    this.ondataavailable?.({
      data: new Blob(['meeting audio'], { type: this.mimeType })
    } as BlobEvent)
    void this.onstop?.()
  })
}

describe('useMeetingCapture', () => {
  it('captures microphone, system audio, PCM chunks, and mixed audio', async () => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const microphoneAudioTrack = new FakeTrack()
    const systemAudioTrack = new FakeTrack()
    const systemVideoTrack = new FakeTrack()
    const microphoneStream = new FakeMediaStream([microphoneAudioTrack])
    const systemStream = new FakeMediaStream([systemAudioTrack], [systemVideoTrack])
    const getUserMedia = vi.fn().mockResolvedValue(microphoneStream)
    const getDisplayMedia = vi.fn().mockResolvedValue(systemStream)
    const audioContext = new FakeAudioContext()
    const sendPcmChunk = vi.fn()
    const submitMixedAudio = vi.fn().mockResolvedValue(undefined)
    const dependencies: MeetingCaptureDependencies = {
      mediaDevices: {
        getUserMedia,
        getDisplayMedia
      } as unknown as MeetingCaptureDependencies['mediaDevices'],
      createAudioContext: () => audioContext as unknown as AudioContext,
      createMediaRecorder: () => new FakeMediaRecorder() as unknown as MediaRecorder,
      now: vi.fn(() => 2000),
      sendPcmChunk,
      submitMixedAudio
    }

    const { result } = renderHook(() => useMeetingCapture(dependencies))

    await act(async () => {
      await expect(result.current.start({ deviceId: 'mic-1' })).resolves.toBe(true)
    })

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: {
          exact: 'mic-1'
        }
      }
    })
    expect(getDisplayMedia).toHaveBeenCalledWith({
      audio: true,
      video: {
        width: 1,
        height: 1,
        frameRate: 1
      }
    })
    expect(systemVideoTrack.stop).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('recording')

    act(() => {
      audioContext.processors[0].emit()
      audioContext.processors[1].emit()
    })

    expect(sendPcmChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        streamId: 'microphone',
        chunk: expect.any(Uint8Array)
      })
    )
    expect(sendPcmChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        streamId: 'system',
        chunk: expect.any(Uint8Array)
      })
    )

    await act(async () => {
      await expect(result.current.stop()).resolves.toBe(true)
    })

    await waitFor(() => {
      expect(submitMixedAudio).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'audio/webm;codecs=opus',
          buffer: expect.any(Uint8Array)
        })
      )
    })
    expect(microphoneAudioTrack.stop).toHaveBeenCalledOnce()
    expect(systemAudioTrack.stop).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('idle')
  })

  it('reports a blocking error when system audio has no audio track', async () => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const microphoneTrack = new FakeTrack()
    const systemVideoTrack = new FakeTrack()
    const getUserMedia = vi.fn().mockResolvedValue(new FakeMediaStream([microphoneTrack]))
    const getDisplayMedia = vi.fn().mockResolvedValue(new FakeMediaStream([], [systemVideoTrack]))
    const reportFailure = vi.fn()

    const { result } = renderHook(() =>
      useMeetingCapture({
        mediaDevices: {
          getUserMedia,
          getDisplayMedia
        } as unknown as MeetingCaptureDependencies['mediaDevices'],
        reportFailure
      })
    )

    await act(async () => {
      await expect(result.current.start()).resolves.toBe(false)
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toMatch(/System audio/)
    expect(reportFailure).toHaveBeenCalledWith(expect.stringMatching(/System audio/))
    expect(microphoneTrack.stop).toHaveBeenCalledOnce()
    expect(systemVideoTrack.stop).toHaveBeenCalledOnce()
  })
})
