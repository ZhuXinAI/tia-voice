import type {
  RecordingArtifact,
  RecordingCommand,
  TiaApi,
  TiaChatState
} from '../../../preload/index'

export type Unsubscribe = () => void

const noopMainAppState = {
  hotkeyHint: 'Hold the push-to-talk key',
  registeredHotkey: null,
  registeredHotkeyLabel: null,
  providerLabels: { asr: 'qwen3-asr-flash', llm: 'qwen-plus' },
  dashscope: {
    configured: false,
    keyLabel: null
  },
  onboarding: {
    completed: false,
    visible: true
  },
  themeMode: 'system' as const,
  voiceBackendStatus: {
    ready: false,
    label: 'DashScope key required',
    detail: 'Add your DashScope API key in onboarding or settings to start dictating.'
  },
  permissions: {
    hasMissing: true,
    accessibility: {
      kind: 'accessibility' as const,
      granted: false,
      status: 'denied' as const,
      label: 'Accessibility required',
      description: 'Enable Accessibility in System Settings so TIA Voice can hear the hotkey.',
      ctaLabel: 'Open Accessibility Settings'
    },
    microphone: {
      kind: 'microphone' as const,
      granted: false,
      status: 'not-determined' as const,
      label: 'Microphone required',
      description: 'Enable microphone access in System Settings so TIA Voice can capture audio.',
      ctaLabel: 'Open Microphone Settings'
    }
  },
  history: []
}

const noopApi: TiaApi = {
  onRecordingCommand: () => () => undefined,
  submitRecordingArtifact: async () => undefined,
  reportRecordingFailure: async () => undefined,
  onChatState: () => () => undefined,
  onAppState: () => () => undefined,
  getChatState: async () => ({ phase: 'idle' }),
  getMainAppState: async () => noopMainAppState,
  getHistoryEntryDebug: async () => null,
  retryHistoryEntry: async () => undefined,
  startDictation: async () => undefined,
  stopDictation: async () => undefined,
  setThemeMode: async () => undefined,
  getProviderSetup: async () => ({ configured: false, keyLabel: null }),
  saveDashscopeApiKey: async () => ({ configured: true, keyLabel: 'Saved locally' }),
  completeOnboarding: async () => undefined,
  resetOnboarding: async () => undefined,
  checkAccessibilityPermission: async () => true,
  checkMicrophonePermission: async () => true,
  openPermissionSettings: async () => undefined,
  showOnboardingWindow: async () => undefined,
  logDebug: () => undefined,
  getDebugLogPath: async () => ''
}

export function getApi(): TiaApi {
  return (window.api as TiaApi | undefined) ?? noopApi
}

export function subscribeToRecordingCommand(
  listener: (command: RecordingCommand) => void
): Unsubscribe {
  return getApi().onRecordingCommand(listener)
}

export function submitRecordingArtifact(artifact: RecordingArtifact): Promise<void> {
  return getApi().submitRecordingArtifact(artifact)
}

export function reportRecordingFailure(detail: string): Promise<void> {
  return getApi().reportRecordingFailure(detail)
}

export function subscribeToChatState(listener: (state: TiaChatState) => void): Unsubscribe {
  return getApi().onChatState(listener)
}

export function subscribeToAppState(
  listener: (state: Awaited<ReturnType<TiaApi['getMainAppState']>>) => void
): Unsubscribe {
  return getApi().onAppState(listener)
}

export function getChatState(): Promise<TiaChatState> {
  return getApi().getChatState()
}

export function getMainAppState(): ReturnType<TiaApi['getMainAppState']> {
  return getApi().getMainAppState()
}

export function getHistoryEntryDebug(
  entryId: Parameters<TiaApi['getHistoryEntryDebug']>[0]
): ReturnType<TiaApi['getHistoryEntryDebug']> {
  return getApi().getHistoryEntryDebug(entryId)
}

export function retryHistoryEntry(entryId: string): ReturnType<TiaApi['retryHistoryEntry']> {
  return getApi().retryHistoryEntry(entryId)
}

export function startDictation(
  source?: Parameters<TiaApi['startDictation']>[0]
): ReturnType<TiaApi['startDictation']> {
  return getApi().startDictation(source)
}

export function stopDictation(
  source?: Parameters<TiaApi['stopDictation']>[0]
): ReturnType<TiaApi['stopDictation']> {
  return getApi().stopDictation(source)
}

export function setThemeMode(
  themeMode: Parameters<TiaApi['setThemeMode']>[0]
): ReturnType<TiaApi['setThemeMode']> {
  return getApi().setThemeMode(themeMode)
}

export function getProviderSetup(): ReturnType<TiaApi['getProviderSetup']> {
  return getApi().getProviderSetup()
}

export function saveDashscopeApiKey(
  apiKey: Parameters<TiaApi['saveDashscopeApiKey']>[0]
): ReturnType<TiaApi['saveDashscopeApiKey']> {
  return getApi().saveDashscopeApiKey(apiKey)
}

export function completeOnboarding(): ReturnType<TiaApi['completeOnboarding']> {
  return getApi().completeOnboarding()
}

export function resetOnboarding(): ReturnType<TiaApi['resetOnboarding']> {
  return getApi().resetOnboarding()
}

export function checkAccessibilityPermission(
  prompt: Parameters<TiaApi['checkAccessibilityPermission']>[0]
): ReturnType<TiaApi['checkAccessibilityPermission']> {
  return getApi().checkAccessibilityPermission(prompt)
}

export function checkMicrophonePermission(
  prompt: Parameters<TiaApi['checkMicrophonePermission']>[0]
): ReturnType<TiaApi['checkMicrophonePermission']> {
  return getApi().checkMicrophonePermission(prompt)
}

export function openPermissionSettings(
  permission: Parameters<TiaApi['openPermissionSettings']>[0]
): ReturnType<TiaApi['openPermissionSettings']> {
  return getApi().openPermissionSettings(permission)
}

export function showOnboardingWindow(): ReturnType<TiaApi['showOnboardingWindow']> {
  return getApi().showOnboardingWindow()
}

export function logRendererDebug(message: string, details?: unknown): void {
  getApi().logDebug(message, details)
}

export function getDebugLogPath(): ReturnType<TiaApi['getDebugLogPath']> {
  return getApi().getDebugLogPath()
}
