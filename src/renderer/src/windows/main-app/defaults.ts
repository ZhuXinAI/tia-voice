import type { DictionaryPhrase, MainAppState } from './types'

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

export const starterDictionary: DictionaryPhrase[] = [
  {
    id: '1',
    phrase: 'Buildmind',
    replacement: 'BuildMind',
    notes: 'Always keep the capital M in product and company references.'
  },
  {
    id: '2',
    phrase: 'TIA voice',
    replacement: 'TIA Voice',
    notes: 'Use title case when referring to the desktop product.'
  }
]
