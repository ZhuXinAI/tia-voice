import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createRecorderState, useMicrophoneRecorder } from './useMicrophoneRecorder'

describe('createRecorderState', () => {
  it('transitions from idle to recording to completed', () => {
    const state = createRecorderState()
    state.start()
    state.stop()
    expect(state.status()).toBe('completed')
  })
})

describe('useMicrophoneRecorder', () => {
  it('does not start a new recording while the previous one is still stopping', async () => {
    const mediaStream = {
      getTracks: () => [{ stop: vi.fn() }]
    } as unknown as MediaStream
    const getUserMedia = vi.fn().mockResolvedValue(mediaStream)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    })

    const recorders: Array<{
      emitChunk: (blob?: Blob) => void
      flushStop: () => Promise<void>
    }> = []

    class FakeMediaRecorder {
      static isTypeSupported(): boolean {
        return true
      }

      mimeType: string
      state: 'inactive' | 'recording' = 'inactive'
      ondataavailable: ((event: BlobEvent) => void) | null = null
      onerror: (() => void) | null = null
      onstop: (() => void | Promise<void>) | null = null

      constructor(_stream: MediaStream, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? 'audio/webm'
        recorders.push({
          emitChunk: (blob = new Blob(['first'], { type: this.mimeType })) => {
            this.ondataavailable?.({ data: blob } as BlobEvent)
          },
          flushStop: async () => {
            await this.onstop?.()
          }
        })
      }

      start(): void {
        this.state = 'recording'
      }

      stop(): void {
        this.state = 'inactive'
      }
    }

    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const onComplete = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useMicrophoneRecorder({
        onComplete
      })
    )

    await act(async () => {
      await expect(result.current.start()).resolves.toBe(true)
    })

    recorders[0].emitChunk()

    await act(async () => {
      await expect(result.current.stop()).resolves.toBe(true)
    })

    await waitFor(() => {
      expect(result.current.status).toBe('stopping')
    })

    await act(async () => {
      await expect(result.current.start()).resolves.toBe(false)
    })

    expect(getUserMedia).toHaveBeenCalledOnce()

    await act(async () => {
      await recorders[0].flushStop()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('idle')
    })
    expect(onComplete).toHaveBeenCalledOnce()
  })
})
