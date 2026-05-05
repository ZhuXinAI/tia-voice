import { describe, expect, it, vi } from 'vitest'

import type { GummyRealtimeTranscriptionClient } from '../providers/asr/GummyRealtimeTranscriptionClient'
import { DEFAULT_LIVE_CAPTION_PREFERENCES } from '../../shared/liveCaption'
import { createLiveCaptionPipeline } from './liveCaptionPipeline'

type Deferred = {
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
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

function setup(input: { meetingBusy?: boolean; canStartStandalone?: boolean } = {}) {
  const started = createDeferred()
  const client: GummyRealtimeTranscriptionClient = {
    start: vi.fn(() => started.promise),
    sendAudioChunk: vi.fn(),
    finish: vi.fn(async () => undefined),
    abort: vi.fn()
  }
  const dependencies = {
    getPreferences: vi.fn(() => DEFAULT_LIVE_CAPTION_PREFERENCES),
    setPreferences: vi.fn(),
    createTranscriptionClient: vi.fn(() => client),
    isMeetingCaptureBusy: vi.fn(() => input.meetingBusy === true),
    canStartStandalone: vi.fn(() => input.canStartStandalone !== false),
    getStandaloneBusyReason: vi.fn(() => 'Busy right now.'),
    showConfigWindow: vi.fn(),
    hideConfigWindow: vi.fn(),
    showOverlayWindow: vi.fn(),
    hideOverlayWindow: vi.fn(),
    sendStartCaptureCommand: vi.fn(),
    sendStopCaptureCommand: vi.fn(),
    setState: vi.fn()
  }
  const pipeline = createLiveCaptionPipeline(dependencies)

  return { pipeline, dependencies, client, started }
}

describe('createLiveCaptionPipeline', () => {
  it('starts standalone Gummy transcription before asking the renderer to capture audio', async () => {
    const { pipeline, dependencies, client, started } = setup()
    const starting = pipeline.startLiveCaption({
      sourceLanguage: 'zh',
      targetLanguage: 'en',
      showOriginalWhenTranslating: true
    })

    expect(dependencies.createTranscriptionClient).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: {
          sourceLanguage: 'zh',
          targetLanguage: 'en',
          showOriginalWhenTranslating: true
        }
      })
    )
    expect(client.start).toHaveBeenCalledOnce()
    expect(dependencies.showOverlayWindow).toHaveBeenCalledOnce()
    expect(dependencies.sendStartCaptureCommand).not.toHaveBeenCalled()

    started.resolve()
    await expect(starting).resolves.toBe(true)

    expect(dependencies.sendStartCaptureCommand).toHaveBeenCalledOnce()
    expect(pipeline.getState()).toMatchObject({
      status: 'listening',
      source: 'standalone'
    })
  })

  it('forwards standalone PCM chunks only while listening', async () => {
    const { pipeline, client, started } = setup()

    pipeline.receivePcmChunk({ chunk: new Uint8Array([1]), capturedAt: 1 })
    expect(client.sendAudioChunk).not.toHaveBeenCalled()

    const starting = pipeline.startLiveCaption(DEFAULT_LIVE_CAPTION_PREFERENCES)
    started.resolve()
    await starting

    pipeline.receivePcmChunk({ chunk: new Uint8Array([2, 3]), capturedAt: 2 })
    expect(client.sendAudioChunk).toHaveBeenCalledWith(new Uint8Array([2, 3]))
  })

  it('aborts the client and clears state when the overlay closes', async () => {
    const { pipeline, dependencies, client, started } = setup()
    const starting = pipeline.startLiveCaption(DEFAULT_LIVE_CAPTION_PREFERENCES)
    started.resolve()
    await starting

    await pipeline.stopLiveCaption('overlay-close')

    expect(client.abort).toHaveBeenCalledWith('Live Caption stopped by overlay-close.')
    expect(dependencies.sendStopCaptureCommand).toHaveBeenCalledOnce()
    expect(dependencies.hideOverlayWindow).toHaveBeenCalledOnce()
    expect(pipeline.getState()).toMatchObject({ status: 'idle', source: null })
  })

  it('uses the existing meeting stream instead of creating a standalone client during meetings', async () => {
    const { pipeline, dependencies } = setup({ meetingBusy: true })

    await expect(
      pipeline.startLiveCaption({
        sourceLanguage: 'zh',
        targetLanguage: 'en',
        showOriginalWhenTranslating: true
      })
    ).resolves.toBe(true)

    expect(dependencies.createTranscriptionClient).not.toHaveBeenCalled()
    expect(dependencies.sendStartCaptureCommand).not.toHaveBeenCalled()

    pipeline.receiveMeetingTranscript({
      sentenceId: 1,
      beginMs: 100,
      endMs: 300,
      text: '你好',
      final: true,
      translatedText: 'hello',
      translationLanguage: 'en',
      translationFinal: true
    })

    expect(pipeline.getState().lines).toEqual([
      expect.objectContaining({
        sourceText: '你好',
        translatedText: 'hello',
        targetLanguage: 'en',
        final: true
      })
    ])
  })

  it('keeps the setup window open when standalone captioning is blocked', async () => {
    const { pipeline, dependencies } = setup({ canStartStandalone: false })

    await expect(pipeline.startLiveCaption(DEFAULT_LIVE_CAPTION_PREFERENCES)).resolves.toBe(false)

    expect(dependencies.createTranscriptionClient).not.toHaveBeenCalled()
    expect(dependencies.showConfigWindow).toHaveBeenCalledOnce()
    expect(pipeline.getState()).toMatchObject({
      status: 'error',
      error: 'Busy right now.'
    })
  })
})
