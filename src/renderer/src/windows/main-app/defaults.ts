import { DEFAULT_DICTIONARY_ENTRIES } from '../../../../shared/dictionary'

import type { MainAppState } from './types'

export const defaultMainAppState: MainAppState = {
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
    selectionToolbar: false
  },
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
    status: 'unsupported',
    currentVersion: '0.0.0',
    availableVersion: null,
    releaseDate: null,
    lastCheckedAt: null,
    downloadProgressPercent: null,
    message: 'Automatic updates are only available in packaged builds.'
  },
  history: []
}
