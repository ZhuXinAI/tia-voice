import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type AppInfoPayload,
  type AppLanguage,
  type AutoUpdateStatePayload,
  type DictionaryEntryPayload,
  type LanguagePreference,
  type PostProcessPresetPayload,
  type PostProcessPresetId,
  type HistoryPagePayload,
  type PermissionKind,
  type PermissionStatePayload,
  type ProviderKind,
  type ProviderSetupPayload,
  type SelectionToolbarStatePayload,
  type TtsStatePayload,
  type TriggerKey,
  type ThemeMode
} from '../main/ipc/channels'
import type { TtsSource } from '../shared/tts'

export type {
  AppLanguage,
  DictionaryEntryPayload,
  LanguagePreference,
  PostProcessPresetId,
  ProviderKind,
  SelectionToolbarStatePayload,
  TtsStatePayload,
  ThemeMode,
  TriggerKey
}
export type { PostProcessPresetPayload }
export type { TtsSource }

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
      deviceId?: string | null
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
  llmProcessing: 'pending' | 'completed' | 'skipped' | 'failed'
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
  appInfo: AppInfoPayload
  hotkeyHint: string
  registeredHotkey: TriggerKey | null
  registeredHotkeyLabel: string | null
  selectedProvider: ProviderKind
  microphone: {
    selectedDeviceId: string | null
    selectedDeviceLabel: string | null
  }
  providerLabels: {
    asr: string
    llm: string
  }
  dashscope: {
    configured: boolean
    keyLabel: string | null
    asrModel: string
    llmModel: string
    availableLlmModels: string[]
  }
  openai: {
    configured: boolean
    keyLabel: string | null
    asrModel: string
    llmModel: string
    availableLlmModels: string[]
  }
  onboarding: {
    completed: boolean
    visible: boolean
  }
  language: {
    preference: LanguagePreference
    resolved: AppLanguage
  }
  themeMode: ThemeMode
  features: {
    selectionToolbar: boolean
  }
  dictionaryEntries: DictionaryEntryPayload[]
  postProcessPreset: PostProcessPresetId
  postProcessPresets: PostProcessPresetPayload[]
  voiceBackendStatus: {
    ready: boolean
    label: string
    detail: string
  }
  historySummary: {
    totalCount: number
    wordsSpoken: number
    averageWpm: number | null
  }
  permissions: {
    hasMissing: boolean
    accessibility: PermissionStatePayload
    microphone: PermissionStatePayload
  }
  autoUpdate: AutoUpdateStatePayload
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
  onSelectionToolbarState(listener: (state: SelectionToolbarStatePayload) => void): () => void
  onTtsState(listener: (state: TtsStatePayload) => void): () => void
  onAppState(listener: (state: MainAppState) => void): () => void
  getChatState(): Promise<TiaChatState>
  getSelectionToolbarState(): Promise<SelectionToolbarStatePayload>
  getTtsState(): Promise<TtsStatePayload>
  getMainAppState(): Promise<MainAppState>
  getHistoryPage(input?: { offset?: number; limit?: number }): Promise<HistoryPagePayload>
  getHistoryEntryDebug(entryId: string): Promise<TiaHistoryDebugEntry | null>
  retryHistoryEntry(entryId: string): Promise<void>
  startDictation(source?: 'global' | 'onboarding'): Promise<void>
  stopDictation(source?: 'global' | 'onboarding'): Promise<void>
  startTextToSpeech(input: { text: string; source?: TtsSource }): Promise<void>
  stopTextToSpeech(): Promise<void>
  setThemeMode(themeMode: ThemeMode): Promise<void>
  setLanguage(language: LanguagePreference): Promise<void>
  setSelectionToolbarEnabled(enabled: boolean): Promise<void>
  saveDictionaryEntry(input: {
    id?: string | null
    phrase: string
    replacement: string
    notes?: string | null
  }): Promise<DictionaryEntryPayload>
  deleteDictionaryEntry(entryId: string): Promise<void>
  setPostProcessPreset(presetId: PostProcessPresetId): Promise<void>
  savePostProcessPreset(input: {
    id: string
    name: string
    systemPrompt: string
    enablePostProcessing: boolean
  }): Promise<PostProcessPresetPayload>
  resetPostProcessPreset(presetId: string): Promise<PostProcessPresetPayload>
  createPostProcessPreset(input: {
    name: string
    systemPrompt: string
    enablePostProcessing: boolean
  }): Promise<PostProcessPresetPayload>
  setHotkey(hotkey: TriggerKey): Promise<void>
  setMicrophone(input: { deviceId: string | null; label: string | null }): Promise<void>
  setProvider(provider: ProviderKind): Promise<void>
  setProviderLlmModel(input: { provider: ProviderKind; model: string }): Promise<void>
  getProviderSetup(): Promise<ProviderSetupPayload>
  saveDashscopeApiKey(apiKey: string): Promise<ProviderSetupPayload>
  saveOpenAiApiKey(apiKey: string): Promise<ProviderSetupPayload>
  completeOnboarding(): Promise<void>
  resetOnboarding(): Promise<void>
  checkAccessibilityPermission(prompt: boolean): Promise<boolean>
  checkMicrophonePermission(prompt: boolean): Promise<boolean>
  reportMicrophonePermissionGranted(): Promise<void>
  openPermissionSettings(permission: PermissionKind): Promise<void>
  checkForUpdates(): Promise<AutoUpdateStatePayload>
  restartToUpdate(): Promise<void>
  showOnboardingWindow(): Promise<void>
  logDebug(message: string, details?: unknown): void
  getDebugLogPath(): Promise<string>
}

const RECORDING_COMMAND_CHANNEL = 'recording:command'
const RECORDING_COMPLETE_CHANNEL = 'recording:complete'
const RECORDING_FAILED_CHANNEL = 'recording:failed'
const CHAT_STATE_CHANNEL = 'chat:state'
const CHAT_STATE_REQUEST_CHANNEL = 'chat:get-state'
const SELECTION_TOOLBAR_STATE_CHANNEL = IPC_CHANNELS.selectionToolbar.state
const SELECTION_TOOLBAR_STATE_REQUEST_CHANNEL = IPC_CHANNELS.selectionToolbar.getState
const TTS_STATE_CHANNEL = IPC_CHANNELS.tts.state
const TTS_STATE_REQUEST_CHANNEL = IPC_CHANNELS.tts.getState
const TTS_START_CHANNEL = IPC_CHANNELS.tts.start
const TTS_STOP_CHANNEL = IPC_CHANNELS.tts.stop
const APP_STATE_CHANNEL = 'app:state'
const APP_STATE_REQUEST_CHANNEL = 'app:get-state'
const APP_GET_HISTORY_PAGE_CHANNEL = IPC_CHANNELS.app.getHistoryPage
const APP_GET_HISTORY_ENTRY_DEBUG_CHANNEL = IPC_CHANNELS.app.getHistoryEntryDebug
const APP_RETRY_HISTORY_CHANNEL = 'app:retry-history'
const APP_START_DICTATION_CHANNEL = IPC_CHANNELS.app.startDictation
const APP_STOP_DICTATION_CHANNEL = IPC_CHANNELS.app.stopDictation
const APP_SET_THEME_MODE_CHANNEL = IPC_CHANNELS.app.setThemeMode
const APP_SET_LANGUAGE_CHANNEL = IPC_CHANNELS.app.setLanguage
const APP_SET_SELECTION_TOOLBAR_ENABLED_CHANNEL = IPC_CHANNELS.app.setSelectionToolbarEnabled
const APP_SAVE_DICTIONARY_ENTRY_CHANNEL = IPC_CHANNELS.app.saveDictionaryEntry
const APP_DELETE_DICTIONARY_ENTRY_CHANNEL = IPC_CHANNELS.app.deleteDictionaryEntry
const APP_SET_POST_PROCESS_PRESET_CHANNEL = IPC_CHANNELS.app.setPostProcessPreset
const APP_SAVE_POST_PROCESS_PRESET_CHANNEL = IPC_CHANNELS.app.savePostProcessPreset
const APP_RESET_POST_PROCESS_PRESET_CHANNEL = IPC_CHANNELS.app.resetPostProcessPreset
const APP_CREATE_POST_PROCESS_PRESET_CHANNEL = IPC_CHANNELS.app.createPostProcessPreset
const APP_SET_HOTKEY_CHANNEL = IPC_CHANNELS.app.setHotkey
const APP_SET_MICROPHONE_CHANNEL = IPC_CHANNELS.app.setMicrophone
const APP_SET_PROVIDER_CHANNEL = IPC_CHANNELS.app.setProvider
const APP_SET_PROVIDER_LLM_MODEL_CHANNEL = IPC_CHANNELS.app.setProviderLlmModel
const APP_GET_PROVIDER_SETUP_CHANNEL = IPC_CHANNELS.app.getProviderSetup
const APP_SAVE_DASHSCOPE_API_KEY_CHANNEL = IPC_CHANNELS.app.saveDashscopeApiKey
const APP_SAVE_OPENAI_API_KEY_CHANNEL = IPC_CHANNELS.app.saveOpenAiApiKey
const APP_COMPLETE_ONBOARDING_CHANNEL = IPC_CHANNELS.app.completeOnboarding
const APP_RESET_ONBOARDING_CHANNEL = IPC_CHANNELS.app.resetOnboarding
const APP_CHECK_ACCESSIBILITY_PERMISSION_CHANNEL = IPC_CHANNELS.app.checkAccessibilityPermission
const APP_CHECK_MICROPHONE_PERMISSION_CHANNEL = IPC_CHANNELS.app.checkMicrophonePermission
const APP_REPORT_MICROPHONE_PERMISSION_GRANTED_CHANNEL =
  IPC_CHANNELS.app.reportMicrophonePermissionGranted
const APP_OPEN_PERMISSION_SETTINGS_CHANNEL = IPC_CHANNELS.app.openPermissionSettings
const APP_CHECK_FOR_UPDATES_CHANNEL = IPC_CHANNELS.app.checkForUpdates
const APP_RESTART_TO_UPDATE_CHANNEL = IPC_CHANNELS.app.restartToUpdate
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
  onSelectionToolbarState(listener) {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      state: SelectionToolbarStatePayload
    ): void => listener(state)
    ipcRenderer.on(SELECTION_TOOLBAR_STATE_CHANNEL, wrapped)
    return () => ipcRenderer.removeListener(SELECTION_TOOLBAR_STATE_CHANNEL, wrapped)
  },
  onTtsState(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, state: TtsStatePayload): void =>
      listener(state)
    ipcRenderer.on(TTS_STATE_CHANNEL, wrapped)
    return () => ipcRenderer.removeListener(TTS_STATE_CHANNEL, wrapped)
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
  getSelectionToolbarState() {
    return ipcRenderer.invoke(SELECTION_TOOLBAR_STATE_REQUEST_CHANNEL)
  },
  getTtsState() {
    return ipcRenderer.invoke(TTS_STATE_REQUEST_CHANNEL)
  },
  getMainAppState() {
    return ipcRenderer.invoke(APP_STATE_REQUEST_CHANNEL)
  },
  getHistoryPage(input) {
    return ipcRenderer.invoke(APP_GET_HISTORY_PAGE_CHANNEL, input)
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
  startTextToSpeech(input) {
    return ipcRenderer.invoke(TTS_START_CHANNEL, input)
  },
  stopTextToSpeech() {
    return ipcRenderer.invoke(TTS_STOP_CHANNEL)
  },
  setThemeMode(themeMode) {
    return ipcRenderer.invoke(APP_SET_THEME_MODE_CHANNEL, themeMode)
  },
  setLanguage(language) {
    return ipcRenderer.invoke(APP_SET_LANGUAGE_CHANNEL, language)
  },
  setSelectionToolbarEnabled(enabled) {
    return ipcRenderer.invoke(APP_SET_SELECTION_TOOLBAR_ENABLED_CHANNEL, enabled)
  },
  saveDictionaryEntry(input) {
    return ipcRenderer.invoke(APP_SAVE_DICTIONARY_ENTRY_CHANNEL, input)
  },
  deleteDictionaryEntry(entryId) {
    return ipcRenderer.invoke(APP_DELETE_DICTIONARY_ENTRY_CHANNEL, entryId)
  },
  setPostProcessPreset(presetId) {
    return ipcRenderer.invoke(APP_SET_POST_PROCESS_PRESET_CHANNEL, presetId)
  },
  savePostProcessPreset(input) {
    return ipcRenderer.invoke(APP_SAVE_POST_PROCESS_PRESET_CHANNEL, input)
  },
  resetPostProcessPreset(presetId) {
    return ipcRenderer.invoke(APP_RESET_POST_PROCESS_PRESET_CHANNEL, presetId)
  },
  createPostProcessPreset(input) {
    return ipcRenderer.invoke(APP_CREATE_POST_PROCESS_PRESET_CHANNEL, input)
  },
  setHotkey(hotkey) {
    return ipcRenderer.invoke(APP_SET_HOTKEY_CHANNEL, hotkey)
  },
  setMicrophone(input) {
    return ipcRenderer.invoke(APP_SET_MICROPHONE_CHANNEL, input)
  },
  setProvider(provider) {
    return ipcRenderer.invoke(APP_SET_PROVIDER_CHANNEL, provider)
  },
  setProviderLlmModel(input) {
    return ipcRenderer.invoke(APP_SET_PROVIDER_LLM_MODEL_CHANNEL, input)
  },
  getProviderSetup() {
    return ipcRenderer.invoke(APP_GET_PROVIDER_SETUP_CHANNEL)
  },
  saveDashscopeApiKey(apiKey) {
    return ipcRenderer.invoke(APP_SAVE_DASHSCOPE_API_KEY_CHANNEL, apiKey)
  },
  saveOpenAiApiKey(apiKey) {
    return ipcRenderer.invoke(APP_SAVE_OPENAI_API_KEY_CHANNEL, apiKey)
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
  checkMicrophonePermission(prompt) {
    return ipcRenderer.invoke(APP_CHECK_MICROPHONE_PERMISSION_CHANNEL, prompt)
  },
  reportMicrophonePermissionGranted() {
    return ipcRenderer.invoke(APP_REPORT_MICROPHONE_PERMISSION_GRANTED_CHANNEL)
  },
  openPermissionSettings(permission) {
    return ipcRenderer.invoke(APP_OPEN_PERMISSION_SETTINGS_CHANNEL, permission)
  },
  checkForUpdates() {
    return ipcRenderer.invoke(APP_CHECK_FOR_UPDATES_CHANNEL)
  },
  restartToUpdate() {
    return ipcRenderer.invoke(APP_RESTART_TO_UPDATE_CHANNEL)
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
