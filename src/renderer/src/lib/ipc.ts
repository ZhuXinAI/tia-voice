import type {
  RecordingArtifact,
  RecordingCommand,
  TiaApi,
  TiaChatState
} from '../../../preload/index'

export type Unsubscribe = () => void

const noopMainAppState = {
  appInfo: {
    name: 'TIA Voice',
    version: '0.0.0'
  },
  hotkeyHint: 'Hold the push-to-talk key',
  registeredHotkey: null,
  registeredHotkeyLabel: null,
  selectedProvider: 'dashscope' as const,
  microphone: {
    selectedDeviceId: null,
    selectedDeviceLabel: null
  },
  providerLabels: { asr: 'qwen3-asr-flash', llm: 'qwen-plus' },
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
  themeMode: 'system' as const,
  postProcessPreset: 'formal' as const,
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
      label: 'Microphone permission pending',
      description: 'Enable microphone access in System Settings so TIA Voice can capture speech.',
      ctaLabel: 'Request Microphone Permission'
    }
  },
  autoUpdate: {
    status: 'unsupported' as const,
    currentVersion: '0.0.0',
    availableVersion: null,
    releaseDate: null,
    lastCheckedAt: null,
    downloadProgressPercent: null,
    message: 'Automatic updates are only available in packaged builds.'
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
  getHistoryPage: async () => ({ items: [], totalCount: 0 }),
  getHistoryEntryDebug: async () => null,
  retryHistoryEntry: async () => undefined,
  startDictation: async () => undefined,
  stopDictation: async () => undefined,
  setThemeMode: async () => undefined,
  setPostProcessPreset: async () => undefined,
  savePostProcessPreset: async (input) => ({ ...input, builtIn: false }),
  resetPostProcessPreset: async () => ({
    id: 'formal',
    name: 'Formal',
    systemPrompt:
      'Prefer polished punctuation, complete sentences, and a professional tone while preserving the speaker intent, wording, and meaning.',
    builtIn: true
  }),
  createPostProcessPreset: async (input) => ({
    id: 'preset-new',
    name: input.name,
    systemPrompt: input.systemPrompt,
    builtIn: false
  }),
  setHotkey: async () => undefined,
  setMicrophone: async () => undefined,
  setProvider: async () => undefined,
  getProviderSetup: async () => ({ configured: false, keyLabel: null }),
  saveDashscopeApiKey: async () => ({ configured: true, keyLabel: 'Saved locally' }),
  saveOpenAiApiKey: async () => ({ configured: true, keyLabel: 'Saved locally' }),
  completeOnboarding: async () => undefined,
  resetOnboarding: async () => undefined,
  checkAccessibilityPermission: async () => true,
  checkMicrophonePermission: async () => true,
  reportMicrophonePermissionGranted: async () => undefined,
  openPermissionSettings: async () => undefined,
  checkForUpdates: async () => noopMainAppState.autoUpdate,
  restartToUpdate: async () => undefined,
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

export function getHistoryPage(
  input?: Parameters<TiaApi['getHistoryPage']>[0]
): ReturnType<TiaApi['getHistoryPage']> {
  return getApi().getHistoryPage(input)
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

export function setPostProcessPreset(
  presetId: Parameters<TiaApi['setPostProcessPreset']>[0]
): ReturnType<TiaApi['setPostProcessPreset']> {
  return getApi().setPostProcessPreset(presetId)
}

export function savePostProcessPreset(
  input: Parameters<TiaApi['savePostProcessPreset']>[0]
): ReturnType<TiaApi['savePostProcessPreset']> {
  return getApi().savePostProcessPreset(input)
}

export function resetPostProcessPreset(
  presetId: Parameters<TiaApi['resetPostProcessPreset']>[0]
): ReturnType<TiaApi['resetPostProcessPreset']> {
  return getApi().resetPostProcessPreset(presetId)
}

export function createPostProcessPreset(
  input: Parameters<TiaApi['createPostProcessPreset']>[0]
): ReturnType<TiaApi['createPostProcessPreset']> {
  return getApi().createPostProcessPreset(input)
}

export function setHotkey(
  hotkey: Parameters<TiaApi['setHotkey']>[0]
): ReturnType<TiaApi['setHotkey']> {
  return getApi().setHotkey(hotkey)
}

export function setMicrophone(
  input: Parameters<TiaApi['setMicrophone']>[0]
): ReturnType<TiaApi['setMicrophone']> {
  return getApi().setMicrophone(input)
}

export function setProvider(
  provider: Parameters<TiaApi['setProvider']>[0]
): ReturnType<TiaApi['setProvider']> {
  return getApi().setProvider(provider)
}

export function getProviderSetup(): ReturnType<TiaApi['getProviderSetup']> {
  return getApi().getProviderSetup()
}

export function saveDashscopeApiKey(
  apiKey: Parameters<TiaApi['saveDashscopeApiKey']>[0]
): ReturnType<TiaApi['saveDashscopeApiKey']> {
  return getApi().saveDashscopeApiKey(apiKey)
}

export function saveOpenAiApiKey(
  apiKey: Parameters<TiaApi['saveOpenAiApiKey']>[0]
): ReturnType<TiaApi['saveOpenAiApiKey']> {
  return getApi().saveOpenAiApiKey(apiKey)
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

export function reportMicrophonePermissionGranted(): ReturnType<
  TiaApi['reportMicrophonePermissionGranted']
> {
  return getApi().reportMicrophonePermissionGranted()
}

export function openPermissionSettings(
  permission: Parameters<TiaApi['openPermissionSettings']>[0]
): ReturnType<TiaApi['openPermissionSettings']> {
  return getApi().openPermissionSettings(permission)
}

export function checkForUpdates(): ReturnType<TiaApi['checkForUpdates']> {
  return getApi().checkForUpdates()
}

export function restartToUpdate(): ReturnType<TiaApi['restartToUpdate']> {
  return getApi().restartToUpdate()
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
