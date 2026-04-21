import { BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

import { IPC_CHANNELS, type MainAppStatePayload } from '../ipc/channels'
import type { ChatState, RecordingCommand } from '../recording/types'

export type WindowRole = 'main-app' | 'recording-bar' | 'chat'
export type WindowManager = {
  getMainAppWindow(): BrowserWindow
  getChatState(): ChatState
  getAppState(): MainAppStatePayload
  showRecordingBar(command: RecordingCommand): void
  stopRecordingBar(): void
  hideRecordingBar(): void
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

export function createWindowManager(input: {
  mainAppWindow: BrowserWindow
  recordingBarWindow: BrowserWindow
  chatWindow?: BrowserWindow
}): WindowManager {
  let chatState: ChatState = { phase: 'idle' }
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
      llm: 'qwen-plus'
    },
    dashscope: {
      configured: false,
      keyLabel: null
    },
    openai: {
      configured: false,
      keyLabel: null
    },
    onboarding: {
      completed: false,
      visible: true
    },
    themeMode: 'system',
    postProcessPreset: 'formal',
    postProcessPresets: [
      {
        id: 'formal',
        name: 'Formal',
        systemPrompt:
          'Prefer polished punctuation, complete sentences, and a professional tone while preserving the speaker intent, wording, and meaning.',
        builtIn: true
      },
      {
        id: 'casual',
        name: 'Casual',
        systemPrompt:
          'Prefer a conversational, relaxed tone with lighter punctuation and natural shorthand when it fits, while preserving the speaker intent, wording, and meaning.',
        builtIn: true
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
    history: []
  }

  return {
    getMainAppWindow(): BrowserWindow {
      return input.mainAppWindow
    },
    getChatState(): ChatState {
      return chatState
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
