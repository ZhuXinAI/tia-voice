import { logDebug } from '../logging/debugLogger'
import type {
  GummyRealtimeTranscriptionClient,
  GummyTranscriptUpdate
} from '../providers/asr/GummyRealtimeTranscriptionClient'
import {
  DEFAULT_LIVE_CAPTION_PREFERENCES,
  normalizeLiveCaptionPreferences,
  type LiveCaptionLine,
  type LiveCaptionPreferences,
  type LiveCaptionState
} from '../../shared/liveCaption'

export type LiveCaptionStopSource = 'renderer' | 'overlay-close' | 'internal'

export type LiveCaptionPipeline = {
  getState(): LiveCaptionState
  showConfiguration(): void
  startLiveCaption(preferences: LiveCaptionPreferences): Promise<boolean>
  stopLiveCaption(source: LiveCaptionStopSource): Promise<void>
  receivePcmChunk(input: { chunk: Uint8Array; capturedAt: number }): void
  receiveMeetingTranscript(update: GummyTranscriptUpdate): void
  failLiveCaption(detail: string): void
  isLiveCaptionActive(): boolean
}

type LiveCaptionDependencies = {
  getPreferences(): LiveCaptionPreferences
  setPreferences(preferences: LiveCaptionPreferences): void
  createTranscriptionClient(input: {
    preferences: LiveCaptionPreferences
    onTranscript(update: GummyTranscriptUpdate): void
  }): GummyRealtimeTranscriptionClient
  isMeetingCaptureBusy(): boolean
  canStartStandalone(): boolean
  getStandaloneBusyReason(): string
  showConfigWindow(): void
  hideConfigWindow(): void
  showOverlayWindow(): void
  hideOverlayWindow(): void
  sendStartCaptureCommand(): void
  sendStopCaptureCommand(): void
  setState(state: LiveCaptionState): void
}

const MAX_CAPTION_LINES = 6

function cloneState(state: LiveCaptionState): LiveCaptionState {
  return {
    ...state,
    preferences: { ...state.preferences },
    lines: state.lines.map((line) => ({ ...line }))
  }
}

function createIdleState(preferences: LiveCaptionPreferences): LiveCaptionState {
  return {
    status: 'idle',
    source: null,
    preferences: { ...preferences },
    lines: [],
    error: null
  }
}

function createCaptionLine(input: {
  source: NonNullable<LiveCaptionState['source']>
  preferences: LiveCaptionPreferences
  update: GummyTranscriptUpdate
}): LiveCaptionLine | null {
  const sourceText = input.update.text.trim()
  const translatedText = input.update.translatedText?.trim() || null

  if (!sourceText && !translatedText) {
    return null
  }

  return {
    id: `${input.source}-${input.update.sentenceId}`,
    sentenceId: input.update.sentenceId,
    beginMs: input.update.beginMs,
    endMs: input.update.endMs,
    sourceText,
    translatedText,
    targetLanguage: input.update.translationLanguage ?? input.preferences.targetLanguage,
    final: input.preferences.targetLanguage
      ? input.update.translationFinal === true || (input.update.final && !translatedText)
      : input.update.final,
    createdAt: Date.now()
  }
}

function upsertLine(lines: LiveCaptionLine[], line: LiveCaptionLine): LiveCaptionLine[] {
  const withoutCurrent = lines.filter((item) => item.id !== line.id)
  return [...withoutCurrent, line]
    .sort((a, b) => {
      if (a.beginMs !== b.beginMs) {
        return a.beginMs - b.beginMs
      }

      return a.createdAt - b.createdAt
    })
    .slice(-MAX_CAPTION_LINES)
}

export function createLiveCaptionPipeline(
  dependencies: LiveCaptionDependencies
): LiveCaptionPipeline {
  let state = createIdleState(
    normalizeLiveCaptionPreferences(
      dependencies.getPreferences() ?? DEFAULT_LIVE_CAPTION_PREFERENCES
    )
  )
  let activeClient: GummyRealtimeTranscriptionClient | null = null
  let startToken = 0

  function publish(nextState: LiveCaptionState): void {
    state = cloneState(nextState)
    dependencies.setState(cloneState(state))
  }

  function publishLine(
    source: NonNullable<LiveCaptionState['source']>,
    update: GummyTranscriptUpdate
  ): void {
    if (state.status !== 'listening' && state.status !== 'starting') {
      return
    }

    if (state.source !== source) {
      return
    }

    const line = createCaptionLine({
      source,
      preferences: state.preferences,
      update
    })

    if (!line) {
      return
    }

    publish({
      ...state,
      status: 'listening',
      lines: upsertLine(state.lines, line),
      error: null
    })
  }

  function resetToIdle(preferences = dependencies.getPreferences()): void {
    publish(createIdleState(normalizeLiveCaptionPreferences(preferences)))
  }

  return {
    getState(): LiveCaptionState {
      return cloneState(state)
    },

    showConfiguration(): void {
      const preferences = normalizeLiveCaptionPreferences(dependencies.getPreferences())
      publish({
        status: 'configuring',
        source: null,
        preferences,
        lines: [],
        error: null
      })
      dependencies.showConfigWindow()
    },

    async startLiveCaption(preferences) {
      const normalizedPreferences = normalizeLiveCaptionPreferences(preferences)
      dependencies.setPreferences(normalizedPreferences)
      dependencies.hideConfigWindow()

      if (dependencies.isMeetingCaptureBusy()) {
        publish({
          status: 'listening',
          source: 'meeting',
          preferences: normalizedPreferences,
          lines: [],
          error: null
        })
        dependencies.showOverlayWindow()
        return true
      }

      if (!dependencies.canStartStandalone()) {
        publish({
          status: 'error',
          source: null,
          preferences: normalizedPreferences,
          lines: [],
          error: dependencies.getStandaloneBusyReason()
        })
        dependencies.showConfigWindow()
        return false
      }

      const token = (startToken += 1)
      const client = dependencies.createTranscriptionClient({
        preferences: normalizedPreferences,
        onTranscript: (update) => publishLine('standalone', update)
      })
      activeClient = client
      publish({
        status: 'starting',
        source: 'standalone',
        preferences: normalizedPreferences,
        lines: [],
        error: null
      })
      dependencies.showOverlayWindow()

      try {
        await client.start()
      } catch (error) {
        if (token !== startToken) {
          return false
        }

        const detail =
          error instanceof Error ? error.message : 'Unable to start Live Caption transcription.'
        activeClient = null
        publish({
          status: 'error',
          source: null,
          preferences: normalizedPreferences,
          lines: [],
          error: detail
        })
        logDebug('live-caption', 'Failed to start standalone Live Caption', { error })
        return false
      }

      if (token !== startToken || activeClient !== client) {
        return false
      }

      publish({
        status: 'listening',
        source: 'standalone',
        preferences: normalizedPreferences,
        lines: [],
        error: null
      })
      dependencies.sendStartCaptureCommand()
      return true
    },

    async stopLiveCaption(source) {
      startToken += 1
      const client = activeClient
      activeClient = null

      if (state.status === 'idle') {
        dependencies.hideConfigWindow()
        dependencies.hideOverlayWindow()
        return
      }

      const previousPreferences = state.preferences
      publish({
        ...state,
        status: 'stopping',
        error: null
      })
      dependencies.sendStopCaptureCommand()

      if (client) {
        client.abort(`Live Caption stopped by ${source}.`)
      }

      dependencies.hideOverlayWindow()
      resetToIdle(previousPreferences)
    },

    receivePcmChunk(input) {
      if (state.status !== 'listening' || state.source !== 'standalone' || !activeClient) {
        return
      }

      void input.capturedAt
      activeClient.sendAudioChunk(input.chunk)
    },

    receiveMeetingTranscript(update) {
      publishLine('meeting', update)
    },

    failLiveCaption(detail) {
      startToken += 1
      activeClient?.abort(detail)
      activeClient = null
      dependencies.sendStopCaptureCommand()
      publish({
        status: 'error',
        source: null,
        preferences: state.preferences,
        lines: state.lines,
        error: detail
      })
      logDebug('live-caption', 'Live Caption failed', { detail })
    },

    isLiveCaptionActive() {
      return state.status === 'starting' || state.status === 'listening'
    }
  }
}
