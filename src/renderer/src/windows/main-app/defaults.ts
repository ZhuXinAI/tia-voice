import type { DictionaryPhrase, MainAppState } from './types'

export const defaultMainAppState: MainAppState = {
  hotkeyHint: 'Hold the push-to-talk key to dictate into the current app.',
  registeredHotkey: null,
  registeredHotkeyLabel: null,
  providerLabels: {
    asr: 'qwen3-asr-flash',
    llm: 'qwen-plus'
  },
  dashscope: {
    configured: false,
    keyLabel: null
  },
  onboarding: {
    completed: false,
    visible: true
  },
  themeMode: 'system',
  voiceBackendStatus: {
    ready: false,
    label: 'DashScope key required',
    detail: 'Add your DashScope API key in onboarding or settings to start dictating.'
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
