import { describe, expect, it, vi } from 'vitest'

import { createQuestionAnswerPipeline } from './questionAnswerPipeline'

describe('createQuestionAnswerPipeline', () => {
  it('transcribes a question, answers with selected text context, and stores history', async () => {
    const historyStore = {
      appendQuestionHistory: vi.fn(),
      updateQuestionHistoryEntry: vi.fn()
    }
    const questionAnswerProvider = {
      answer: vi.fn().mockResolvedValue({ text: 'It means the API format is compatible.' })
    }
    const showQuestionPending = vi.fn()
    const showQuestionAnswer = vi.fn()
    const pipeline = createQuestionAnswerPipeline({
      asrProvider: {
        transcribe: vi.fn().mockResolvedValue({ text: 'What does this mean?' })
      },
      questionAnswerProvider,
      getDictionaryEntries: () => [],
      historyStore,
      hideQuestionBar: vi.fn(),
      showQuestionPending,
      showQuestionAnswer,
      showQuestionError: vi.fn()
    })

    await pipeline.beginCapture({
      selectedText: 'DeepSeek API uses an OpenAI-compatible format.',
      sourceApp: 'Chrome'
    })
    await pipeline.finishRecording({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1]),
      durationMs: 1500
    })

    expect(questionAnswerProvider.answer).toHaveBeenCalledWith({
      questionText: 'What does this mean?',
      selectedText: 'DeepSeek API uses an OpenAI-compatible format.',
      sourceApp: 'Chrome'
    })
    expect(historyStore.appendQuestionHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedText: 'DeepSeek API uses an OpenAI-compatible format.',
        status: 'pending'
      })
    )
    expect(historyStore.updateQuestionHistoryEntry).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: 'completed',
        answer: 'It means the API format is compatible.'
      })
    )
    expect(showQuestionPending).toHaveBeenNthCalledWith(1, {
      stage: 'transcribing',
      selectedText: 'DeepSeek API uses an OpenAI-compatible format.',
      sourceApp: 'Chrome',
      question: null
    })
    expect(showQuestionPending).toHaveBeenNthCalledWith(2, {
      stage: 'answering',
      selectedText: 'DeepSeek API uses an OpenAI-compatible format.',
      sourceApp: 'Chrome',
      question: 'What does this mean?'
    })
    expect(showQuestionAnswer).toHaveBeenCalledWith({
      question: 'What does this mean?',
      answer: 'It means the API format is compatible.',
      selectedText: 'DeepSeek API uses an OpenAI-compatible format.',
      sourceApp: 'Chrome'
    })
  })

  it('routes explicit read-aloud requests directly to TTS', async () => {
    const questionAnswerProvider = {
      answer: vi.fn()
    }
    const onReadAloudRequested = vi.fn().mockResolvedValue(undefined)
    const pipeline = createQuestionAnswerPipeline({
      asrProvider: {
        transcribe: vi.fn().mockResolvedValue({ text: 'Read this out loud.' })
      },
      questionAnswerProvider,
      historyStore: {
        appendQuestionHistory: vi.fn(),
        updateQuestionHistoryEntry: vi.fn()
      },
      hideQuestionBar: vi.fn(),
      showQuestionPending: vi.fn(),
      showQuestionAnswer: vi.fn(),
      showQuestionError: vi.fn(),
      onReadAloudRequested
    })

    await pipeline.beginCapture({
      selectedText: 'Selected text to speak.',
      sourceApp: 'Chrome'
    })
    await pipeline.finishRecording({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1]),
      durationMs: 1500
    })

    expect(questionAnswerProvider.answer).not.toHaveBeenCalled()
    expect(onReadAloudRequested).toHaveBeenCalledWith('Selected text to speak.')
  })

  it('ignores short recordings', async () => {
    const asrProvider = { transcribe: vi.fn() }
    const questionAnswerProvider = { answer: vi.fn() }
    const historyStore = {
      appendQuestionHistory: vi.fn(),
      updateQuestionHistoryEntry: vi.fn()
    }
    const pipeline = createQuestionAnswerPipeline({
      asrProvider,
      questionAnswerProvider,
      historyStore,
      hideQuestionBar: vi.fn(),
      showQuestionPending: vi.fn(),
      showQuestionAnswer: vi.fn(),
      showQuestionError: vi.fn()
    })

    await pipeline.beginCapture({
      selectedText: null,
      sourceApp: null
    })
    await pipeline.finishRecording({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1]),
      durationMs: 200
    })

    expect(asrProvider.transcribe).not.toHaveBeenCalled()
    expect(questionAnswerProvider.answer).not.toHaveBeenCalled()
    expect(historyStore.appendQuestionHistory).not.toHaveBeenCalled()
  })
})
