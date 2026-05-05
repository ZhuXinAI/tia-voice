export type PcmEncodeInput = {
  channels: Float32Array[]
  sourceSampleRate: number
  targetSampleRate?: number
}

const DEFAULT_TARGET_SAMPLE_RATE = 16000
const DEFAULT_CHUNK_MS = 100

function clampSample(sample: number): number {
  if (sample < -1) {
    return -1
  }

  if (sample > 1) {
    return 1
  }

  return sample
}

export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array()
  }

  if (channels.length === 1) {
    return new Float32Array(channels[0])
  }

  const frameCount = Math.max(...channels.map((channel) => channel.length))
  const mono = new Float32Array(frameCount)

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let total = 0
    let count = 0

    for (const channel of channels) {
      if (frameIndex >= channel.length) {
        continue
      }

      total += channel[frameIndex]
      count += 1
    }

    mono[frameIndex] = count > 0 ? total / count : 0
  }

  return mono
}

export function resampleLinear(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = DEFAULT_TARGET_SAMPLE_RATE
): Float32Array {
  if (samples.length === 0) {
    return new Float32Array()
  }

  if (sourceSampleRate === targetSampleRate) {
    return new Float32Array(samples)
  }

  if (sourceSampleRate <= 0 || targetSampleRate <= 0) {
    throw new Error('Sample rates must be positive numbers.')
  }

  const ratio = sourceSampleRate / targetSampleRate
  const outputLength = Math.max(1, Math.round(samples.length / ratio))
  const output = new Float32Array(outputLength)

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourceIndex = outputIndex * ratio
    const lowerIndex = Math.floor(sourceIndex)
    const upperIndex = Math.min(samples.length - 1, lowerIndex + 1)
    const weight = sourceIndex - lowerIndex
    const lower = samples[lowerIndex] ?? 0
    const upper = samples[upperIndex] ?? lower
    output[outputIndex] = lower + (upper - lower) * weight
  }

  return output
}

export function encodePcm16(samples: Float32Array): Uint8Array {
  const output = new Uint8Array(samples.length * 2)
  const view = new DataView(output.buffer)

  for (let index = 0; index < samples.length; index += 1) {
    const sample = clampSample(samples[index])
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    view.setInt16(index * 2, Math.round(value), true)
  }

  return output
}

export function encodeChannelsToPcm16(input: PcmEncodeInput): Uint8Array {
  const targetSampleRate = input.targetSampleRate ?? DEFAULT_TARGET_SAMPLE_RATE
  const mono = downmixToMono(input.channels)
  const resampled = resampleLinear(mono, input.sourceSampleRate, targetSampleRate)
  return encodePcm16(resampled)
}

export function chunkPcm16(
  pcm: Uint8Array,
  sampleRate = DEFAULT_TARGET_SAMPLE_RATE,
  chunkMs = DEFAULT_CHUNK_MS
): Uint8Array[] {
  const bytesPerSample = 2
  const bytesPerChunk = Math.max(2, Math.round((sampleRate * chunkMs * bytesPerSample) / 1000))
  const chunks: Uint8Array[] = []

  for (let offset = 0; offset < pcm.byteLength; offset += bytesPerChunk) {
    chunks.push(pcm.slice(offset, Math.min(pcm.byteLength, offset + bytesPerChunk)))
  }

  return chunks
}

export function encodeChannelsToPcm16Chunks(
  input: PcmEncodeInput & { chunkMs?: number }
): Uint8Array[] {
  const targetSampleRate = input.targetSampleRate ?? DEFAULT_TARGET_SAMPLE_RATE
  return chunkPcm16(
    encodeChannelsToPcm16(input),
    targetSampleRate,
    input.chunkMs ?? DEFAULT_CHUNK_MS
  )
}
