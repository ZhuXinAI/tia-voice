import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type ProviderSetupPayload, type ThemeMode } from '../main/ipc/channels'

export type { ThemeMode }

export type ElectronBridge = {
  process: {
    platform: NodeJS.Platform
    versions: NodeJS.ProcessVersions
    env: NodeJS.ProcessEnv
  }
}

export type RecordingCommand =
  | {
      type: 'start'
      startedAt: number
    }
  | {
      type: 'stop'
    }

export type RecordingArtifact = {
  mimeType: string
  buffer: Uint8Array
  durationMs: number
}

export type TiaChatState = {
  phase: 'idle' | 'thinking' | 'done' | 'error'
  text?: string
  detail?: string
}

export type TiaHistoryDebugEntry = {
  id: string
  createdAt: number
  status: 'pending' | 'completed' | 'failed'
  transcript: string
  cleanedText: string
  errorDetail?: string
  audio?: {
    bytes: Uint8Array
    mimeType: string
    durationMs: number
    sizeBytes: number
  }
}

export type MainAppState = {
  hotkeyHint: string
  registeredHotkey: 'MetaRight' | 'AltRight' | null
  registeredHotkeyLabel: string | null
  providerLabels: {
    asr: string
    llm: string
  }
  dashscope: {
    configured: boolean
    keyLabel: string | null
  }
  onboarding: {
    completed: boolean
    visible: boolean
  }
  themeMode: ThemeMode
  voiceBackendStatus: {
    ready: boolean
    label: string
    detail: string
  }
  history: Array<{
    id: string
    createdAt: number
    title: string
    preview: string
    status: 'pending' | 'completed' | 'failed'
    errorDetail?: string
    hasAudio: boolean
  }>
}

export type TiaApi = {
  onRecordingCommand(listener: (command: RecordingCommand) => void): () => void
  submitRecordingArtifact(artifact: RecordingArtifact): Promise<void>
  reportRecordingFailure(detail: string): Promise<void>
  onChatState(listener: (state: TiaChatState) => void): () => void
  onAppState(listener: (state: MainAppState) => void): () => void
  getChatState(): Promise<TiaChatState>
  getMainAppState(): Promise<MainAppState>
  getHistoryEntryDebug(entryId: string): Promise<TiaHistoryDebugEntry | null>
  retryHistoryEntry(entryId: string): Promise<void>
  startDictation(source?: 'global' | 'onboarding'): Promise<void>
  stopDictation(source?: 'global' | 'onboarding'): Promise<void>
  setThemeMode(themeMode: ThemeMode): Promise<void>
  getProviderSetup(): Promise<ProviderSetupPayload>
  saveDashscopeApiKey(apiKey: string): Promise<ProviderSetupPayload>
  completeOnboarding(): Promise<void>
  resetOnboarding(): Promise<void>
  checkAccessibilityPermission(prompt: boolean): Promise<boolean>
  showOnboardingWindow(): Promise<void>
  logDebug(message: string, details?: unknown): void
  getDebugLogPath(): Promise<string>
}

const RECORDING_COMMAND_CHANNEL = 'recording:command'
const RECORDING_COMPLETE_CHANNEL = 'recording:complete'
const RECORDING_FAILED_CHANNEL = 'recording:failed'
const CHAT_STATE_CHANNEL = 'chat:state'
const CHAT_STATE_REQUEST_CHANNEL = 'chat:get-state'
const APP_STATE_CHANNEL = 'app:state'
const APP_STATE_REQUEST_CHANNEL = 'app:get-state'
const APP_GET_HISTORY_ENTRY_DEBUG_CHANNEL = IPC_CHANNELS.app.getHistoryEntryDebug
const APP_RETRY_HISTORY_CHANNEL = 'app:retry-history'
const APP_START_DICTATION_CHANNEL = IPC_CHANNELS.app.startDictation
const APP_STOP_DICTATION_CHANNEL = IPC_CHANNELS.app.stopDictation
const APP_SET_THEME_MODE_CHANNEL = IPC_CHANNELS.app.setThemeMode
const APP_GET_PROVIDER_SETUP_CHANNEL = IPC_CHANNELS.app.getProviderSetup
const APP_SAVE_DASHSCOPE_API_KEY_CHANNEL = IPC_CHANNELS.app.saveDashscopeApiKey
const APP_COMPLETE_ONBOARDING_CHANNEL = IPC_CHANNELS.app.completeOnboarding
const APP_RESET_ONBOARDING_CHANNEL = IPC_CHANNELS.app.resetOnboarding
const APP_CHECK_ACCESSIBILITY_PERMISSION_CHANNEL = IPC_CHANNELS.app.checkAccessibilityPermission
const APP_SHOW_ONBOARDING_WINDOW_CHANNEL = IPC_CHANNELS.app.showOnboardingWindow
const electronBridge: ElectronBridge = {
  process: {
    platform: process.platform,
    versions: process.versions,
    env: process.env
  }
}

const api: TiaApi = {
  onRecordingCommand(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, command: RecordingCommand): void =>
      listener(command)
    ipcRenderer.on(RECORDING_COMMAND_CHANNEL, wrapped)
    return () => ipcRenderer.removeListener(RECORDING_COMMAND_CHANNEL, wrapped)
  },
  submitRecordingArtifact(artifact) {
    return ipcRenderer.invoke(RECORDING_COMPLETE_CHANNEL, {
      ...artifact,
      buffer: Array.from(artifact.buffer)
    })
  },
  reportRecordingFailure(detail) {
    return ipcRenderer.invoke(RECORDING_FAILED_CHANNEL, detail)
  },
  onChatState(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, state: TiaChatState): void =>
      listener(state)
    ipcRenderer.on(CHAT_STATE_CHANNEL, wrapped)
    return () => ipcRenderer.removeListener(CHAT_STATE_CHANNEL, wrapped)
  },
  onAppState(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, state: MainAppState): void =>
      listener(state)
    ipcRenderer.on(APP_STATE_CHANNEL, wrapped)
    return () => ipcRenderer.removeListener(APP_STATE_CHANNEL, wrapped)
  },
  getChatState() {
    return ipcRenderer.invoke(CHAT_STATE_REQUEST_CHANNEL)
  },
  getMainAppState() {
    return ipcRenderer.invoke(APP_STATE_REQUEST_CHANNEL)
  },
  getHistoryEntryDebug(entryId) {
    return ipcRenderer.invoke(APP_GET_HISTORY_ENTRY_DEBUG_CHANNEL, entryId)
  },
  retryHistoryEntry(entryId) {
    return ipcRenderer.invoke(APP_RETRY_HISTORY_CHANNEL, entryId)
  },
  startDictation(source = 'global') {
    return ipcRenderer.invoke(APP_START_DICTATION_CHANNEL, source)
  },
  stopDictation(source = 'global') {
    return ipcRenderer.invoke(APP_STOP_DICTATION_CHANNEL, source)
  },
  setThemeMode(themeMode) {
    return ipcRenderer.invoke(APP_SET_THEME_MODE_CHANNEL, themeMode)
  },
  getProviderSetup() {
    return ipcRenderer.invoke(APP_GET_PROVIDER_SETUP_CHANNEL)
  },
  saveDashscopeApiKey(apiKey) {
    return ipcRenderer.invoke(APP_SAVE_DASHSCOPE_API_KEY_CHANNEL, apiKey)
  },
  completeOnboarding() {
    return ipcRenderer.invoke(APP_COMPLETE_ONBOARDING_CHANNEL)
  },
  resetOnboarding() {
    return ipcRenderer.invoke(APP_RESET_ONBOARDING_CHANNEL)
  },
  checkAccessibilityPermission(prompt) {
    return ipcRenderer.invoke(APP_CHECK_ACCESSIBILITY_PERMISSION_CHANNEL, prompt)
  },
  showOnboardingWindow() {
    return ipcRenderer.invoke(APP_SHOW_ONBOARDING_WINDOW_CHANNEL)
  },
  logDebug(message, details) {
    ipcRenderer.send(IPC_CHANNELS.debug.log, { message, details })
  },
  getDebugLogPath() {
    return ipcRenderer.invoke(IPC_CHANNELS.debug.getLogPath)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronBridge)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronBridge
  // @ts-ignore (define in dts)
  window.api = api
}
