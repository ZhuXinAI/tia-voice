import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useSystemAudioCapture } from './useSystemAudioCapture'

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
  processor = new FakeScriptProcessor()
  close = vi.fn().mockResolvedValue(undefined)

  createMediaStreamSource(): MediaStreamAudioSourceNode {
    return new FakeAudioNode() as unknown as MediaStreamAudioSourceNode
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
    return this.processor as unknown as ScriptProcessorNode
  }
}

describe('useSystemAudioCapture', () => {
  it('captures system audio and emits PCM chunks', async () => {
    const audioTrack = new FakeTrack()
    const videoTrack = new FakeTrack()
    const stream = new FakeMediaStream([audioTrack], [videoTrack])
    const getDisplayMedia = vi.fn().mockResolvedValue(stream)
    const audioContext = new FakeAudioContext()
    const onPcmChunk = vi.fn()

    const { result } = renderHook(() =>
      useSystemAudioCapture({
        mediaDevices: {
          getDisplayMedia
        } as unknown as MediaDevices,
        createAudioContext: () => audioContext as unknown as AudioContext,
        now: () => 1234,
        onPcmChunk
      })
    )

    await act(async () => {
      await expect(result.current.start()).resolves.toBe(true)
    })

    expect(getDisplayMedia).toHaveBeenCalledWith({
      audio: true,
      video: {
        width: 1,
        height: 1,
        frameRate: 1
      }
    })
    expect(videoTrack.stop).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('capturing')

    act(() => {
      audioContext.processor.emit()
    })

    expect(onPcmChunk).toHaveBeenCalledWith({
      chunk: expect.any(Uint8Array),
      capturedAt: 1234
    })

    act(() => {
      result.current.stop()
    })

    expect(audioTrack.stop).toHaveBeenCalledOnce()
    expect(audioContext.close).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('idle')
  })

  it('reports a blocking error when no system audio track is present', async () => {
    const videoTrack = new FakeTrack()
    const getDisplayMedia = vi.fn().mockResolvedValue(new FakeMediaStream([], [videoTrack]))
    const onFailure = vi.fn()

    const { result } = renderHook(() =>
      useSystemAudioCapture({
        mediaDevices: {
          getDisplayMedia
        } as unknown as MediaDevices,
        onFailure
      })
    )

    await act(async () => {
      await expect(result.current.start()).resolves.toBe(false)
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toMatch(/System audio/)
    expect(onFailure).toHaveBeenCalledWith(expect.stringMatching(/System audio/))
    expect(videoTrack.stop).toHaveBeenCalledOnce()
  })
})
