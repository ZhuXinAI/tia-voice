import { BrowserWindow, screen } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

import { IPC_CHANNELS, type MainAppStatePayload, type TtsStatePayload } from '../ipc/channels'
import type { ChatState, QuestionRecordingCommand, RecordingCommand } from '../recording/types'
import { DEFAULT_DICTIONARY_ENTRIES } from '../../shared/dictionary'
import {
  DEFAULT_LIVE_CAPTION_PREFERENCES,
  type LiveCaptionCommand,
  type LiveCaptionState
} from '../../shared/liveCaption'

export type WindowRole =
  | 'main-app'
  | 'recording-bar'
  | 'meeting-capture'
  | 'live-caption-config'
  | 'live-caption-overlay'
  | 'question-bar'
  | 'chat'
  | 'tts-player'
export type MeetingCaptureCommand =
  | {
      type: 'start'
      deviceId?: string | null
    }
  | {
      type: 'stop'
    }
  | {
      type: 'state'
      transcriptItems?: Array<{
        id: string
        speaker: 'You' | 'Others'
        text: string
        createdAt: number
      }>
    }
  | {
      type: 'error'
      detail: string
    }
export type MeetingCaptureState = {
  status: 'idle' | 'starting' | 'recording' | 'processing' | 'completed' | 'failed'
  meetingId: string | null
  startedAt: number | null
  transcriptItems: Array<{
    id: string
    speaker: 'You' | 'Others'
    text: string
    createdAt: number
  }>
  errorDetail: string | null
}
export type WindowManager = {
  getMainAppWindow(): BrowserWindow
  getChatState(): ChatState
  getTtsState(): TtsStatePayload
  getMeetingCaptureState(): MeetingCaptureState
  getLiveCaptionState(): LiveCaptionState
  getAppState(): MainAppStatePayload
  showRecordingBar(command: RecordingCommand): void
  stopRecordingBar(): void
  hideRecordingBar(): void
  showMeetingCapture(command: MeetingCaptureCommand): void
  setMeetingCaptureState(state: MeetingCaptureState): void
  stopMeetingCapture(): void
  hideMeetingCapture(): void
  showLiveCaptionConfig(): void
  hideLiveCaptionConfig(): void
  showLiveCaptionOverlay(): void
  hideLiveCaptionOverlay(): void
  setLiveCaptionState(state: LiveCaptionState): void
  sendLiveCaptionCommand(command: LiveCaptionCommand): void
  showQuestionBar(command: QuestionRecordingCommand): void
  stopQuestionBar(): void
  showQuestionPending(input: Extract<QuestionRecordingCommand, { type: 'pending' }>): void
  showQuestionAnswer(input: {
    question: string
    answer: string
    selectedText?: string | null
    sourceApp?: string | null
  }): void
  showQuestionError(detail: string): void
  resetQuestionBar(): void
  hideQuestionBar(): void
  setTtsState(state: TtsStatePayload): void
  hideTtsPlayer(): void
  closeAllWindows(): void
  setChatState(state: ChatState): void
  setAppState(state: MainAppStatePayload): void
}

export function buildRendererRoute(role: WindowRole): string {
  return `index.html?window=${role}`
}

function resolveRendererIndexPath(): string {
  const candidatePaths = [
    join(__dirname, '../renderer/index.html'),
    join(__dirname, '../../renderer/index.html')
  ]

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }

  return candidatePaths[0]
}

export async function loadRendererWindow(window: BrowserWindow, role: WindowRole): Promise<void> {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?window=${role}`)
    return
  }

  await window.loadFile(resolveRendererIndexPath(), {
    query: { window: role }
  })
}

function canSendToWindow(window: BrowserWindow): boolean {
  if (window.isDestroyed()) {
    return false
  }

  try {
    return !window.webContents.isDestroyed()
  } catch {
    return false
  }
}

function sendWhenReady(window: BrowserWindow, channel: string, payload: unknown): void {
  const deliver = (): void => {
    if (!canSendToWindow(window)) {
      return
    }

    try {
      window.webContents.send(channel, payload)
    } catch {
      // The target window may close between readiness checks and delivery.
    }
  }

  if (!canSendToWindow(window)) {
    return
  }

  try {
    if (window.webContents.isLoadingMainFrame()) {
      window.webContents.once('did-finish-load', deliver)
      return
    }
  } catch {
    return
  }

  deliver()
}

function showOverlayWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return
  }

  window.setAlwaysOnTop(true, 'screen-saver')
  window.showInactive()
}

const QUESTION_BAR_COMPACT_SIZE = {
  width: 440,
  height: 96
}

const QUESTION_BAR_EXPANDED_SIZE = {
  width: 560,
  height: 340
}

function setQuestionBarBounds(window: BrowserWindow, size: typeof QUESTION_BAR_COMPACT_SIZE): void {
  const bounds = screen.getPrimaryDisplay().workArea
  window.setBounds({
    width: size.width,
    height: size.height,
    x: Math.round(bounds.x + bounds.width / 2 - size.width / 2),
    y: Math.round(bounds.y + bounds.height - size.height - 28)
  })
}

function closeManagedWindow(window?: BrowserWindow): void {
  if (!window || window.isDestroyed()) {
    return
  }

  try {
    window.close()
  } catch {
    // Fall through to destroy as a last resort.
  }

  if (window.isDestroyed()) {
    return
  }

  try {
    window.destroy()
  } catch {
    // Best effort cleanup during application shutdown.
  }
}

export function createWindowManager(input: {
  mainAppWindow: BrowserWindow
  recordingBarWindow: BrowserWindow
  meetingCaptureWindow?: BrowserWindow
  liveCaptionConfigWindow?: BrowserWindow
  liveCaptionOverlayWindow?: BrowserWindow
  questionBarWindow?: BrowserWindow
  chatWindow?: BrowserWindow
  ttsPlayerWindow?: BrowserWindow
}): WindowManager {
  let chatState: ChatState = { phase: 'idle' }
  let meetingCaptureState: MeetingCaptureState = {
    status: 'idle',
    meetingId: null,
    startedAt: null,
    transcriptItems: [],
    errorDetail: null
  }
  let liveCaptionState: LiveCaptionState = {
    status: 'idle',
    source: null,
    preferences: DEFAULT_LIVE_CAPTION_PREFERENCES,
    lines: [],
    error: null
  }
  let questionBarExpanded = false
  let ttsState: TtsStatePayload = {
    status: 'idle',
    sessionId: null,
    source: null,
    text: '',
    audioUrl: null,
    audioExpiresAt: null,
    segments: [],
    voice: null,
    model: null,
    createdAt: null,
    error: null
  }
  let appState: MainAppStatePayload = {
    appInfo: {
      name: 'TIA Voice',
      version: '0.0.0'
    },
    hotkeyHint: 'Hold the push-to-talk key to dictate into the current app.',
    registeredHotkey: null,
    registeredHotkeyLabel: null,
    selectedProvider: 'dashscope',
    microphone: {
      selectedDeviceId: null,
      selectedDeviceLabel: null
    },
    providerLabels: {
      asr: 'qwen3-asr-flash',
      llm: 'qwen3.5-flash'
    },
    dashscope: {
      configured: false,
      keyLabel: null,
      asrModel: 'qwen3-asr-flash',
      llmModel: 'qwen3.5-flash',
      availableLlmModels: [
        'qwen3-max',
        'qwen3.6-plus',
        'qwen3.5-plus',
        'qwen-plus',
        'qwen3.6-flash',
        'qwen3.5-flash',
        'qwen-flash'
      ]
    },
    openai: {
      configured: false,
      keyLabel: null,
      asrModel: 'gpt-4o-mini-transcribe',
      llmModel: 'gpt-5-mini',
      availableLlmModels: [
        'gpt-5.2',
        'gpt-5.1',
        'gpt-5',
        'gpt-5-mini',
        'gpt-5-nano',
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
        'gpt-4o',
        'gpt-4o-mini',
        'o3',
        'o4-mini',
        'o3-mini'
      ]
    },
    onboarding: {
      completed: false,
      visible: true
    },
    language: {
      preference: 'system',
      resolved: 'en'
    },
    themeMode: 'system',
    features: {
      autoTextToSpeech: false
    },
    liveCaption: DEFAULT_LIVE_CAPTION_PREFERENCES,
    dictionaryEntries: DEFAULT_DICTIONARY_ENTRIES.map((entry) => ({ ...entry })),
    postProcessPreset: 'formal',
    postProcessPresets: [
      {
        id: 'formal',
        name: 'Formal',
        systemPrompt:
          'Prefer polished punctuation, complete sentences, and a professional tone while preserving the speaker intent, wording, and meaning.',
        builtIn: true,
        enablePostProcessing: true
      },
      {
        id: 'casual',
        name: 'Casual',
        systemPrompt:
          'Prefer a conversational, relaxed tone with lighter punctuation and natural shorthand when it fits, while preserving the speaker intent, wording, and meaning.',
        builtIn: true,
        enablePostProcessing: true
      }
    ],
    voiceBackendStatus: {
      ready: false,
      label: 'DashScope key required',
      detail: 'Add your DashScope API key in onboarding or settings to start dictating.'
    },
    historySummary: {
      totalCount: 0,
      wordsSpoken: 0,
      averageWpm: null
    },
    questionHistorySummary: {
      totalCount: 0
    },
    permissions: {
      hasMissing: true,
      accessibility: {
        kind: 'accessibility',
        granted: false,
        status: 'denied',
        label: 'Accessibility required',
        description: 'Enable Accessibility in System Settings so TIA Voice can hear the hotkey.',
        ctaLabel: 'Open Accessibility Settings'
      },
      microphone: {
        kind: 'microphone',
        granted: false,
        status: 'not-determined',
        label: 'Microphone permission pending',
        description: 'Enable microphone access in System Settings so TIA Voice can capture speech.',
        ctaLabel: 'Request Microphone Permission'
      }
    },
    autoUpdate: {
      status: 'idle',
      currentVersion: '0.0.0',
      availableVersion: null,
      releaseDate: null,
      lastCheckedAt: null,
      downloadProgressPercent: null,
      message: null
    },
    dictationFallback: null,
    history: [],
    questionHistory: []
  }

  return {
    getMainAppWindow(): BrowserWindow {
      return input.mainAppWindow
    },
    getChatState(): ChatState {
      return chatState
    },
    getTtsState(): TtsStatePayload {
      return ttsState
    },
    getMeetingCaptureState(): MeetingCaptureState {
      return {
        ...meetingCaptureState,
        transcriptItems: [...(meetingCaptureState.transcriptItems ?? [])]
      }
    },
    getLiveCaptionState(): LiveCaptionState {
      return {
        ...liveCaptionState,
        preferences: { ...liveCaptionState.preferences },
        lines: liveCaptionState.lines.map((line) => ({ ...line }))
      }
    },
    getAppState(): MainAppStatePayload {
      return appState
    },
    showRecordingBar(command: RecordingCommand): void {
      showOverlayWindow(input.recordingBarWindow)
      sendWhenReady(input.recordingBarWindow, IPC_CHANNELS.recording.command, command)
    },
    stopRecordingBar(): void {
      sendWhenReady(input.recordingBarWindow, IPC_CHANNELS.recording.command, { type: 'stop' })
    },
    hideRecordingBar(): void {
      if (!input.recordingBarWindow.isDestroyed()) {
        input.recordingBarWindow.hide()
      }
    },
    showMeetingCapture(command: MeetingCaptureCommand): void {
      if (!input.meetingCaptureWindow) {
        return
      }

      showOverlayWindow(input.meetingCaptureWindow)
      sendWhenReady(input.meetingCaptureWindow, IPC_CHANNELS.meetingCapture.command, command)
    },
    setMeetingCaptureState(state): void {
      meetingCaptureState = {
        ...state,
        transcriptItems: [...(state.transcriptItems ?? [])]
      }

      if (!input.meetingCaptureWindow) {
        return
      }

      if (state.status === 'idle') {
        input.meetingCaptureWindow.hide()
        return
      }

      showOverlayWindow(input.meetingCaptureWindow)
      sendWhenReady(input.meetingCaptureWindow, IPC_CHANNELS.meetingCapture.command, {
        type: state.status === 'failed' && state.errorDetail ? 'error' : 'state',
        ...(state.status === 'failed' && state.errorDetail
          ? { detail: state.errorDetail }
          : { transcriptItems: state.transcriptItems ?? [] })
      })
      sendWhenReady(input.meetingCaptureWindow, IPC_CHANNELS.meetingCapture.state, state)
    },
    stopMeetingCapture(): void {
      if (!input.meetingCaptureWindow) {
        return
      }

      sendWhenReady(input.meetingCaptureWindow, IPC_CHANNELS.meetingCapture.command, {
        type: 'stop'
      })
    },
    hideMeetingCapture(): void {
      if (!input.meetingCaptureWindow || input.meetingCaptureWindow.isDestroyed()) {
        return
      }

      input.meetingCaptureWindow.hide()
    },
    showLiveCaptionConfig(): void {
      if (!input.liveCaptionConfigWindow || input.liveCaptionConfigWindow.isDestroyed()) {
        return
      }

      input.liveCaptionConfigWindow.show()
      input.liveCaptionConfigWindow.focus()
      sendWhenReady(input.liveCaptionConfigWindow, IPC_CHANNELS.liveCaption.command, {
        type: 'state',
        state: liveCaptionState
      })
      sendWhenReady(input.liveCaptionConfigWindow, IPC_CHANNELS.liveCaption.state, liveCaptionState)
    },
    hideLiveCaptionConfig(): void {
      if (!input.liveCaptionConfigWindow || input.liveCaptionConfigWindow.isDestroyed()) {
        return
      }

      input.liveCaptionConfigWindow.hide()
    },
    showLiveCaptionOverlay(): void {
      if (!input.liveCaptionOverlayWindow || input.liveCaptionOverlayWindow.isDestroyed()) {
        return
      }

      showOverlayWindow(input.liveCaptionOverlayWindow)
      sendWhenReady(input.liveCaptionOverlayWindow, IPC_CHANNELS.liveCaption.command, {
        type: 'state',
        state: liveCaptionState
      })
      sendWhenReady(
        input.liveCaptionOverlayWindow,
        IPC_CHANNELS.liveCaption.state,
        liveCaptionState
      )
    },
    hideLiveCaptionOverlay(): void {
      if (!input.liveCaptionOverlayWindow || input.liveCaptionOverlayWindow.isDestroyed()) {
        return
      }

      input.liveCaptionOverlayWindow.hide()
    },
    setLiveCaptionState(state): void {
      liveCaptionState = {
        ...state,
        preferences: { ...state.preferences },
        lines: state.lines.map((line) => ({ ...line }))
      }

      for (const targetWindow of [input.liveCaptionConfigWindow, input.liveCaptionOverlayWindow]) {
        if (!targetWindow || targetWindow.isDestroyed()) {
          continue
        }

        sendWhenReady(targetWindow, IPC_CHANNELS.liveCaption.command, {
          type: 'state',
          state: liveCaptionState
        })
        sendWhenReady(targetWindow, IPC_CHANNELS.liveCaption.state, liveCaptionState)
      }
    },
    sendLiveCaptionCommand(command): void {
      if (!input.liveCaptionOverlayWindow || input.liveCaptionOverlayWindow.isDestroyed()) {
        return
      }

      sendWhenReady(input.liveCaptionOverlayWindow, IPC_CHANNELS.liveCaption.command, command)
    },
    showQuestionBar(command: QuestionRecordingCommand): void {
      if (!input.questionBarWindow) {
        return
      }

      setQuestionBarBounds(
        input.questionBarWindow,
        questionBarExpanded ? QUESTION_BAR_EXPANDED_SIZE : QUESTION_BAR_COMPACT_SIZE
      )
      showOverlayWindow(input.questionBarWindow)
      sendWhenReady(input.questionBarWindow, IPC_CHANNELS.questionRecording.command, command)
    },
    stopQuestionBar(): void {
      if (!input.questionBarWindow) {
        return
      }

      sendWhenReady(input.questionBarWindow, IPC_CHANNELS.questionRecording.command, {
        type: 'stop'
      })
    },
    showQuestionPending(pendingInput): void {
      if (!input.questionBarWindow) {
        return
      }

      questionBarExpanded = true
      setQuestionBarBounds(input.questionBarWindow, QUESTION_BAR_EXPANDED_SIZE)
      showOverlayWindow(input.questionBarWindow)
      sendWhenReady(input.questionBarWindow, IPC_CHANNELS.questionRecording.command, pendingInput)
    },
    showQuestionAnswer(answerInput): void {
      if (!input.questionBarWindow) {
        return
      }

      questionBarExpanded = true
      setQuestionBarBounds(input.questionBarWindow, QUESTION_BAR_EXPANDED_SIZE)
      showOverlayWindow(input.questionBarWindow)
      sendWhenReady(input.questionBarWindow, IPC_CHANNELS.questionRecording.command, {
        type: 'answer',
        question: answerInput.question,
        answer: answerInput.answer,
        selectedText: answerInput.selectedText ?? null,
        sourceApp: answerInput.sourceApp ?? null
      })
    },
    showQuestionError(detail): void {
      if (!input.questionBarWindow) {
        return
      }

      questionBarExpanded = true
      setQuestionBarBounds(input.questionBarWindow, QUESTION_BAR_EXPANDED_SIZE)
      showOverlayWindow(input.questionBarWindow)
      sendWhenReady(input.questionBarWindow, IPC_CHANNELS.questionRecording.command, {
        type: 'error',
        detail
      })
    },
    resetQuestionBar(): void {
      questionBarExpanded = false

      if (!input.questionBarWindow || input.questionBarWindow.isDestroyed()) {
        return
      }

      sendWhenReady(input.questionBarWindow, IPC_CHANNELS.questionRecording.command, {
        type: 'clear'
      })
      setQuestionBarBounds(input.questionBarWindow, QUESTION_BAR_COMPACT_SIZE)
      input.questionBarWindow.hide()
    },
    hideQuestionBar(): void {
      if (!input.questionBarWindow || input.questionBarWindow.isDestroyed()) {
        return
      }

      input.questionBarWindow.hide()
    },
    setTtsState(state: TtsStatePayload): void {
      ttsState = state

      if (!input.ttsPlayerWindow) {
        return
      }

      if (state.status === 'idle') {
        input.ttsPlayerWindow.hide()
      } else {
        showOverlayWindow(input.ttsPlayerWindow)
      }

      sendWhenReady(input.ttsPlayerWindow, IPC_CHANNELS.tts.state, state)
    },
    hideTtsPlayer(): void {
      ttsState = {
        status: 'idle',
        sessionId: null,
        source: null,
        text: '',
        audioUrl: null,
        audioExpiresAt: null,
        segments: [],
        voice: null,
        model: null,
        createdAt: null,
        error: null
      }

      if (!input.ttsPlayerWindow || input.ttsPlayerWindow.isDestroyed()) {
        return
      }

      input.ttsPlayerWindow.hide()
      sendWhenReady(input.ttsPlayerWindow, IPC_CHANNELS.tts.state, ttsState)
    },
    closeAllWindows(): void {
      closeManagedWindow(input.ttsPlayerWindow)
      closeManagedWindow(input.chatWindow)
      closeManagedWindow(input.questionBarWindow)
      closeManagedWindow(input.liveCaptionOverlayWindow)
      closeManagedWindow(input.liveCaptionConfigWindow)
      closeManagedWindow(input.meetingCaptureWindow)
      closeManagedWindow(input.recordingBarWindow)
      closeManagedWindow(input.mainAppWindow)
    },
    setChatState(state: ChatState): void {
      chatState = state

      if (!input.chatWindow) {
        return
      }

      if (state.phase === 'idle') {
        input.chatWindow.hide()
      } else {
        showOverlayWindow(input.chatWindow)
      }

      sendWhenReady(input.chatWindow, IPC_CHANNELS.chat.state, state)
    },
    setAppState(state: MainAppStatePayload): void {
      appState = state
      sendWhenReady(input.mainAppWindow, IPC_CHANNELS.app.state, state)
    }
  }
}
