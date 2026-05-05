import { RealTimeVAD, type RealTimeVADOptions } from '@ericedouard/vad-node-realtime'

export type RealtimeVadEngine = {
  start(): void
  processAudio(audioData: Float32Array): Promise<void>
  flush(): Promise<void>
  destroy(): void
}

export type RealtimeVadAudioGate = {
  start(): Promise<void>
  processPcm16Chunk(chunk: Uint8Array): void
  flush(): Promise<void>
  destroy(): void
}

export type RealtimeVadAudioGateOptions = {
  sampleRate?: number
  preRollMs?: number
  vadOptions?: Partial<RealTimeVADOptions>
  createVad?: (options: Partial<RealTimeVADOptions>) => Promise<RealtimeVadEngine>
  onSpeechChunk(chunk: Uint8Array): void
  onError?(error: Error): void
}

const DEFAULT_SAMPLE_RATE = 16000
const DEFAULT_PRE_ROLL_MS = 600
const BYTES_PER_PCM16_SAMPLE = 2

function pcm16ToFloat32(chunk: Uint8Array): Float32Array {
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  const samples = new Float32Array(Math.floor(chunk.byteLength / BYTES_PER_PCM16_SAMPLE))

  for (let index = 0; index < samples.length; index += 1) {
    const value = view.getInt16(index * BYTES_PER_PCM16_SAMPLE, true)
    samples[index] = value < 0 ? value / 0x8000 : value / 0x7fff
  }

  return samples
}

function getChunkByteLength(chunks: Uint8Array[]): number {
  return chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

async function createDefaultVad(options: Partial<RealTimeVADOptions>): Promise<RealtimeVadEngine> {
  return RealTimeVAD.new(options)
}

export function createRealtimeVadAudioGate(
  input: RealtimeVadAudioGateOptions
): RealtimeVadAudioGate {
  const sampleRate = input.sampleRate ?? DEFAULT_SAMPLE_RATE
  const preRollMs = input.preRollMs ?? DEFAULT_PRE_ROLL_MS
  const maxPreRollBytes = Math.max(
    BYTES_PER_PCM16_SAMPLE,
    Math.round((sampleRate * preRollMs * BYTES_PER_PCM16_SAMPLE) / 1000)
  )
  const createVad = input.createVad ?? createDefaultVad

  let vad: RealtimeVadEngine | null = null
  let startPromise: Promise<void> | null = null
  let processingChain = Promise.resolve()
  let preRollChunks: Uint8Array[] = []
  let speechActive = false
  let destroyed = false

  function emitPendingSpeech(): void {
    const chunks = preRollChunks
    preRollChunks = []

    for (const chunk of chunks) {
      input.onSpeechChunk(chunk)
    }
  }

  function trimPreRoll(): void {
    while (getChunkByteLength(preRollChunks) > maxPreRollBytes) {
      preRollChunks.shift()
    }
  }

  function handleError(error: unknown): void {
    input.onError?.(normalizeError(error))
  }

  function ensureStarted(): Promise<void> {
    if (startPromise) {
      return startPromise
    }

    startPromise = createVad({
      ...input.vadOptions,
      sampleRate,
      onSpeechStart: () => {
        // The detector has seen possible speech; wait for real start to avoid misfires.
      },
      onSpeechRealStart: () => {
        speechActive = true
        emitPendingSpeech()
      },
      onSpeechEnd: () => {
        speechActive = false
        preRollChunks = []
      },
      onVADMisfire: () => {
        speechActive = false
        preRollChunks = []
      }
    }).then((createdVad) => {
      if (destroyed) {
        createdVad.destroy()
        return
      }

      vad = createdVad
      vad.start()
    })

    return startPromise
  }

  function enqueueWork(work: () => Promise<void>): void {
    processingChain = processingChain.then(work).catch((error) => {
      handleError(error)
    })
  }

  return {
    start() {
      return ensureStarted()
    },

    processPcm16Chunk(chunk) {
      const audioChunk = Uint8Array.from(chunk)

      enqueueWork(async () => {
        await ensureStarted()

        if (destroyed || !vad) {
          return
        }

        preRollChunks.push(audioChunk)
        trimPreRoll()
        await vad.processAudio(pcm16ToFloat32(audioChunk))

        if (speechActive) {
          emitPendingSpeech()
        }
      })
    },

    async flush() {
      await ensureStarted()
      await processingChain

      if (destroyed || !vad) {
        return
      }

      await vad.flush()
      await processingChain
    },

    destroy() {
      if (destroyed) {
        return
      }

      destroyed = true
      preRollChunks = []
      speechActive = false
      vad?.destroy()
      vad = null
    }
  }
}
