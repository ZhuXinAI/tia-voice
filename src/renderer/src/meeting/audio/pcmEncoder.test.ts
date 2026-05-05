import { describe, expect, it } from 'vitest'

import {
  chunkPcm16,
  downmixToMono,
  encodeChannelsToPcm16,
  encodeChannelsToPcm16Chunks,
  encodePcm16,
  resampleLinear
} from './pcmEncoder'

function readPcmSample(bytes: Uint8Array, sampleIndex: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt16(
    sampleIndex * 2,
    true
  )
}

describe('pcmEncoder', () => {
  it('converts float samples to signed 16-bit little-endian PCM', () => {
    const pcm = encodePcm16(new Float32Array([-1, 0, 1]))

    expect(readPcmSample(pcm, 0)).toBe(-32768)
    expect(readPcmSample(pcm, 1)).toBe(0)
    expect(readPcmSample(pcm, 2)).toBe(32767)
  })

  it('downmixes multiple channels to mono', () => {
    const mono = downmixToMono([new Float32Array([1, 0.5, 0]), new Float32Array([-1, 0.5, 1])])

    expect(Array.from(mono)).toEqual([0, 0.5, 0.5])
  })

  it('resamples 48 kHz input to 16 kHz output', () => {
    const source = new Float32Array(480)
    const resampled = resampleLinear(source, 48000, 16000)

    expect(resampled).toHaveLength(160)
  })

  it('encodes channel input with downmixing and resampling', () => {
    const pcm = encodeChannelsToPcm16({
      channels: [new Float32Array(480), new Float32Array(480)],
      sourceSampleRate: 48000,
      targetSampleRate: 16000
    })

    expect(pcm).toHaveLength(160 * 2)
  })

  it('emits chunks close to 100ms at 16 kHz', () => {
    const pcm = new Uint8Array(16000 * 2)
    const chunks = chunkPcm16(pcm, 16000, 100)

    expect(chunks).toHaveLength(10)
    expect(chunks[0]).toHaveLength(3200)
  })

  it('encodes input into 100ms PCM chunks', () => {
    const chunks = encodeChannelsToPcm16Chunks({
      channels: [new Float32Array(4800)],
      sourceSampleRate: 48000,
      targetSampleRate: 16000
    })

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(3200)
  })
})
