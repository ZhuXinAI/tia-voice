import { describe, expect, it, vi } from 'vitest'

import { createVoicePipeline } from './voicePipeline'

describe('createVoicePipeline', () => {
  it('runs snapshot -> asr -> intent transform -> paste for selected text rewrites', async () => {
    const actionExecutor = { execute: vi.fn().mockResolvedValue(undefined) }
    const asrProvider = {
      transcribe: vi.fn().mockResolvedValue({ text: 'Change this sentence to a more emotional one.' })
    }
    const llmProvider = {
      transform: vi.fn().mockResolvedValue({ text: 'Next week, my long-awaited moment finally arrives.' })
    }
    const historyStore = {
      appendHistory: vi.fn(),
      updateHistoryEntry: vi.fn(),
      getHistoryEntry: vi.fn().mockReturnValue({
        id: 'session-1',
        createdAt: 1,
        transcript: '',
        cleanedText: '',
        status: 'pending'
      }),
      saveAudioClip: vi.fn().mockResolvedValue(null),
      readAudioClip: vi.fn()
    }
    const pipeline = createVoicePipeline({
      contextProvider: { captureSnapshot: vi.fn().mockResolvedValue({ isInputFocused: null, selectedText: null, provider: 'noop', capturedAt: 1 }) },
      asrProvider,
      llmProvider,
      actionExecutor,
      sessionStore: {
        begin: vi.fn(),
        getCurrent: vi.fn().mockReturnValue({
          id: 'session-1',
          snapshot: {
            isInputFocused: true,
            selectedText: 'Next week my time is coming',
            provider: 'selection-hook',
            capturedAt: 1
          }
        }),
        clear: vi.fn()
      },
      historyStore,
      notifyChatWindow: vi.fn(),
      hideRecordingBar: vi.fn()
    })

    await pipeline.finishRecording({ mimeType: 'audio/webm', buffer: new Uint8Array([1]), durationMs: 1500 })

    expect(llmProvider.transform).toHaveBeenCalledWith({
      transcriptText: 'Change this sentence to a more emotional one.',
      selectedText: 'Next week my time is coming'
    })
    expect(actionExecutor.execute).toHaveBeenCalledWith({
      kind: 'paste-text',
      text: 'Next week, my long-awaited moment finally arrives.'
    })
    expect(historyStore.appendHistory).toHaveBeenCalledOnce()
    expect(historyStore.updateHistoryEntry).toHaveBeenCalled()
    expect(asrProvider.transcribe).toHaveBeenCalledOnce()
    expect(llmProvider.transform).toHaveBeenCalledOnce()
  })

  it('ignores very short recordings and skips ASR/LLM requests', async () => {
    const asrProvider = { transcribe: vi.fn() }
    const llmProvider = { transform: vi.fn() }
    const actionExecutor = { execute: vi.fn() }
    const historyStore = {
      appendHistory: vi.fn(),
      updateHistoryEntry: vi.fn(),
      getHistoryEntry: vi.fn(),
      saveAudioClip: vi.fn(),
      readAudioClip: vi.fn()
    }

    const pipeline = createVoicePipeline({
      contextProvider: {
        captureSnapshot: vi
          .fn()
          .mockResolvedValue({ isInputFocused: null, selectedText: null, provider: 'noop', capturedAt: 1 })
      },
      asrProvider,
      llmProvider,
      actionExecutor,
      sessionStore: {
        begin: vi.fn(),
        getCurrent: vi.fn().mockReturnValue(null),
        clear: vi.fn()
      },
      historyStore,
      notifyChatWindow: vi.fn(),
      hideRecordingBar: vi.fn()
    })

    await pipeline.finishRecording({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1, 2, 3]),
      durationMs: 300
    })

    expect(asrProvider.transcribe).not.toHaveBeenCalled()
    expect(llmProvider.transform).not.toHaveBeenCalled()
    expect(actionExecutor.execute).not.toHaveBeenCalled()
    expect(historyStore.appendHistory).not.toHaveBeenCalled()
  })

  it('retries a failed history item when audio is available', async () => {
    const actionExecutor = { execute: vi.fn().mockResolvedValue(undefined) }
    const historyStore = {
      appendHistory: vi.fn(),
      updateHistoryEntry: vi.fn(),
      getHistoryEntry: vi.fn().mockReturnValue({
        id: 'history-1',
        createdAt: Date.now(),
        transcript: '',
        cleanedText: '',
        status: 'failed'
      }),
      saveAudioClip: vi.fn(),
      readAudioClip: vi
        .fn()
        .mockResolvedValue({ mimeType: 'audio/webm', buffer: new Uint8Array([1]), durationMs: 2000, sizeBytes: 1 })
    }
    const pipeline = createVoicePipeline({
      contextProvider: {
        captureSnapshot: vi
          .fn()
          .mockResolvedValue({ isInputFocused: null, selectedText: null, provider: 'noop', capturedAt: 1 })
      },
      asrProvider: { transcribe: vi.fn().mockResolvedValue({ text: 'hello world' }) },
      llmProvider: { transform: vi.fn().mockResolvedValue({ text: 'Hello world.' }) },
      actionExecutor,
      sessionStore: {
        begin: vi.fn(),
        getCurrent: vi.fn().mockReturnValue(null),
        clear: vi.fn()
      },
      historyStore,
      notifyChatWindow: vi.fn(),
      hideRecordingBar: vi.fn()
    })

    await pipeline.retryHistoryEntry('history-1')

    expect(actionExecutor.execute).toHaveBeenCalledWith({ kind: 'paste-text', text: 'Hello world.' })
    expect(historyStore.readAudioClip).toHaveBeenCalledWith('history-1')
    expect(historyStore.updateHistoryEntry).toHaveBeenCalled()
  })
})
