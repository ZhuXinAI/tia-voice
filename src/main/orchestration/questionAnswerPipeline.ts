import { logDebug } from '../logging/debugLogger'
import type { AsrProvider } from '../providers/asr/AsrProvider'
import type { QuestionAnswerProvider } from '../providers/llm/QuestionAnswerProvider'
import type { RecordingArtifact } from '../recording/types'
import type { DictionaryEntryRecord } from '../../shared/dictionary'

const MIN_RECORDING_DURATION_MS = 1000

export type QuestionHistoryEntry = {
  id: string
  createdAt: number
  question: string
  answer: string
  selectedText: string | null
  sourceApp: string | null
  status: 'pending' | 'completed' | 'failed'
  errorDetail?: string
}

type QuestionContext = {
  selectedText: string | null
  sourceApp: string | null
}

function isReadAloudIntent(question: string): boolean {
  const normalized = question.trim().toLocaleLowerCase()
  if (!normalized) {
    return false
  }

  return [
    /\bread\b[\s\S]{0,60}\b(aloud|out loud|this|selection|selected text)\b/,
    /\bspeak\b[\s\S]{0,60}\b(this|selection|selected text|aloud|out loud)\b/,
    /\bsay\b[\s\S]{0,60}\b(this|selection|selected text|aloud|out loud)\b/,
    /朗读/,
    /朗讀/,
    /念一下/,
    /读出来/,
    /讀出來/
  ].some((pattern) => pattern.test(normalized))
}

export function createQuestionAnswerPipeline(dependencies: {
  asrProvider: AsrProvider
  questionAnswerProvider: QuestionAnswerProvider
  getDictionaryEntries?: () => DictionaryEntryRecord[]
  historyStore: {
    appendQuestionHistory(entry: QuestionHistoryEntry): void
    updateQuestionHistoryEntry(entryId: string, patch: Partial<QuestionHistoryEntry>): void
  }
  hideQuestionBar(): void
  showQuestionPending(input: {
    stage: 'transcribing' | 'answering'
    selectedText: string | null
    sourceApp: string | null
    question?: string | null
  }): void
  showQuestionAnswer(input: {
    question: string
    answer: string
    selectedText: string | null
    sourceApp: string | null
  }): void
  showQuestionError(detail: string): void
  prepareBeforeTranscribe?: () => Promise<void>
  onReadAloudRequested?: (text: string) => Promise<void>
  onAnswerCompleted?: (answer: string) => Promise<void>
}): {
  beginCapture(context: QuestionContext): Promise<boolean>
  cancelCapture(): void
  finishRecording(artifact: RecordingArtifact): Promise<void>
} {
  let liveCaptureState: 'idle' | 'capturing' | 'processing' = 'idle'
  let activeContext: QuestionContext | null = null

  return {
    async beginCapture(context) {
      if (liveCaptureState !== 'idle') {
        logDebug('question-answer', 'Ignored beginCapture while another capture is active', {
          liveCaptureState
        })
        return false
      }

      liveCaptureState = 'capturing'
      activeContext = {
        selectedText: context.selectedText?.trim() || null,
        sourceApp: context.sourceApp?.trim() || null
      }
      return true
    },
    cancelCapture() {
      liveCaptureState = 'idle'
      activeContext = null
    },
    async finishRecording(artifact) {
      liveCaptureState = 'processing'

      if (artifact.durationMs < MIN_RECORDING_DURATION_MS) {
        logDebug('question-answer', 'Ignoring short recording artifact', {
          durationMs: artifact.durationMs,
          minDurationMs: MIN_RECORDING_DURATION_MS,
          sizeBytes: artifact.sizeBytes ?? artifact.buffer.byteLength
        })
        dependencies.hideQuestionBar()
        activeContext = null
        liveCaptureState = 'idle'
        return
      }

      const context = activeContext ?? { selectedText: null, sourceApp: null }
      const historyId = `qa-${Date.now()}`

      dependencies.historyStore.appendQuestionHistory({
        id: historyId,
        createdAt: Date.now(),
        question: '',
        answer: '',
        selectedText: context.selectedText,
        sourceApp: context.sourceApp,
        status: 'pending'
      })
      dependencies.showQuestionPending({
        stage: 'transcribing',
        selectedText: context.selectedText,
        sourceApp: context.sourceApp,
        question: null
      })

      try {
        if (dependencies.prepareBeforeTranscribe) {
          await dependencies.prepareBeforeTranscribe()
        }

        const transcript = await dependencies.asrProvider.transcribe(artifact)
        const questionText = transcript.text.trim()

        dependencies.historyStore.updateQuestionHistoryEntry(historyId, {
          question: questionText
        })

        if (!questionText) {
          throw new Error('Question transcription did not contain text.')
        }

        dependencies.showQuestionPending({
          stage: 'answering',
          selectedText: context.selectedText,
          sourceApp: context.sourceApp,
          question: questionText
        })

        let answer = ''
        const shouldReadSelection = Boolean(context.selectedText && isReadAloudIntent(questionText))

        if (shouldReadSelection && context.selectedText) {
          answer = context.selectedText
        } else {
          const dictionaryEntries = dependencies.getDictionaryEntries?.() ?? []
          const response = await dependencies.questionAnswerProvider.answer({
            questionText,
            selectedText: context.selectedText,
            sourceApp: context.sourceApp,
            ...(dictionaryEntries.length > 0 ? { dictionaryEntries } : {})
          })
          answer = response.text.trim()
        }

        if (!answer) {
          throw new Error('Q&A response did not contain text.')
        }

        dependencies.historyStore.updateQuestionHistoryEntry(historyId, {
          status: 'completed',
          question: questionText,
          answer,
          errorDetail: undefined
        })
        dependencies.showQuestionAnswer({
          question: questionText,
          answer,
          selectedText: context.selectedText,
          sourceApp: context.sourceApp
        })

        try {
          if (shouldReadSelection) {
            await dependencies.onReadAloudRequested?.(answer)
          } else {
            await dependencies.onAnswerCompleted?.(answer)
          }
        } catch (error) {
          logDebug('question-answer', 'Answer side effect failed after successful response', {
            historyId,
            error
          })
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Question pipeline failed.'
        console.error('[question-answer] Pipeline failed while processing recording.', error)
        logDebug('question-answer', 'Pipeline failed', {
          historyId,
          errorMessage: detail
        })
        dependencies.historyStore.updateQuestionHistoryEntry(historyId, {
          status: 'failed',
          errorDetail: detail
        })
        dependencies.showQuestionError(detail)
      } finally {
        activeContext = null
        liveCaptureState = 'idle'
      }
    }
  }
}
