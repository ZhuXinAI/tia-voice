import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { WaveformCanvas } from '../components/WaveformCanvas'
import { Button } from '../components/ui/button'
import {
  cancelQuestionRecording,
  reportQuestionRecordingFailure,
  submitQuestionRecordingArtifact,
  subscribeToQuestionRecordingCommand
} from '../lib/ipc'
import { useMicrophoneRecorder } from '../recording/useMicrophoneRecorder'

type QuestionMessage = {
  id: string
  question: string
  answer: string
  selectedText: string | null
  sourceApp: string | null
}

type PendingQuestionMessage = {
  stage: 'transcribing' | 'answering'
  selectedText: string | null
  sourceApp: string | null
  question: string | null
}

const SELECTED_TEXT_PREVIEW_LIMIT = 280

function buildSelectedTextPreview(selectedText: string | null): string | null {
  const normalized = selectedText?.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return null
  }

  if (normalized.length <= SELECTED_TEXT_PREVIEW_LIMIT) {
    return normalized
  }

  return `${normalized.slice(0, SELECTED_TEXT_PREVIEW_LIMIT - 3).trimEnd()}...`
}

export default function QuestionBarWindow(): React.JSX.Element {
  const [messages, setMessages] = useState<QuestionMessage[]>([])
  const [pendingMessage, setPendingMessage] = useState<PendingQuestionMessage | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const recorder = useMicrophoneRecorder({
    onComplete: async (artifact) => {
      await submitQuestionRecordingArtifact(artifact)
    }
  })

  useEffect(() => {
    return subscribeToQuestionRecordingCommand((command) => {
      if (command.type === 'start') {
        setPipelineError(null)
        setPendingMessage(null)
        void recorder.start(command.deviceId)
        return
      }

      if (command.type === 'stop') {
        void recorder.stop()
        return
      }

      if (command.type === 'pending') {
        setPipelineError(null)
        setPendingMessage({
          stage: command.stage,
          selectedText: command.selectedText,
          sourceApp: command.sourceApp,
          question: command.question?.trim() || null
        })
        return
      }

      if (command.type === 'answer') {
        setPipelineError(null)
        setPendingMessage(null)
        setMessages((currentMessages) =>
          [
            ...currentMessages,
            {
              id: `${Date.now()}`,
              question: command.question,
              answer: command.answer,
              selectedText: command.selectedText ?? null,
              sourceApp: command.sourceApp ?? null
            }
          ].slice(-4)
        )
        return
      }

      if (command.type === 'error') {
        setPendingMessage(null)
        setPipelineError(command.detail)
        return
      }

      setPipelineError(null)
      setPendingMessage(null)
      setMessages([])
    })
  }, [recorder])

  const phase = useMemo<'idle' | 'recording' | 'processing'>(() => {
    if (recorder.status === 'recording') {
      return 'recording'
    }

    if (recorder.status === 'stopping') {
      return 'processing'
    }

    return 'idle'
  }, [recorder.status])

  useEffect(() => {
    if (recorder.status === 'error' && recorder.error) {
      void reportQuestionRecordingFailure(recorder.error)
    }
  }, [recorder.error, recorder.status])

  const canConfirm = phase === 'recording'
  const canClose = phase !== 'processing'
  const hasConversation = messages.length > 0 || Boolean(pendingMessage) || Boolean(pipelineError)

  const cancelRecording = async (): Promise<void> => {
    if (!canClose) {
      return
    }

    if (phase === 'recording') {
      await recorder.cancel()
    }

    setPipelineError(null)
    setPendingMessage(null)
    setMessages([])
    await cancelQuestionRecording()
  }

  const confirmRecording = async (): Promise<void> => {
    if (!canConfirm) {
      return
    }

    await recorder.stop()
  }

  return (
    <div className="window question-bar-window" data-testid="question-bar-window">
      <div className="question-bar-stack">
        {hasConversation ? (
          <div className="question-chat-panel">
            {messages.map((message) => (
              <article className="question-chat-message" key={message.id}>
                <p className="question-chat-message__question">{message.question}</p>
                {buildSelectedTextPreview(message.selectedText) ? (
                  <p className="question-chat-message__selection">
                    {buildSelectedTextPreview(message.selectedText)}
                  </p>
                ) : null}
                <p className="question-chat-message__answer">{message.answer}</p>
              </article>
            ))}
            {pendingMessage ? (
              <article className="question-chat-message question-chat-message--pending">
                {pendingMessage.question ? (
                  <p className="question-chat-message__question">{pendingMessage.question}</p>
                ) : null}
                {buildSelectedTextPreview(pendingMessage.selectedText) ? (
                  <p className="question-chat-message__selection">
                    {buildSelectedTextPreview(pendingMessage.selectedText)}
                  </p>
                ) : null}
                <div className="question-chat-message__pending">
                  <span className="question-chat-message__spinner" aria-hidden="true" />
                  <span>
                    {pendingMessage.stage === 'transcribing'
                      ? 'Transcribing your question'
                      : 'Generating the answer'}
                  </span>
                </div>
              </article>
            ) : null}
            {pipelineError ? <p className="question-chat-error">{pipelineError}</p> : null}
          </div>
        ) : null}

        <div className="question-control-pill">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="question-control-button question-control-button--cancel"
            aria-label="Cancel question recording"
            title="Cancel"
            disabled={!canClose}
            onClick={() => void cancelRecording()}
          >
            <X className="size-4" />
          </Button>

          <div className="recording-hud recording-hud--question">
            <span
              className={`recording-indicator recording-indicator--${phase}`}
              aria-hidden="true"
            />
            {phase === 'processing' ? (
              <div className="recording-loader" aria-label="Processing question">
                <span className="recording-loader__spinner" />
              </div>
            ) : (
              <WaveformCanvas stream={phase === 'recording' ? recorder.stream : null} />
            )}
          </div>

          <Button
            type="button"
            size="icon"
            className="question-control-button question-control-button--confirm"
            aria-label="Send question recording"
            title="Send"
            disabled={!canConfirm}
            onClick={() => void confirmRecording()}
          >
            <Check className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
