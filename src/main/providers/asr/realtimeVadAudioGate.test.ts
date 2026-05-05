import { describe, expect, it, vi } from 'vitest'
import type { RealTimeVADOptions } from '@ericedouard/vad-node-realtime'

import {
  createRealtimeVadAudioGate,
  type RealtimeVadAudioGate,
  type RealtimeVadEngine
} from './realtimeVadAudioGate'

class MockRealtimeVad implements RealtimeVadEngine {
  started = false
  destroyed = false
  readonly processAudio = vi.fn(async (audioData: Float32Array) => {
    void audioData
  })
  readonly flush = vi.fn(async () => undefined)

  constructor(readonly options: Partial<RealTimeVADOptions>) {}

  start(): void {
    this.started = true
  }

  triggerSpeechRealStart(): void {
    this.options.onSpeechRealStart?.()
  }

  triggerSpeechEnd(): void {
    this.options.onSpeechEnd?.(new Float32Array())
  }

  destroy(): void {
    this.destroyed = true
  }
}

function createPcm16Chunk(values: number[]): Uint8Array {
  const output = new Uint8Array(values.length * 2)
  const view = new DataView(output.buffer)

  values.forEach((value, index) => {
    view.setInt16(index * 2, value, true)
  })

  return output
}

function setup(): {
  gate: RealtimeVadAudioGate
  getVad: () => MockRealtimeVad
  onSpeechChunk: ReturnType<typeof vi.fn>
} {
  let vad: MockRealtimeVad | null = null
  const onSpeechChunk = vi.fn()
  const gate = createRealtimeVadAudioGate({
    sampleRate: 16000,
    createVad: async (options) => {
      vad = new MockRealtimeVad(options)
      return vad
    },
    onSpeechChunk
  })

  return {
    gate,
    getVad: () => {
      if (!vad) {
        throw new Error('Expected VAD to be created')
      }

      return vad
    },
    onSpeechChunk
  }
}

describe('createRealtimeVadAudioGate', () => {
  it('converts PCM16 chunks for the node VAD without sending silence', async () => {
    const { gate, getVad, onSpeechChunk } = setup()
    const chunk = createPcm16Chunk([-32768, 0, 32767])

    await gate.start()
    gate.processPcm16Chunk(chunk)
    await gate.flush()

    const vad = getVad()
    const samples = vad.processAudio.mock.calls[0]?.[0]
    expect(vad.started).toBe(true)
    expect(samples?.[0]).toBeCloseTo(-1)
    expect(samples?.[1]).toBe(0)
    expect(samples?.[2]).toBeCloseTo(1)
    expect(onSpeechChunk).not.toHaveBeenCalled()
  })

  it('flushes buffered pre-roll when real speech starts', async () => {
    const { gate, getVad, onSpeechChunk } = setup()
    const firstChunk = createPcm16Chunk([100])
    const secondChunk = createPcm16Chunk([200])

    await gate.start()
    getVad().processAudio.mockImplementationOnce(async () => undefined)
    getVad().processAudio.mockImplementationOnce(async () => {
      getVad().triggerSpeechRealStart()
    })

    gate.processPcm16Chunk(firstChunk)
    gate.processPcm16Chunk(secondChunk)
    await gate.flush()

    expect(onSpeechChunk).toHaveBeenNthCalledWith(1, firstChunk)
    expect(onSpeechChunk).toHaveBeenNthCalledWith(2, secondChunk)
  })

  it('stops forwarding chunks after speech ends', async () => {
    const { gate, getVad, onSpeechChunk } = setup()
    const speechChunk = createPcm16Chunk([300])
    const trailingChunk = createPcm16Chunk([0])
    const silentChunk = createPcm16Chunk([0])

    await gate.start()
    getVad().processAudio.mockImplementationOnce(async () => {
      getVad().triggerSpeechRealStart()
    })
    getVad().processAudio.mockImplementationOnce(async () => {
      getVad().triggerSpeechEnd()
    })

    gate.processPcm16Chunk(speechChunk)
    gate.processPcm16Chunk(trailingChunk)
    gate.processPcm16Chunk(silentChunk)
    await gate.flush()

    expect(onSpeechChunk).toHaveBeenCalledTimes(1)
    expect(onSpeechChunk).toHaveBeenCalledWith(speechChunk)
  })

  it('destroys the underlying VAD engine', async () => {
    const { gate, getVad } = setup()

    await gate.start()
    const vad = getVad()
    gate.destroy()

    expect(vad.destroyed).toBe(true)
  })
})
