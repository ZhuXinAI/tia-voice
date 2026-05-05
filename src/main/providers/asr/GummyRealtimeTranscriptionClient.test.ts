import { describe, expect, it, vi } from 'vitest'
import type { RawData } from 'ws'

import {
  createGummyRealtimeTranscriptionClient,
  type GummyRealtimeTranscriptionClient
} from './GummyRealtimeTranscriptionClient'
import type { RealtimeVadAudioGate, RealtimeVadAudioGateOptions } from './realtimeVadAudioGate'

type Listener = (() => void) | ((data: RawData) => void) | ((error: Error) => void)
type DecodedFrame = {
  header: {
    action?: string
    event?: string
    task_id?: string
    streaming?: string
    attributes?: Record<string, unknown>
  }
  payload?: unknown
}
type Deferred = {
  promise: Promise<void>
  resolve(): void
  reject(error: unknown): void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

class MockWebSocket {
  static instances: MockWebSocket[] = []

  readonly sent: Array<string | Uint8Array> = []
  readonly listeners = new Map<string, Listener[]>()
  closed = false
  terminated = false

  constructor(
    readonly url: string,
    readonly options: { headers?: Record<string, string> }
  ) {
    MockWebSocket.instances.push(this)
  }

  on(event: 'open', listener: () => void): this
  on(event: 'message', listener: (data: RawData) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'close', listener: () => void): this
  on(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? []
    listeners.push(listener)
    this.listeners.set(event, listeners)
    return this
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
  }

  terminate(): void {
    this.terminated = true
  }

  open(): void {
    this.emit('open')
  }

  serverMessage(message: unknown): void {
    this.emit('message', JSON.stringify(message))
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      const invoke = listener as (...args: unknown[]) => void
      invoke(...args)
    }
  }
}

function createClient(input?: {
  onTranscript?: (input: {
    sentenceId: number
    beginMs: number
    endMs: number
    text: string
    final: boolean
    translatedText?: string | null
    translationLanguage?: string | null
    translationFinal?: boolean
  }) => void
  sourceLanguage?: 'auto' | 'en' | 'zh'
  targetLanguage?: 'en' | 'zh' | null
  vadGateFactory?: (options: RealtimeVadAudioGateOptions) => RealtimeVadAudioGate
}): GummyRealtimeTranscriptionClient {
  MockWebSocket.instances = []

  return createGummyRealtimeTranscriptionClient({
    apiKey: 'test-dashscope-key',
    sourceLanguage: input?.sourceLanguage,
    targetLanguage: input?.targetLanguage,
    taskIdFactory: () => 'test-task-id',
    WebSocketCtor: MockWebSocket,
    vadGateFactory: input?.vadGateFactory ?? createPassThroughVadGate,
    onTranscript: input?.onTranscript ?? vi.fn()
  })
}

function createPassThroughVadGate(options: RealtimeVadAudioGateOptions): RealtimeVadAudioGate {
  return {
    start: vi.fn(async () => undefined),
    processPcm16Chunk: vi.fn((chunk) => options.onSpeechChunk(Uint8Array.from(chunk))),
    flush: vi.fn(async () => undefined),
    destroy: vi.fn()
  }
}

function getSocket(): MockWebSocket {
  const socket = MockWebSocket.instances[0]
  if (!socket) {
    throw new Error('Expected a WebSocket instance')
  }

  return socket
}

function decodeFrame(frame: string | Uint8Array): DecodedFrame {
  expect(typeof frame).toBe('string')
  return JSON.parse(frame as string) as DecodedFrame
}

function taskStarted(): {
  header: {
    event: string
    task_id: string
    attributes: Record<string, never>
  }
  payload: Record<string, never>
} {
  return {
    header: {
      event: 'task-started',
      task_id: 'test-task-id',
      attributes: {}
    },
    payload: {}
  }
}

describe('createGummyRealtimeTranscriptionClient', () => {
  it('sends Authorization while connecting', async () => {
    const client = createClient()
    const started = client.start()
    const socket = getSocket()

    expect(socket.url).toBe('wss://dashscope.aliyuncs.com/api-ws/v1/inference')
    expect(socket.options.headers?.Authorization).toBe('Bearer test-dashscope-key')

    socket.open()
    socket.serverMessage(taskStarted())

    await expect(started).resolves.toBeUndefined()
  })

  it('sends a run-task text frame with the Gummy model and 16 kHz PCM parameters', async () => {
    const client = createClient()
    const started = client.start()
    const socket = getSocket()

    socket.open()

    const runTask = decodeFrame(socket.sent[0])
    expect(runTask).toMatchObject({
      header: {
        action: 'run-task',
        task_id: 'test-task-id',
        streaming: 'duplex'
      },
      payload: {
        model: 'gummy-realtime-v1',
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        input: {},
        parameters: {
          sample_rate: 16000,
          format: 'pcm',
          transcription_enabled: true,
          translation_enabled: false
        }
      }
    })

    socket.serverMessage(taskStarted())
    await started
  })

  it('sends source and target language parameters when translation is enabled', async () => {
    const client = createClient({
      sourceLanguage: 'zh',
      targetLanguage: 'en'
    })
    const started = client.start()
    const socket = getSocket()

    socket.open()

    const runTask = decodeFrame(socket.sent[0])
    expect(runTask).toMatchObject({
      payload: {
        parameters: {
          source_language: 'zh',
          translation_enabled: true,
          translation_target_languages: ['en']
        }
      }
    })

    socket.serverMessage(taskStarted())
    await started
  })

  it('omits source language when auto detection is selected', async () => {
    const client = createClient({
      sourceLanguage: 'auto',
      targetLanguage: null
    })
    const started = client.start()
    const socket = getSocket()

    socket.open()

    const runTask = decodeFrame(socket.sent[0])
    expect(
      (runTask.payload as { parameters: Record<string, unknown> }).parameters.source_language
    ).toBeUndefined()
    expect(
      (runTask.payload as { parameters: Record<string, unknown> }).parameters
        .translation_target_languages
    ).toBeUndefined()

    socket.serverMessage(taskStarted())
    await started
  })

  it('queues audio chunks until task-started', async () => {
    const client = createClient()
    const started = client.start()
    const socket = getSocket()
    const firstChunk = new Uint8Array([1, 2, 3])
    const secondChunk = new Uint8Array([4, 5, 6])

    client.sendAudioChunk(firstChunk)
    socket.open()
    client.sendAudioChunk(secondChunk)

    expect(socket.sent).toHaveLength(1)
    expect(decodeFrame(socket.sent[0]).header.action).toBe('run-task')

    socket.serverMessage(taskStarted())
    await started

    expect(socket.sent[1]).toEqual(firstChunk)
    expect(socket.sent[2]).toEqual(secondChunk)
  })

  it('runs chunks through the VAD gate before sending audio to Gummy', async () => {
    const gateOptionsRef: { current?: RealtimeVadAudioGateOptions } = {}
    const processPcm16Chunk = vi.fn()
    const client = createClient({
      vadGateFactory: (options) => {
        gateOptionsRef.current = options
        return {
          start: vi.fn(async () => undefined),
          processPcm16Chunk,
          flush: vi.fn(async () => undefined),
          destroy: vi.fn()
        }
      }
    })
    const started = client.start()
    const socket = getSocket()

    socket.open()
    socket.serverMessage(taskStarted())
    await started

    client.sendAudioChunk(new Uint8Array([1, 2, 3]))

    expect(processPcm16Chunk).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]))
    expect(socket.sent).toHaveLength(1)

    const resolvedGateOptions = gateOptionsRef.current
    if (!resolvedGateOptions) {
      throw new Error('Expected VAD gate options')
    }

    resolvedGateOptions.onSpeechChunk(new Uint8Array([4, 5, 6]))

    expect(socket.sent[1]).toEqual(new Uint8Array([4, 5, 6]))
  })

  it('flushes the VAD gate before finishing the Gummy task', async () => {
    const vadFlushed = createDeferred()
    const client = createClient({
      vadGateFactory: (options) => ({
        start: vi.fn(async () => undefined),
        processPcm16Chunk: vi.fn((chunk) => options.onSpeechChunk(Uint8Array.from(chunk))),
        flush: vi.fn(() => vadFlushed.promise),
        destroy: vi.fn()
      })
    })
    const started = client.start()
    const socket = getSocket()

    socket.open()
    socket.serverMessage(taskStarted())
    await started

    const finished = client.finish()
    await Promise.resolve()

    expect(socket.sent).toHaveLength(1)

    vadFlushed.resolve()
    await Promise.resolve()

    expect(decodeFrame(socket.sent[1]).header.action).toBe('finish-task')

    socket.serverMessage({
      header: { event: 'task-finished', task_id: 'test-task-id', attributes: {} },
      payload: { output: {}, usage: null }
    })

    await expect(finished).resolves.toBeUndefined()
  })

  it('emits interim transcript updates when sentence_end is false', async () => {
    const onTranscript = vi.fn()
    const client = createClient({ onTranscript })
    const started = client.start()
    const socket = getSocket()

    socket.open()
    socket.serverMessage(taskStarted())
    await started
    socket.serverMessage({
      header: { event: 'result-generated', task_id: 'test-task-id', attributes: {} },
      payload: {
        output: {
          transcription: {
            sentence_id: 7,
            begin_time: 120,
            end_time: 450,
            text: 'hello',
            sentence_end: false
          }
        }
      }
    })

    expect(onTranscript).toHaveBeenCalledWith({
      sentenceId: 7,
      beginMs: 120,
      endMs: 450,
      text: 'hello',
      final: false,
      translatedText: null,
      translationFinal: false,
      translationLanguage: null
    })
  })

  it('emits final transcript segments when sentence_end is true', async () => {
    const onTranscript = vi.fn()
    const client = createClient({ onTranscript })
    const started = client.start()
    const socket = getSocket()

    socket.open()
    socket.serverMessage(taskStarted())
    await started
    socket.serverMessage({
      header: { event: 'result-generated', task_id: 'test-task-id', attributes: {} },
      payload: {
        output: {
          transcription: {
            sentence_id: 8,
            begin_time: 500,
            end_time: 900,
            text: 'final line',
            sentence_end: true
          }
        }
      }
    })

    expect(onTranscript).toHaveBeenCalledWith({
      sentenceId: 8,
      beginMs: 500,
      endMs: 900,
      text: 'final line',
      final: true,
      translatedText: null,
      translationFinal: false,
      translationLanguage: null
    })
  })

  it('emits translated text when the server includes translation output', async () => {
    const onTranscript = vi.fn()
    const client = createClient({ onTranscript, sourceLanguage: 'zh', targetLanguage: 'en' })
    const started = client.start()
    const socket = getSocket()

    socket.open()
    socket.serverMessage(taskStarted())
    await started
    socket.serverMessage({
      header: { event: 'result-generated', task_id: 'test-task-id', attributes: {} },
      payload: {
        output: {
          transcription: {
            sentence_id: 9,
            begin_time: 900,
            end_time: 1300,
            text: '你好',
            sentence_end: true
          },
          translations: [
            {
              sentence_id: 9,
              begin_time: 900,
              end_time: 1300,
              text: 'hello',
              lang: 'en',
              sentence_end: true
            }
          ]
        }
      }
    })

    expect(onTranscript).toHaveBeenCalledWith({
      sentenceId: 9,
      beginMs: 900,
      endMs: 1300,
      text: '你好',
      final: true,
      translatedText: 'hello',
      translationLanguage: 'en',
      translationFinal: true
    })
  })

  it('keeps transcription and translation finality separate', async () => {
    const onTranscript = vi.fn()
    const client = createClient({ onTranscript, sourceLanguage: 'zh', targetLanguage: 'en' })
    const started = client.start()
    const socket = getSocket()

    socket.open()
    socket.serverMessage(taskStarted())
    await started
    socket.serverMessage({
      header: { event: 'result-generated', task_id: 'test-task-id', attributes: {} },
      payload: {
        output: {
          transcription: {
            sentence_id: 10,
            begin_time: 1400,
            end_time: 1800,
            text: '还在说',
            sentence_end: false
          },
          translations: [
            {
              sentence_id: 10,
              begin_time: 1400,
              end_time: 1800,
              text: 'still speaking',
              lang: 'en',
              sentence_end: true
            }
          ]
        }
      }
    })

    expect(onTranscript).toHaveBeenCalledWith({
      sentenceId: 10,
      beginMs: 1400,
      endMs: 1800,
      text: '还在说',
      final: false,
      translatedText: 'still speaking',
      translationLanguage: 'en',
      translationFinal: true
    })
  })

  it('sends finish-task and resolves only after task-finished', async () => {
    const client = createClient()
    const started = client.start()
    const socket = getSocket()

    socket.open()
    socket.serverMessage(taskStarted())
    await started

    const finished = client.finish()
    await Promise.resolve()
    const finishTask = decodeFrame(socket.sent[1])
    let didResolve = false
    finished.then(() => {
      didResolve = true
    })

    expect(finishTask).toMatchObject({
      header: {
        action: 'finish-task',
        task_id: 'test-task-id',
        streaming: 'duplex'
      },
      payload: {
        input: {}
      }
    })

    await Promise.resolve()
    expect(didResolve).toBe(false)

    socket.serverMessage({
      header: { event: 'task-finished', task_id: 'test-task-id', attributes: {} },
      payload: { output: {}, usage: null }
    })

    await expect(finished).resolves.toBeUndefined()
    expect(socket.closed).toBe(true)
  })

  it('fails with the server error_message on task-failed', async () => {
    const client = createClient()
    const started = client.start()
    const socket = getSocket()

    socket.open()
    socket.serverMessage({
      header: {
        event: 'task-failed',
        task_id: 'test-task-id',
        error_code: 'CLIENT_ERROR',
        error_message: 'request timeout after 23 seconds.',
        attributes: {}
      },
      payload: {}
    })

    await expect(started).rejects.toThrow('request timeout after 23 seconds.')
  })
})
