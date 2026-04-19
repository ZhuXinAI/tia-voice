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
    getHistoryEntryDebug: 'app:get-history-entry-debug',
    retryHistory: 'app:retry-history',
    startDictation: 'app:start-dictation',
    stopDictation: 'app:stop-dictation',
    setThemeMode: 'app:set-theme-mode',
    getProviderSetup: 'app:get-provider-setup',
    saveDashscopeApiKey: 'app:save-dashscope-api-key',
    completeOnboarding: 'app:complete-onboarding',
    checkAccessibilityPermission: 'app:check-accessibility-permission',
    checkMicrophonePermission: 'app:check-microphone-permission',
    openPermissionSettings: 'app:open-permission-settings',
    resetOnboarding: 'app:reset-onboarding',
    showOnboardingWindow: 'app:show-onboarding-window'
  }
} as const

export const THEME_MODES = ['system', 'light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]
export type PermissionKind = 'accessibility' | 'microphone'
export type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

export type PermissionStatePayload = {
  kind: PermissionKind
  granted: boolean
  status: PermissionStatus
  label: string
  description: string
  ctaLabel: string
}

export type MainAppStatePayload = {
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
  permissions: {
    hasMissing: boolean
    accessibility: PermissionStatePayload
    microphone: PermissionStatePayload
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

export type ProviderSetupPayload = {
  configured: boolean
  keyLabel: string | null
}
