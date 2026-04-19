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

export function showOnboardingWindow(): ReturnType<TiaApi['showOnboardingWindow']> {
  return getApi().showOnboardingWindow()
}

export function logRendererDebug(message: string, details?: unknown): void {
  getApi().logDebug(message, details)
}

export function getDebugLogPath(): ReturnType<TiaApi['getDebugLogPath']> {
  return getApi().getDebugLogPath()
}
