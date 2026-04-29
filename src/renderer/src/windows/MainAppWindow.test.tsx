// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const baseState = {
  appInfo: {
    name: 'TIA Voice',
    version: '1.1.2'
  },
  hotkeyHint: 'Hold the push-to-talk key to dictate into the current app.',
  registeredHotkey: null,
  registeredHotkeyLabel: null,
  selectedProvider: 'dashscope' as const,
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
    completed: true,
    visible: false
  },
  language: {
    preference: 'system' as const,
    resolved: 'en' as const
  },
  themeMode: 'system' as const,
  features: {
    autoTextToSpeech: false
  },
  dictionaryEntries: [
    {
      id: 'buildmind',
      phrase: 'Buildmind',
      replacement: 'BuildMind',
      notes: 'Always keep the capital M in product and company references.'
    }
  ],
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
    status: 'idle' as const,
    currentVersion: '1.1.2',
    availableVersion: null,
    releaseDate: null,
    lastCheckedAt: null,
    downloadProgressPercent: null,
    message: null
  },
  history: [],
  questionHistory: []
}

const configuredState = {
  ...baseState,
  dashscope: {
    ...baseState.dashscope,
    configured: true,
    keyLabel: 'Saved locally ••••1234'
  },
  voiceBackendStatus: {
    ready: true,
    label: 'Voice typing ready',
    detail: 'Your DashScope key is configured and ready for voice typing.'
  },
  historySummary: {
    totalCount: 0,
    wordsSpoken: 0,
    averageWpm: null
  },
  permissions: {
    hasMissing: false,
    accessibility: {
      ...baseState.permissions.accessibility,
      granted: true,
      status: 'granted',
      label: 'Accessibility enabled'
    },
    microphone: {
      ...baseState.permissions.microphone,
      granted: true,
      status: 'granted',
      label: 'Microphone enabled'
    }
  }
}

const onboardingState = {
  ...baseState,
  onboarding: {
    completed: true,
    visible: true
  }
}

const {
  getHistoryPageMock,
  getHistoryEntryDebugMock,
  getMainAppStateMock,
  subscribeToAppStateMock,
  retryHistoryEntryMock,
  saveDictionaryEntryMock,
  deleteDictionaryEntryMock,
  completeOnboardingMock,
  createPostProcessPresetMock,
  resetPostProcessPresetMock,
  resetOnboardingMock,
  saveDashscopeApiKeyMock,
  saveOpenAiApiKeyMock,
  checkMicrophonePermissionMock,
  openPermissionSettingsMock,
  showOnboardingWindowMock,
  checkForUpdatesMock,
  restartToUpdateMock,
  setLanguageMock,
  setAutoTextToSpeechEnabledMock,
  setThemeModeMock,
  setPostProcessPresetMock,
  savePostProcessPresetMock,
  setHotkeyMock,
  setMicrophoneMock,
  setProviderMock,
  setProviderLlmModelMock
} = vi.hoisted(() => ({
  getHistoryPageMock: vi.fn(),
  getHistoryEntryDebugMock: vi.fn(),
  getMainAppStateMock: vi.fn(),
  subscribeToAppStateMock: vi.fn(),
  retryHistoryEntryMock: vi.fn(),
  saveDictionaryEntryMock: vi.fn(),
  deleteDictionaryEntryMock: vi.fn(),
  completeOnboardingMock: vi.fn(),
  createPostProcessPresetMock: vi.fn(),
  resetPostProcessPresetMock: vi.fn(),
  resetOnboardingMock: vi.fn(),
  saveDashscopeApiKeyMock: vi.fn(),
  saveOpenAiApiKeyMock: vi.fn(),
  checkMicrophonePermissionMock: vi.fn(),
  openPermissionSettingsMock: vi.fn(),
  showOnboardingWindowMock: vi.fn(),
  checkForUpdatesMock: vi.fn(),
  restartToUpdateMock: vi.fn(),
  setLanguageMock: vi.fn(),
  setAutoTextToSpeechEnabledMock: vi.fn(),
  setThemeModeMock: vi.fn(),
  setPostProcessPresetMock: vi.fn(),
  savePostProcessPresetMock: vi.fn(),
  setHotkeyMock: vi.fn(),
  setMicrophoneMock: vi.fn(),
  setProviderMock: vi.fn(),
  setProviderLlmModelMock: vi.fn()
}))

vi.mock('../lib/ipc', () => ({
  completeOnboarding: completeOnboardingMock,
  createPostProcessPreset: createPostProcessPresetMock,
  resetPostProcessPreset: resetPostProcessPresetMock,
  getHistoryPage: getHistoryPageMock,
  getHistoryEntryDebug: getHistoryEntryDebugMock,
  getMainAppState: getMainAppStateMock,
  resetOnboarding: resetOnboardingMock,
  retryHistoryEntry: retryHistoryEntryMock,
  saveDictionaryEntry: saveDictionaryEntryMock,
  deleteDictionaryEntry: deleteDictionaryEntryMock,
  saveDashscopeApiKey: saveDashscopeApiKeyMock,
  saveOpenAiApiKey: saveOpenAiApiKeyMock,
  checkMicrophonePermission: checkMicrophonePermissionMock,
  openPermissionSettings: openPermissionSettingsMock,
  showOnboardingWindow: showOnboardingWindowMock,
  checkForUpdates: checkForUpdatesMock,
  restartToUpdate: restartToUpdateMock,
  setLanguage: setLanguageMock,
  setAutoTextToSpeechEnabled: setAutoTextToSpeechEnabledMock,
  setThemeMode: setThemeModeMock,
  setPostProcessPreset: setPostProcessPresetMock,
  savePostProcessPreset: savePostProcessPresetMock,
  setHotkey: setHotkeyMock,
  setMicrophone: setMicrophoneMock,
  setProvider: setProviderMock,
  setProviderLlmModel: setProviderLlmModelMock,
  subscribeToAppState: subscribeToAppStateMock
}))

import MainAppWindow from './MainAppWindow'

describe('MainAppWindow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  beforeEach(() => {
    window.history.replaceState({}, '', '/')

    vi.stubGlobal(
      'URL',
      Object.assign(globalThis.URL, {
        createObjectURL: vi.fn(() => 'blob:history-audio'),
        revokeObjectURL: vi.fn()
      })
    )

    getMainAppStateMock.mockReset()
    getHistoryPageMock.mockReset()
    getHistoryEntryDebugMock.mockReset()
    subscribeToAppStateMock.mockReset()
    retryHistoryEntryMock.mockReset()
    saveDictionaryEntryMock.mockReset()
    deleteDictionaryEntryMock.mockReset()
    completeOnboardingMock.mockReset()
    createPostProcessPresetMock.mockReset()
    resetPostProcessPresetMock.mockReset()
    resetOnboardingMock.mockReset()
    saveDashscopeApiKeyMock.mockReset()
    saveOpenAiApiKeyMock.mockReset()
    checkMicrophonePermissionMock.mockReset()
    openPermissionSettingsMock.mockReset()
    showOnboardingWindowMock.mockReset()
    checkForUpdatesMock.mockReset()
    restartToUpdateMock.mockReset()
    setLanguageMock.mockReset()
    setAutoTextToSpeechEnabledMock.mockReset()
    setThemeModeMock.mockReset()
    setPostProcessPresetMock.mockReset()
    savePostProcessPresetMock.mockReset()
    setHotkeyMock.mockReset()
    setMicrophoneMock.mockReset()
    setProviderMock.mockReset()
    setProviderLlmModelMock.mockReset()

    subscribeToAppStateMock.mockReturnValue(() => undefined)
    getMainAppStateMock.mockResolvedValue(baseState)
    getHistoryPageMock.mockResolvedValue({
      items: [],
      totalCount: 0
    })
    getHistoryEntryDebugMock.mockResolvedValue(null)
    retryHistoryEntryMock.mockResolvedValue(undefined)
    saveDictionaryEntryMock.mockResolvedValue({
      id: 'qwen',
      phrase: 'queue win',
      replacement: 'Qwen',
      notes: ''
    })
    deleteDictionaryEntryMock.mockResolvedValue(undefined)
    completeOnboardingMock.mockResolvedValue(undefined)
    createPostProcessPresetMock.mockResolvedValue({
      id: 'preset-support',
      name: 'Support',
      systemPrompt: 'Sound warm and concise.',
      builtIn: false,
      enablePostProcessing: true
    })
    resetPostProcessPresetMock.mockResolvedValue({
      id: 'formal',
      name: 'Formal',
      systemPrompt:
        'Prefer polished punctuation, complete sentences, and a professional tone while preserving the speaker intent, wording, and meaning.',
      builtIn: true,
      enablePostProcessing: true
    })
    resetOnboardingMock.mockResolvedValue(undefined)
    saveDashscopeApiKeyMock.mockResolvedValue({
      configured: true,
      keyLabel: 'Saved locally ••••1234'
    })
    saveOpenAiApiKeyMock.mockResolvedValue({
      configured: true,
      keyLabel: 'Saved locally ••••1234'
    })
    checkMicrophonePermissionMock.mockResolvedValue(false)
    openPermissionSettingsMock.mockResolvedValue(undefined)
    showOnboardingWindowMock.mockResolvedValue(undefined)
    checkForUpdatesMock.mockResolvedValue(baseState.autoUpdate)
    restartToUpdateMock.mockResolvedValue(undefined)
    setLanguageMock.mockResolvedValue(undefined)
    setAutoTextToSpeechEnabledMock.mockResolvedValue(undefined)
    setThemeModeMock.mockResolvedValue(undefined)
    setPostProcessPresetMock.mockResolvedValue(undefined)
    savePostProcessPresetMock.mockResolvedValue({
      id: 'formal',
      name: 'Formal',
      systemPrompt: 'Keep it polished.',
      builtIn: true,
      enablePostProcessing: true
    })
    setHotkeyMock.mockResolvedValue(undefined)
    setMicrophoneMock.mockResolvedValue(undefined)
    setProviderMock.mockResolvedValue(undefined)
    setProviderLlmModelMock.mockResolvedValue(undefined)
  })

  it('renders main app shell', async () => {
    getMainAppStateMock.mockResolvedValue(baseState)

    render(<MainAppWindow />)

    expect(await screen.findByText(/workspace/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument()
    })
  })

  it('saves dictionary entries through the app bridge', async () => {
    render(<MainAppWindow />)

    fireEvent.click(await screen.findByText(/dictionary/i))
    fireEvent.change(await screen.findByLabelText(/spoken phrase/i), {
      target: { value: 'queue win' }
    })
    fireEvent.change(await screen.findByLabelText(/normalized output/i), {
      target: { value: 'Qwen' }
    })
    fireEvent.click(await screen.findByRole('button', { name: /add phrase rule/i }))

    await waitFor(() => {
      expect(saveDictionaryEntryMock).toHaveBeenCalledWith({
        phrase: 'queue win',
        replacement: 'Qwen',
        notes: ''
      })
    })
  })

  it('localizes the dictionary route in Simplified Chinese', async () => {
    window.location.hash = '#/dictionary'
    getMainAppStateMock.mockResolvedValue({
      ...baseState,
      language: {
        preference: 'zh-CN',
        resolved: 'zh-CN'
      },
      dictionaryEntries: []
    })

    render(<MainAppWindow />)

    expect(await screen.findByText('发音词典')).toBeInTheDocument()
    expect(screen.getByLabelText('口述短语')).toBeInTheDocument()
    expect(screen.getByLabelText('规范输出')).toBeInTheDocument()
    expect(screen.getByText('还没有词典条目')).toBeInTheDocument()
    expect(screen.queryByText('Pronunciation dictionary')).not.toBeInTheDocument()
  })

  it('refreshes provider state after saving a DashScope key from settings', async () => {
    getMainAppStateMock.mockResolvedValueOnce(baseState).mockResolvedValueOnce(configuredState)

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /settings/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^providers$/i }))

    const input = await screen.findByPlaceholderText(/enter your dashscope api key/i)
    fireEvent.change(input, { target: { value: 'sk-test-1234' } })
    fireEvent.click((await screen.findAllByRole('button', { name: /^save key$/i }))[0])

    await waitFor(() => {
      expect(saveDashscopeApiKeyMock).toHaveBeenCalledWith('sk-test-1234')
    })
    expect((await screen.findAllByText(/saved locally/i)).length).toBeGreaterThan(0)
  })

  it('updates the global hotkey from settings', async () => {
    getMainAppStateMock.mockResolvedValueOnce(baseState).mockResolvedValueOnce({
      ...baseState,
      registeredHotkey: 'AltRight',
      registeredHotkeyLabel: 'Right Alt'
    })

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /settings/i }))
    fireEvent.click(await screen.findByRole('button', { name: /right option/i }))

    await waitFor(() => {
      expect(setHotkeyMock).toHaveBeenCalledWith('AltRight')
    })
  })

  it('switches the active provider to OpenAI from settings', async () => {
    getMainAppStateMock.mockResolvedValueOnce(baseState).mockResolvedValueOnce({
      ...baseState,
      selectedProvider: 'openai',
      openai: {
        ...baseState.openai,
        configured: true,
        keyLabel: 'Saved locally ••••5678'
      },
      providerLabels: {
        asr: 'gpt-4o-mini-transcribe',
        llm: 'gpt-5-mini'
      },
      voiceBackendStatus: {
        ready: false,
        label: 'OpenAI key required',
        detail: 'Add your OpenAI API key in onboarding or settings to start dictating.'
      }
    })

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /settings/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^providers$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /openai/i }))

    await waitFor(() => {
      expect(setProviderMock).toHaveBeenCalledWith('openai')
    })
  })

  it('updates the selected cleanup model for the active provider', async () => {
    getMainAppStateMock.mockResolvedValueOnce(baseState).mockResolvedValueOnce({
      ...baseState,
      dashscope: {
        ...baseState.dashscope,
        llmModel: 'qwen3-max'
      },
      providerLabels: {
        ...baseState.providerLabels,
        llm: 'qwen3-max'
      }
    })

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /settings/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^providers$/i }))
    fireEvent.change(await screen.findByDisplayValue('qwen3.5-flash'), {
      target: { value: 'qwen3-max' }
    })

    await waitFor(() => {
      expect(setProviderLlmModelMock).toHaveBeenCalledWith({
        provider: 'dashscope',
        model: 'qwen3-max'
      })
    })
  })

  it('changes the app language from the language settings tab', async () => {
    getMainAppStateMock.mockResolvedValueOnce(baseState).mockResolvedValueOnce({
      ...baseState,
      language: {
        preference: 'zh-CN',
        resolved: 'zh-CN'
      }
    })

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /settings/i }))
    fireEvent.click(await screen.findByRole('button', { name: /language/i }))
    fireEvent.click(await screen.findByRole('button', { name: /simplified chinese/i }))

    await waitFor(() => {
      expect(setLanguageMock).toHaveBeenCalledWith('zh-CN')
    })
  })

  it('toggles automatic TTS for Q&A answers from settings', async () => {
    getMainAppStateMock.mockResolvedValueOnce(baseState).mockResolvedValueOnce({
      ...baseState,
      features: {
        ...baseState.features,
        autoTextToSpeech: true
      }
    })

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /settings/i }))
    fireEvent.click(await screen.findByRole('switch', { name: /auto read answers aloud/i }))

    await waitFor(() => {
      expect(setAutoTextToSpeechEnabledMock).toHaveBeenCalledWith(true)
    })
  })

  it('switches the post-process preset from the presets page', async () => {
    getMainAppStateMock.mockResolvedValueOnce(baseState).mockResolvedValueOnce({
      ...baseState,
      postProcessPreset: 'casual'
    })

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('link', { name: /presets/i }))
    fireEvent.click((await screen.findByText('Casual')).closest('button') as HTMLElement)

    await waitFor(() => {
      expect(setPostProcessPresetMock).toHaveBeenCalledWith('casual')
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('highlights only the presets navigation item on the presets page', async () => {
    render(<MainAppWindow />)

    const homeLink = await screen.findByRole('link', { name: /home/i })
    const presetsLink = await screen.findByRole('link', { name: /presets/i })

    expect(homeLink).toHaveAttribute('data-active', 'true')
    expect(presetsLink).toHaveAttribute('data-active', 'false')

    fireEvent.click(presetsLink)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Presets' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('data-active', 'false')
      expect(screen.getByRole('link', { name: /presets/i })).toHaveAttribute('data-active', 'true')
    })
  })

  it('opens the preset editor only from the edit action', async () => {
    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('link', { name: /presets/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit preset formal/i }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Formal' })).toBeInTheDocument()
  })

  it('saves edited preset instructions from the preset dialog', async () => {
    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('link', { name: /presets/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit preset formal/i }))
    fireEvent.click(await screen.findByRole('switch', { name: /use llm post-processing/i }))
    fireEvent.change(await screen.findByLabelText(/preset prompt/i), {
      target: { value: 'Keep the output polished and direct.' }
    })
    fireEvent.click(await screen.findByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(savePostProcessPresetMock).toHaveBeenCalledWith({
        id: 'formal',
        name: 'Formal',
        systemPrompt: 'Keep the output polished and direct.',
        enablePostProcessing: false
      })
    })
  })

  it('resets a built-in preset from the preset dialog', async () => {
    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('link', { name: /presets/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit preset formal/i }))
    fireEvent.click(await screen.findByRole('button', { name: /reset to default/i }))

    await waitFor(() => {
      expect(resetPostProcessPresetMock).toHaveBeenCalledWith('formal')
    })
  })

  it('creates a custom preset from the preset dialog', async () => {
    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('link', { name: /presets/i }))
    fireEvent.click(await screen.findByRole('button', { name: /new preset/i }))
    fireEvent.change(await screen.findByLabelText(/preset name/i), {
      target: { value: 'Support' }
    })
    fireEvent.click(await screen.findByRole('switch', { name: /use llm post-processing/i }))
    fireEvent.click(await screen.findByRole('button', { name: /create preset/i }))

    await waitFor(() => {
      expect(createPostProcessPresetMock).toHaveBeenCalledWith({
        name: 'Support',
        systemPrompt: '',
        enablePostProcessing: false
      })
    })
  })

  it('opens onboarding from settings when setup guide is requested', async () => {
    getMainAppStateMock.mockResolvedValueOnce(baseState).mockResolvedValueOnce(onboardingState)

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /settings/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^providers$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /open setup guide/i }))

    await waitFor(() => {
      expect(showOnboardingWindowMock).toHaveBeenCalled()
    })
    expect(await screen.findByRole('button', { name: /skip/i })).toBeInTheDocument()
  })

  it('routes microphone permission requests through settings', async () => {
    getMainAppStateMock.mockResolvedValue(baseState)

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /settings/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^permissions$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /request microphone permission/i }))

    await waitFor(() => {
      expect(openPermissionSettingsMock).toHaveBeenCalledWith('microphone')
    })
  })

  it('renders the about tab with current version and update controls', async () => {
    getMainAppStateMock.mockResolvedValue({
      ...configuredState,
      autoUpdate: {
        status: 'update-available',
        currentVersion: '1.1.2',
        availableVersion: '1.0.36',
        releaseDate: '2026-04-21T10:00:00.000Z',
        lastCheckedAt: Date.UTC(2026, 3, 21, 10, 15),
        downloadProgressPercent: 42,
        message: 'v1.0.36 is downloading in the background (42%).'
      }
    })

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /settings/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^about$/i }))

    expect((await screen.findAllByText(/^v1.1.2$/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/v1.0.36 is downloading/i).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }))

    await waitFor(() => {
      expect(checkForUpdatesMock).toHaveBeenCalled()
    })
  })

  it('shows a sidebar update badge when an update is ready', async () => {
    getMainAppStateMock.mockResolvedValue({
      ...configuredState,
      autoUpdate: {
        status: 'update-downloaded',
        currentVersion: '1.1.2',
        availableVersion: '1.0.36',
        releaseDate: '2026-04-21T10:00:00.000Z',
        lastCheckedAt: Date.UTC(2026, 3, 21, 10, 15),
        downloadProgressPercent: 100,
        message: 'v1.0.36 is ready to install.'
      }
    })

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /^update$/i }))

    await waitFor(() => {
      expect(restartToUpdateMock).toHaveBeenCalled()
    })
  })

  it('opens history debug details when a transcription item is clicked', async () => {
    getMainAppStateMock.mockResolvedValue({
      ...configuredState,
      historySummary: {
        totalCount: 1,
        wordsSpoken: 2,
        averageWpm: null
      },
      history: [
        {
          id: 'history-1',
          createdAt: 1,
          title: 'Voice transcription',
          preview: 'Processed transcript.',
          status: 'completed',
          hasAudio: true
        }
      ]
    })
    getHistoryEntryDebugMock.mockResolvedValue({
      id: 'history-1',
      createdAt: 1,
      status: 'completed',
      llmProcessing: 'skipped',
      transcript: 'raw transcript',
      cleanedText: 'raw transcript',
      audio: {
        bytes: new Uint8Array([0, 1, 2, 3]),
        mimeType: 'audio/webm',
        durationMs: 1500,
        sizeBytes: 1024
      }
    })

    render(<MainAppWindow />)

    const historyTitle = await screen.findByText('Voice transcription')
    fireEvent.click(historyTitle.closest('[role="button"]') as HTMLElement)

    await waitFor(() => {
      expect(getHistoryEntryDebugMock).toHaveBeenCalledWith('history-1')
    })
    expect(await screen.findByText(/^Raw transcript$/)).toBeInTheDocument()
    expect(screen.getByText('raw transcript')).toBeInTheDocument()
    expect(screen.getByText(/^LLM processing$/)).toBeInTheDocument()
    expect(screen.getByText(/^Skipped$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /play audio/i })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /seek audio/i })).toBeInTheDocument()
    expect(screen.getByTestId('audio-waveform')).toBeInTheDocument()
  })

  it('shows only the recent history on the home screen and paginates the full history dialog', async () => {
    const previewHistory = Array.from({ length: 10 }, (_, index) => ({
      id: `history-${index + 1}`,
      createdAt: 100 - index,
      title: `History ${index + 1}`,
      preview: `Preview ${index + 1}`,
      status: 'completed' as const,
      hasAudio: true
    }))

    getMainAppStateMock.mockResolvedValue({
      ...configuredState,
      historySummary: {
        totalCount: 25,
        wordsSpoken: 250,
        averageWpm: 118
      },
      history: previewHistory
    })
    getHistoryPageMock.mockImplementation(async (input?: { offset?: number; limit?: number }) => {
      if (input?.offset === 10) {
        return {
          totalCount: 25,
          items: Array.from({ length: 10 }, (_, index) => ({
            id: `history-${index + 11}`,
            createdAt: 90 - index,
            title: `History ${index + 11}`,
            preview: `Preview ${index + 11}`,
            status: 'completed' as const,
            hasAudio: true
          }))
        }
      }

      if (input?.offset === 20) {
        return {
          totalCount: 25,
          items: Array.from({ length: 5 }, (_, index) => ({
            id: `history-${index + 21}`,
            createdAt: 80 - index,
            title: `History ${index + 21}`,
            preview: `Preview ${index + 21}`,
            status: 'completed' as const,
            hasAudio: true
          }))
        }
      }

      return {
        totalCount: 25,
        items: previewHistory
      }
    })

    render(<MainAppWindow />)

    expect(await screen.findByText('History 1')).toBeInTheDocument()
    expect(screen.queryByText('History 11')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show all/i }))

    expect(
      await screen.findByRole('heading', { name: /full transcription history/i })
    ).toBeInTheDocument()

    const historyDialog = screen.getByRole('dialog')
    expect(within(historyDialog).getByText(/page 1 of 3/i)).toBeInTheDocument()
    expect(within(historyDialog).getByText('History 10')).toBeInTheDocument()
    expect(within(historyDialog).queryByText('History 11')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))

    await waitFor(() => {
      expect(getHistoryPageMock).toHaveBeenCalledWith({ offset: 10, limit: 10 })
    })
    expect(await within(historyDialog).findByText('History 11')).toBeInTheDocument()
    expect(within(historyDialog).getByText(/page 2 of 3/i)).toBeInTheDocument()
    expect(within(historyDialog).queryByText('History 1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))

    await waitFor(() => {
      expect(getHistoryPageMock).toHaveBeenCalledWith({ offset: 20, limit: 10 })
    })
    expect(await within(historyDialog).findByText('History 21')).toBeInTheDocument()
    expect(within(historyDialog).getByText(/page 3 of 3/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^previous$/i }))

    expect(await within(historyDialog).findByText('History 11')).toBeInTheDocument()
    expect(within(historyDialog).getByText(/page 2 of 3/i)).toBeInTheDocument()
  })
})
