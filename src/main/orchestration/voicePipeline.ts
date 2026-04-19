import type { ActionExecutor } from '../actions/ActionExecutor'
import type { HistoryEntry } from '../config/settingsStore'
import type { ContextProvider } from '../context/ContextProvider'
import { logDebug } from '../logging/debugLogger'
import type { AsrProvider } from '../providers/asr/AsrProvider'
import type { LlmProvider } from '../providers/llm/LlmProvider'
import type { ChatState, RecordingArtifact } from '../recording/types'
import type { VoiceSession } from './ephemeralSessionStore'

const MIN_RECORDING_DURATION_MS = 1000

export function createVoicePipeline(dependencies: {
  contextProvider: ContextProvider
  asrProvider: AsrProvider
  llmProvider: LlmProvider
  actionExecutor: ActionExecutor
  sessionStore: {
    begin(snapshot: Awaited<ReturnType<ContextProvider['captureSnapshot']>>): VoiceSession
    getCurrent(): VoiceSession | null
    clear(): void
  }
  historyStore: {
    appendHistory(entry: HistoryEntry): void
    updateHistoryEntry(entryId: string, patch: Partial<HistoryEntry>): void
    getHistoryEntry(entryId: string): HistoryEntry | null
    saveAudioClip(
      entryId: string,
      input: {
        mimeType: string
        buffer: Uint8Array
        durationMs: number
        sizeBytes?: number
      }
    ): Promise<HistoryEntry['audio'] | null>
    readAudioClip(entryId: string): Promise<{
      mimeType: string
      buffer: Uint8Array
      durationMs: number
      sizeBytes: number
    } | null>
  }
  notifyChatWindow(state: ChatState): void
  hideRecordingBar(): void
  prepareBeforeTranscribe?: () => Promise<void>
}): {
  beginCapture(): Promise<boolean>
  cancelCapture(): void
  finishRecording(artifact: RecordingArtifact): Promise<void>
  retryHistoryEntry(historyId: string): Promise<void>
} {
  let liveCaptureState: 'idle' | 'capturing' | 'processing' = 'idle'

  const processArtifact = async (input: {
    historyId: string
    artifact: RecordingArtifact
    selectedText: string | null
    clearSessionAfterward: boolean
    closeRecordingBarBeforeInject: boolean
    source: 'live' | 'retry'
  }): Promise<void> => {
    let transcriptText = ''
    let cleanedText = ''

    dependencies.notifyChatWindow({ phase: 'thinking', detail: 'Transcribing audio…' })

    try {
      if (dependencies.prepareBeforeTranscribe) {
        logDebug('voice-pipeline', 'Preparing transcription prerequisites', {
          source: input.source,
          historyId: input.historyId
        })
        await dependencies.prepareBeforeTranscribe()
        logDebug('voice-pipeline', 'Transcription prerequisites ready', {
          source: input.source,
          historyId: input.historyId
        })
      }

      logDebug('voice-pipeline', 'Requesting ASR transcription', {
        source: input.source,
        historyId: input.historyId
      })
      const transcript = await dependencies.asrProvider.transcribe(input.artifact)
      transcriptText = transcript.text
      dependencies.historyStore.updateHistoryEntry(input.historyId, {
        transcript: transcriptText
      })
      logDebug('voice-pipeline', 'ASR transcription completed', {
        source: input.source,
        historyId: input.historyId,
        transcriptLength: transcriptText.length
      })

      dependencies.notifyChatWindow({
        phase: 'thinking',
        text: transcriptText,
        detail: 'Applying intent…'
      })

      logDebug('voice-pipeline', 'Requesting LLM transform completion', {
        source: input.source,
        historyId: input.historyId,
        hasSelectedText: Boolean(input.selectedText)
      })
      const transformed = await dependencies.llmProvider.transform({
        transcriptText,
        selectedText: input.selectedText
      })
      cleanedText = transformed.text
      logDebug('voice-pipeline', 'LLM transform completion completed', {
        source: input.source,
        historyId: input.historyId,
        cleanedLength: cleanedText.length
      })

      if (input.closeRecordingBarBeforeInject) {
        dependencies.hideRecordingBar()
      }
      await dependencies.actionExecutor.execute({ kind: 'paste-text', text: cleanedText })
      logDebug('voice-pipeline', 'Paste action executed', {
        source: input.source,
        historyId: input.historyId
      })
      dependencies.historyStore.updateHistoryEntry(input.historyId, {
        status: 'completed',
        transcript: transcriptText,
        cleanedText,
        errorDetail: undefined
      })
      logDebug('voice-pipeline', 'History entry marked as completed', {
        source: input.source,
        historyId: input.historyId
      })
      dependencies.notifyChatWindow({ phase: 'done', text: cleanedText })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown pipeline error'
      console.error('[voice] Pipeline failed while processing recording.', error)
      logDebug('voice-pipeline', 'Pipeline failed', {
        source: input.source,
        historyId: input.historyId,
        errorMessage: error instanceof Error ? error.message : String(error)
      })
      dependencies.historyStore.updateHistoryEntry(input.historyId, {
        status: 'failed',
        transcript: transcriptText,
        cleanedText,
        errorDetail: detail
      })
      if (input.closeRecordingBarBeforeInject) {
        dependencies.hideRecordingBar()
      }
      dependencies.notifyChatWindow({ phase: 'error', detail })
    } finally {
      if (input.clearSessionAfterward) {
        dependencies.sessionStore.clear()
      }
      logDebug('voice-pipeline', 'Artifact processing finished', {
        source: input.source,
        historyId: input.historyId,
        clearSessionAfterward: input.clearSessionAfterward
      })
    }
  }

  return {
    async beginCapture() {
      if (liveCaptureState !== 'idle') {
        logDebug('voice-pipeline', 'Ignored beginCapture while another live capture is active', {
          liveCaptureState
        })
        return false
      }

      liveCaptureState = 'capturing'

      try {
        const snapshot = await dependencies.contextProvider.captureSnapshot()
        dependencies.sessionStore.begin(snapshot)
        return true
      } catch (error) {
        liveCaptureState = 'idle'
        throw error
      }
    },
    cancelCapture() {
      liveCaptureState = 'idle'
      dependencies.sessionStore.clear()
    },
    async finishRecording(artifact: RecordingArtifact) {
      liveCaptureState = 'processing'

      if (artifact.durationMs < MIN_RECORDING_DURATION_MS) {
        logDebug('voice-pipeline', 'Ignoring short recording artifact', {
          durationMs: artifact.durationMs,
          minDurationMs: MIN_RECORDING_DURATION_MS,
          sizeBytes: artifact.sizeBytes ?? artifact.buffer.byteLength
        })
        console.info(
          `[voice] Ignored short recording (${artifact.durationMs}ms < ${MIN_RECORDING_DURATION_MS}ms).`
        )
        dependencies.hideRecordingBar()
        dependencies.notifyChatWindow({ phase: 'idle' })
        dependencies.sessionStore.clear()
        liveCaptureState = 'idle'
        return
      }

      const activeSession = dependencies.sessionStore.getCurrent()
      const historyId = activeSession?.id ?? `history-${Date.now()}`

      dependencies.historyStore.appendHistory({
        id: historyId,
        createdAt: Date.now(),
        transcript: '',
        cleanedText: '',
        status: 'pending'
      })

      try {
        await dependencies.historyStore.saveAudioClip(historyId, {
          mimeType: artifact.mimeType,
          buffer: artifact.buffer,
          durationMs: artifact.durationMs,
          sizeBytes: artifact.sizeBytes
        })
      } catch (error) {
        console.error('[voice] Failed to save audio clip for history.', error)
        logDebug('voice-pipeline', 'Failed to save audio clip for history', {
          historyId,
          error
        })
      }

      logDebug('voice-pipeline', 'Starting recording processing', {
        historyId,
        durationMs: artifact.durationMs,
        sizeBytes: artifact.sizeBytes ?? artifact.buffer.byteLength,
        mimeType: artifact.mimeType
      })

      await processArtifact({
        historyId,
        artifact,
        selectedText: activeSession?.snapshot.selectedText ?? null,
        clearSessionAfterward: true,
        closeRecordingBarBeforeInject: true,
        source: 'live'
      })

      liveCaptureState = 'idle'
    },
    async retryHistoryEntry(historyId: string) {
      const existing = dependencies.historyStore.getHistoryEntry(historyId)
      if (!existing) {
        throw new Error(`History item "${historyId}" was not found.`)
      }

      const artifact = await dependencies.historyStore.readAudioClip(historyId)
      if (!artifact) {
        const detail = 'Audio clip is missing for this history item.'
        dependencies.historyStore.updateHistoryEntry(historyId, {
          status: 'failed',
          errorDetail: detail
        })
        throw new Error(detail)
      }

      dependencies.historyStore.updateHistoryEntry(historyId, {
        status: 'pending',
        errorDetail: undefined
      })

      await processArtifact({
        historyId,
        artifact,
        selectedText: null,
        clearSessionAfterward: false,
        closeRecordingBarBeforeInject: false,
        source: 'retry'
      })
    }
  }
}
