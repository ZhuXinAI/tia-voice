import type {
  AppLanguage,
  RecordingArtifact,
  RecordingCommand,
  QuestionRecordingCommand,
  TiaApi,
  TiaChatState,
  TtsStatePayload
} from '../../../preload/index'
import { DEFAULT_DICTIONARY_ENTRIES } from '../../../shared/dictionary'

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
  providerLabels: { asr: 'qwen3-asr-flash', llm: 'qwen3.5-flash' },
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
    preference: 'system' as const,
    resolved: 'en' as AppLanguage
  },
  themeMode: 'system' as const,
  features: {
    autoTextToSpeech: false
  },
  dictionaryEntries: DEFAULT_DICTIONARY_ENTRIES.map((entry) => ({ ...entry })),
  postProcessPreset: 'formal' as const,
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
  history: [],
  questionHistory: []
}

const noopApi: TiaApi = {
  onRecordingCommand: () => () => undefined,
  onQuestionRecordingCommand: () => () => undefined,
  submitRecordingArtifact: async () => undefined,
  submitQuestionRecordingArtifact: async () => undefined,
  cancelQuestionRecording: async () => undefined,
  reportRecordingFailure: async () => undefined,
  reportQuestionRecordingFailure: async () => undefined,
  onChatState: () => () => undefined,
  onTtsState: () => () => undefined,
  onAppState: () => () => undefined,
  getChatState: async () => ({ phase: 'idle' }),
  getTtsState: async () => ({
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
  }),
  getMainAppState: async () => noopMainAppState,
  getHistoryPage: async () => ({ items: [], totalCount: 0 }),
  getQuestionHistoryPage: async () => ({ items: [], totalCount: 0 }),
  getHistoryEntryDebug: async () => null,
  retryHistoryEntry: async () => undefined,
  startDictation: async () => undefined,
  stopDictation: async () => undefined,
  startTextToSpeech: async () => undefined,
  stopTextToSpeech: async () => undefined,
  setThemeMode: async () => undefined,
  setLanguage: async () => undefined,
  setAutoTextToSpeechEnabled: async () => undefined,
  saveDictionaryEntry: async (input) => ({
    id: input.id ?? 'dictionary-new',
    phrase: input.phrase,
    replacement: input.replacement,
    notes: input.notes ?? ''
  }),
  deleteDictionaryEntry: async () => undefined,
  setPostProcessPreset: async () => undefined,
  savePostProcessPreset: async (input) => ({ ...input, builtIn: false }),
  resetPostProcessPreset: async () => ({
    id: 'formal',
    name: 'Formal',
    systemPrompt:
      'Prefer polished punctuation, complete sentences, and a professional tone while preserving the speaker intent, wording, and meaning.',
    builtIn: true,
    enablePostProcessing: true
  }),
  createPostProcessPreset: async (input) => ({
    id: 'preset-new',
    name: input.name,
    systemPrompt: input.systemPrompt,
    builtIn: false,
    enablePostProcessing: input.enablePostProcessing
  }),
  setHotkey: async () => undefined,
  setMicrophone: async () => undefined,
  setProvider: async () => undefined,
  setProviderLlmModel: async () => undefined,
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

export function subscribeToQuestionRecordingCommand(
  listener: (command: QuestionRecordingCommand) => void
): Unsubscribe {
  return getApi().onQuestionRecordingCommand(listener)
}

export function submitRecordingArtifact(artifact: RecordingArtifact): Promise<void> {
  return getApi().submitRecordingArtifact(artifact)
}

export function submitQuestionRecordingArtifact(artifact: RecordingArtifact): Promise<void> {
  return getApi().submitQuestionRecordingArtifact(artifact)
}

export function cancelQuestionRecording(): Promise<void> {
  return getApi().cancelQuestionRecording()
}

export function reportRecordingFailure(detail: string): Promise<void> {
  return getApi().reportRecordingFailure(detail)
}

export function reportQuestionRecordingFailure(detail: string): Promise<void> {
  return getApi().reportQuestionRecordingFailure(detail)
}

export function subscribeToChatState(listener: (state: TiaChatState) => void): Unsubscribe {
  return getApi().onChatState(listener)
}

export function subscribeToTtsState(listener: (state: TtsStatePayload) => void): Unsubscribe {
  return getApi().onTtsState(listener)
}

export function subscribeToAppState(
  listener: (state: Awaited<ReturnType<TiaApi['getMainAppState']>>) => void
): Unsubscribe {
  return getApi().onAppState(listener)
}

export function getChatState(): Promise<TiaChatState> {
  return getApi().getChatState()
}

export function getTtsState(): Promise<TtsStatePayload> {
  return getApi().getTtsState()
}

export function getMainAppState(): ReturnType<TiaApi['getMainAppState']> {
  return getApi().getMainAppState()
}

export function getHistoryPage(
  input?: Parameters<TiaApi['getHistoryPage']>[0]
): ReturnType<TiaApi['getHistoryPage']> {
  return getApi().getHistoryPage(input)
}

export function getQuestionHistoryPage(
  input?: Parameters<TiaApi['getQuestionHistoryPage']>[0]
): ReturnType<TiaApi['getQuestionHistoryPage']> {
  return getApi().getQuestionHistoryPage(input)
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

export function startTextToSpeech(
  input: Parameters<TiaApi['startTextToSpeech']>[0]
): ReturnType<TiaApi['startTextToSpeech']> {
  return getApi().startTextToSpeech(input)
}

export function stopTextToSpeech(): ReturnType<TiaApi['stopTextToSpeech']> {
  return getApi().stopTextToSpeech()
}

export function setThemeMode(
  themeMode: Parameters<TiaApi['setThemeMode']>[0]
): ReturnType<TiaApi['setThemeMode']> {
  return getApi().setThemeMode(themeMode)
}

export function setLanguage(
  language: Parameters<TiaApi['setLanguage']>[0]
): ReturnType<TiaApi['setLanguage']> {
  return getApi().setLanguage(language)
}

export function setAutoTextToSpeechEnabled(
  enabled: Parameters<TiaApi['setAutoTextToSpeechEnabled']>[0]
): ReturnType<TiaApi['setAutoTextToSpeechEnabled']> {
  return getApi().setAutoTextToSpeechEnabled(enabled)
}

export function saveDictionaryEntry(
  input: Parameters<TiaApi['saveDictionaryEntry']>[0]
): ReturnType<TiaApi['saveDictionaryEntry']> {
  return getApi().saveDictionaryEntry(input)
}

export function deleteDictionaryEntry(
  entryId: Parameters<TiaApi['deleteDictionaryEntry']>[0]
): ReturnType<TiaApi['deleteDictionaryEntry']> {
  return getApi().deleteDictionaryEntry(entryId)
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

export function setProviderLlmModel(
  input: Parameters<TiaApi['setProviderLlmModel']>[0]
): ReturnType<TiaApi['setProviderLlmModel']> {
  return getApi().setProviderLlmModel(input)
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
