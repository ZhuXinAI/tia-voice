import {
  APP_LANGUAGES,
  LANGUAGE_PREFERENCES,
  type AppLanguage,
  type LanguagePreference
} from '../../shared/i18n/config'

export const IPC_CHANNELS = {
  recording: {
    command: 'recording:command',
    complete: 'recording:complete',
    failed: 'recording:failed'
  },
  debug: {
    log: 'debug:log',
    getLogPath: 'debug:get-log-path'
  },
  chat: {
    state: 'chat:state',
    getState: 'chat:get-state'
  },
  app: {
    state: 'app:state',
    getState: 'app:get-state',
    getHistoryPage: 'app:get-history-page',
    getHistoryEntryDebug: 'app:get-history-entry-debug',
    retryHistory: 'app:retry-history',
    startDictation: 'app:start-dictation',
    stopDictation: 'app:stop-dictation',
    setThemeMode: 'app:set-theme-mode',
    setLanguage: 'app:set-language',
    setPostProcessPreset: 'app:set-post-process-preset',
    savePostProcessPreset: 'app:save-post-process-preset',
    resetPostProcessPreset: 'app:reset-post-process-preset',
    createPostProcessPreset: 'app:create-post-process-preset',
    setHotkey: 'app:set-hotkey',
    setMicrophone: 'app:set-microphone',
    setProvider: 'app:set-provider',
    setProviderLlmModel: 'app:set-provider-llm-model',
    getProviderSetup: 'app:get-provider-setup',
    saveDashscopeApiKey: 'app:save-dashscope-api-key',
    saveOpenAiApiKey: 'app:save-openai-api-key',
    completeOnboarding: 'app:complete-onboarding',
    checkAccessibilityPermission: 'app:check-accessibility-permission',
    checkMicrophonePermission: 'app:check-microphone-permission',
    reportMicrophonePermissionGranted: 'app:report-microphone-permission-granted',
    openPermissionSettings: 'app:open-permission-settings',
    resetOnboarding: 'app:reset-onboarding',
    showOnboardingWindow: 'app:show-onboarding-window',
    checkForUpdates: 'app:check-for-updates',
    restartToUpdate: 'app:restart-to-update'
  }
} as const

export const THEME_MODES = ['system', 'light', 'dark'] as const
export const POST_PROCESS_PRESET_IDS = ['formal', 'casual'] as const
export type ThemeMode = (typeof THEME_MODES)[number]
export type BuiltInPostProcessPresetId = (typeof POST_PROCESS_PRESET_IDS)[number]
export type PostProcessPresetId = string
export { APP_LANGUAGES, LANGUAGE_PREFERENCES }
export type { AppLanguage, LanguagePreference }
export type ProviderKind = 'dashscope' | 'openai'
export type TriggerKey = 'MetaRight' | 'AltRight' | 'ControlRight'
export type PermissionKind = 'accessibility' | 'microphone'
export type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

export type HistoryPagePayload = {
  items: MainAppStatePayload['history']
  totalCount: number
}

export type PermissionStatePayload = {
  kind: PermissionKind
  granted: boolean
  status: PermissionStatus
  label: string
  description: string
  ctaLabel: string
}

export type PostProcessPresetPayload = {
  id: string
  name: string
  systemPrompt: string
  builtIn: boolean
  enablePostProcessing: boolean
}

export type MainAppStatePayload = {
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

export type ProviderSetupPayload = {
  configured: boolean
  keyLabel: string | null
}

export type AppInfoPayload = {
  name: string
  version: string
}

export type AutoUpdateStatus =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'update-downloaded'
  | 'up-to-date'
  | 'unsupported'
  | 'error'

export type AutoUpdateStatePayload = {
  status: AutoUpdateStatus
  currentVersion: string
  availableVersion: string | null
  releaseDate: string | null
  lastCheckedAt: number | null
  downloadProgressPercent: number | null
  message: string | null
}
