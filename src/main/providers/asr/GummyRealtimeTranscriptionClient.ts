import WebSocket, { type ClientOptions, type RawData } from 'ws'

import type {
  LiveCaptionSourceLanguage,
  LiveCaptionTargetLanguage
} from '../../../shared/liveCaption'
import {
  createRealtimeVadAudioGate,
  type RealtimeVadAudioGate,
  type RealtimeVadAudioGateOptions
} from './realtimeVadAudioGate'

type ApiKeyResolver = string | (() => string | Promise<string>)

export type GummyTranscriptUpdate = {
  sentenceId: number
  beginMs: number
  endMs: number
  text: string
  final: boolean
  translatedText?: string | null
  translationLanguage?: LiveCaptionTargetLanguage | null
  translationFinal?: boolean
}

export type GummyRealtimeTranscriptionClient = {
  start(): Promise<void>
  sendAudioChunk(chunk: Uint8Array): void
  finish(): Promise<void>
  abort(reason?: string): void
}

type GummySocket = {
  on(event: 'open', listener: () => void): GummySocket
  on(event: 'message', listener: (data: RawData) => void): GummySocket
  on(event: 'error', listener: (error: Error) => void): GummySocket
  on(event: 'close', listener: () => void): GummySocket
  send(data: string | Uint8Array): void
  close(): void
  terminate?(): void
}

type GummyWebSocketConstructor = new (
  url: string,
  options: ClientOptions & { headers?: Record<string, string> }
) => GummySocket

type Deferred<T> = {
  promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
  reject(error: unknown): void
}

type GummyServerMessage = {
  header?: {
    event?: string
    error_code?: string
    error_message?: string
  }
  payload?: {
    output?: {
      transcription?: {
        sentence_id?: number
        begin_time?: number
        end_time?: number
        text?: string
        sentence_end?: boolean
      }
      translations?: Array<{
        sentence_id?: number
        begin_time?: number
        end_time?: number
        text?: string
        lang?: string
        sentence_end?: boolean
      }>
    }
  }
}

export type GummyRealtimeTranscriptionClientOptions = {
  apiKey: ApiKeyResolver
  endpoint?: string
  sampleRate?: number
  sourceLanguage?: LiveCaptionSourceLanguage
  targetLanguage?: LiveCaptionTargetLanguage | null
  taskIdFactory?: () => string
  WebSocketCtor?: GummyWebSocketConstructor
  vadGateFactory?: (options: RealtimeVadAudioGateOptions) => RealtimeVadAudioGate
  onTranscript(input: GummyTranscriptUpdate): void
}

const DEFAULT_ENDPOINT = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
const GUMMY_MODEL = 'gummy-realtime-v1'

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  let reject!: Deferred<T>['reject']
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

function resolveApiKey(input: ApiKeyResolver): string | Promise<string> {
  const value = typeof input === 'function' ? input() : input
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      throw new Error('DashScope API key is unavailable.')
    }

    return trimmed
  }

  return value.then((resolved) => {
    const trimmed = resolved.trim()
    if (!trimmed) {
      throw new Error('DashScope API key is unavailable.')
    }

    return trimmed
  })
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>).then === 'function'
}

function createTaskId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `gummy-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}

function rawDataToString(data: RawData): string | null {
  if (typeof data === 'string') {
    return data
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8')
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8')
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8')
  }

  return Buffer.from(data).toString('utf8')
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function buildGummyParameters(input: {
  sampleRate: number
  sourceLanguage?: LiveCaptionSourceLanguage
  targetLanguage?: LiveCaptionTargetLanguage | null
}): Record<string, unknown> {
  const parameters: Record<string, unknown> = {
    sample_rate: input.sampleRate,
    format: 'pcm',
    transcription_enabled: true,
    translation_enabled: Boolean(input.targetLanguage)
  }

  if (input.sourceLanguage && input.sourceLanguage !== 'auto') {
    parameters.source_language = input.sourceLanguage
  }

  if (input.targetLanguage) {
    parameters.translation_target_languages = [input.targetLanguage]
  }

  return parameters
}

function getServerError(message: GummyServerMessage): Error {
  const header = message.header
  return new Error(
    header?.error_message ??
      header?.error_code ??
      'Gummy realtime transcription task failed on the server.'
  )
}

export function createGummyRealtimeTranscriptionClient(
  input: GummyRealtimeTranscriptionClientOptions
): GummyRealtimeTranscriptionClient {
  const endpoint = input.endpoint ?? DEFAULT_ENDPOINT
  const sampleRate = input.sampleRate ?? 16000
  const taskId = (input.taskIdFactory ?? createTaskId)()
  const WebSocketCtor = input.WebSocketCtor ?? WebSocket
  const queuedAudio: Uint8Array[] = []
  const vadGate = (input.vadGateFactory ?? createRealtimeVadAudioGate)({
    sampleRate,
    onSpeechChunk: sendSpeechChunk,
    onError: (error) => fail(error)
  })

  let socket: GummySocket | null = null
  let startDeferred: Deferred<void> | null = null
  let finishDeferred: Deferred<void> | null = null
  let started = false
  let failedError: Error | null = null
  let aborted = false

  function sendJson(data: unknown): void {
    socket?.send(JSON.stringify(data))
  }

  function sendRunTask(): void {
    sendJson({
      header: {
        action: 'run-task',
        task_id: taskId,
        streaming: 'duplex'
      },
      payload: {
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        model: GUMMY_MODEL,
        parameters: buildGummyParameters({
          sampleRate,
          sourceLanguage: input.sourceLanguage,
          targetLanguage: input.targetLanguage
        }),
        input: {}
      }
    })
  }

  function sendFinishTask(): void {
    sendJson({
      header: {
        action: 'finish-task',
        task_id: taskId,
        streaming: 'duplex'
      },
      payload: {
        input: {}
      }
    })
  }

  function rejectPending(error: Error): void {
    startDeferred?.reject(error)
    finishDeferred?.reject(error)
  }

  function fail(error: Error): void {
    if (failedError) {
      return
    }

    failedError = error
    vadGate.destroy()
    rejectPending(error)
    socket?.close()
  }

  function sendSpeechChunk(chunk: Uint8Array): void {
    const audioChunk = Uint8Array.from(chunk)
    if (started) {
      socket?.send(audioChunk)
      return
    }

    queuedAudio.push(audioChunk)
  }

  function flushAudioQueue(): void {
    while (queuedAudio.length > 0) {
      const chunk = queuedAudio.shift()
      if (chunk) {
        socket?.send(chunk)
      }
    }
  }

  function handleTaskStarted(): void {
    started = true
    vadGate
      .start()
      .then(() => {
        if (failedError || aborted) {
          return
        }

        flushAudioQueue()
        startDeferred?.resolve()
      })
      .catch((error) => fail(error instanceof Error ? error : new Error(String(error))))
  }

  function flushVadAndFinishTask(): void {
    vadGate
      .flush()
      .then(() => {
        if (failedError || aborted) {
          return
        }

        sendFinishTask()
      })
      .catch((error) => fail(error instanceof Error ? error : new Error(String(error))))
  }

  function handleResultGenerated(message: GummyServerMessage): void {
    const transcription = message.payload?.output?.transcription
    const translation = message.payload?.output?.translations?.find((item) => item?.text)

    if (!transcription?.text && !translation?.text) {
      return
    }

    const translationLanguage =
      translation?.lang === input.targetLanguage
        ? input.targetLanguage
        : (input.targetLanguage ?? null)

    input.onTranscript({
      sentenceId: toNumber(transcription?.sentence_id ?? translation?.sentence_id),
      beginMs: toNumber(transcription?.begin_time ?? translation?.begin_time),
      endMs: toNumber(transcription?.end_time ?? translation?.end_time),
      text: transcription?.text ?? '',
      final: transcription?.sentence_end === true,
      translatedText: translation?.text ?? null,
      translationLanguage: translation?.text ? translationLanguage : null,
      translationFinal: translation?.sentence_end === true
    })
  }

  function handleMessage(data: RawData): void {
    const text = rawDataToString(data)
    if (!text) {
      return
    }

    let message: GummyServerMessage
    try {
      message = JSON.parse(text) as GummyServerMessage
    } catch {
      return
    }

    switch (message.header?.event) {
      case 'task-started':
        handleTaskStarted()
        break
      case 'result-generated':
        handleResultGenerated(message)
        break
      case 'task-finished':
        finishDeferred?.resolve()
        socket?.close()
        break
      case 'task-failed':
        fail(getServerError(message))
        break
    }
  }

  function connect(apiKey: string): void {
    if (aborted) {
      return
    }

    socket = new WebSocketCtor(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    })

    socket
      .on('open', sendRunTask)
      .on('message', handleMessage)
      .on('error', (error) => fail(error))
      .on('close', () => {
        if (!started && !failedError && !aborted) {
          fail(new Error('Gummy realtime transcription socket closed before task-started.'))
        }
      })
  }

  return {
    start() {
      if (failedError) {
        return Promise.reject(failedError)
      }

      if (startDeferred) {
        return startDeferred.promise
      }

      startDeferred = createDeferred()

      try {
        vadGate
          .start()
          .catch((error) => fail(error instanceof Error ? error : new Error(String(error))))
        const apiKey = resolveApiKey(input.apiKey)
        if (isPromiseLike(apiKey)) {
          apiKey
            .then(connect)
            .catch((error) => fail(error instanceof Error ? error : new Error(String(error))))
        } else {
          connect(apiKey)
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }

      return startDeferred.promise
    },

    sendAudioChunk(chunk) {
      if (failedError || aborted || finishDeferred) {
        return
      }

      const audioChunk = Uint8Array.from(chunk)
      vadGate.processPcm16Chunk(audioChunk)
    },

    finish() {
      if (finishDeferred) {
        return finishDeferred.promise
      }

      finishDeferred = createDeferred()

      if (failedError) {
        finishDeferred.reject(failedError)
        return finishDeferred.promise
      }

      if (!startDeferred) {
        finishDeferred.reject(new Error('Gummy realtime transcription has not started.'))
        return finishDeferred.promise
      }

      if (started) {
        flushVadAndFinishTask()
      } else {
        startDeferred.promise
          .then(flushVadAndFinishTask)
          .catch((error) => finishDeferred?.reject(error))
      }

      return finishDeferred.promise
    },

    abort(reason) {
      if (aborted) {
        return
      }

      aborted = true
      const error = new Error(reason ?? 'Gummy realtime transcription aborted.')
      rejectPending(error)
      vadGate.destroy()
      socket?.terminate?.()
      socket?.close()
    }
  }
}
