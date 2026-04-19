// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const baseState = {
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
    completed: true,
    visible: false
  },
  themeMode: 'system' as const,
  voiceBackendStatus: {
    ready: false,
    label: 'DashScope key required',
    detail: 'Add your DashScope API key in onboarding or settings to start dictating.'
  },
  history: []
}

const configuredState = {
  ...baseState,
  dashscope: {
    configured: true,
    keyLabel: 'Saved locally ••••1234'
  },
  voiceBackendStatus: {
    ready: true,
    label: 'Voice typing ready',
    detail: 'Your DashScope key is configured and ready for voice typing.'
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
  getHistoryEntryDebugMock,
  getMainAppStateMock,
  subscribeToAppStateMock,
  retryHistoryEntryMock,
  completeOnboardingMock,
  resetOnboardingMock,
  saveDashscopeApiKeyMock,
  showOnboardingWindowMock,
  setThemeModeMock
} = vi.hoisted(() => ({
  getHistoryEntryDebugMock: vi.fn(),
  getMainAppStateMock: vi.fn(),
  subscribeToAppStateMock: vi.fn(),
  retryHistoryEntryMock: vi.fn(),
  completeOnboardingMock: vi.fn(),
  resetOnboardingMock: vi.fn(),
  saveDashscopeApiKeyMock: vi.fn(),
  showOnboardingWindowMock: vi.fn(),
  setThemeModeMock: vi.fn()
}))

vi.mock('../lib/ipc', () => ({
  completeOnboarding: completeOnboardingMock,
  getHistoryEntryDebug: getHistoryEntryDebugMock,
  getMainAppState: getMainAppStateMock,
  resetOnboarding: resetOnboardingMock,
  retryHistoryEntry: retryHistoryEntryMock,
  saveDashscopeApiKey: saveDashscopeApiKeyMock,
  showOnboardingWindow: showOnboardingWindowMock,
  setThemeMode: setThemeModeMock,
  subscribeToAppState: subscribeToAppStateMock
}))

import MainAppWindow from './MainAppWindow'

describe('MainAppWindow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  beforeEach(() => {
    vi.stubGlobal(
      'URL',
      Object.assign(globalThis.URL, {
        createObjectURL: vi.fn(() => 'blob:history-audio'),
        revokeObjectURL: vi.fn()
      })
    )

    getMainAppStateMock.mockReset()
    getHistoryEntryDebugMock.mockReset()
    subscribeToAppStateMock.mockReset()
    retryHistoryEntryMock.mockReset()
    completeOnboardingMock.mockReset()
    resetOnboardingMock.mockReset()
    saveDashscopeApiKeyMock.mockReset()
    showOnboardingWindowMock.mockReset()
    setThemeModeMock.mockReset()

    subscribeToAppStateMock.mockReturnValue(() => undefined)
    getHistoryEntryDebugMock.mockResolvedValue(null)
    retryHistoryEntryMock.mockResolvedValue(undefined)
    completeOnboardingMock.mockResolvedValue(undefined)
    resetOnboardingMock.mockResolvedValue(undefined)
    saveDashscopeApiKeyMock.mockResolvedValue({
      configured: true,
      keyLabel: 'Saved locally ••••1234'
    })
    showOnboardingWindowMock.mockResolvedValue(undefined)
    setThemeModeMock.mockResolvedValue(undefined)
  })

  it('renders main app shell', async () => {
    getMainAppStateMock.mockResolvedValue(baseState)

    render(<MainAppWindow />)

    expect(await screen.findByText(/workspace/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument()
    })
  })

  it('refreshes provider state after saving a DashScope key from settings', async () => {
    getMainAppStateMock.mockResolvedValueOnce(baseState).mockResolvedValueOnce(configuredState)

    render(<MainAppWindow />)

    const addKeyButton = (await screen.findAllByRole('button', { name: /add key/i }))[0]
    fireEvent.click(addKeyButton)

    const input = await screen.findByPlaceholderText(/enter your dashscope api key/i)
    fireEvent.change(input, { target: { value: 'sk-test-1234' } })
    fireEvent.click(screen.getByRole('button', { name: /^save key$/i }))

    await waitFor(() => {
      expect(saveDashscopeApiKeyMock).toHaveBeenCalledWith('sk-test-1234')
    })
    expect((await screen.findAllByText(/saved locally/i)).length).toBeGreaterThan(0)
  })

  it('opens onboarding from settings when setup guide is requested', async () => {
    getMainAppStateMock.mockResolvedValueOnce(baseState).mockResolvedValueOnce(onboardingState)

    render(<MainAppWindow />)

    const addKeyButton = (await screen.findAllByRole('button', { name: /add key/i }))[0]
    fireEvent.click(addKeyButton)
    fireEvent.click(await screen.findByRole('button', { name: /open setup guide/i }))

    await waitFor(() => {
      expect(showOnboardingWindowMock).toHaveBeenCalled()
    })
    expect(await screen.findByRole('button', { name: /skip/i })).toBeInTheDocument()
  })

  it('opens history debug details when a transcription item is clicked', async () => {
    getMainAppStateMock.mockResolvedValue({
      ...configuredState,
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
      transcript: 'raw transcript',
      cleanedText: 'Processed transcript.',
      audio: {
        bytes: new Uint8Array([0, 1, 2, 3]),
        mimeType: 'audio/webm',
        durationMs: 1500,
        sizeBytes: 1024
      }
    })

    render(<MainAppWindow />)

    fireEvent.click(await screen.findByRole('button', { name: /open details for voice transcription/i }))

    await waitFor(() => {
      expect(getHistoryEntryDebugMock).toHaveBeenCalledWith('history-1')
    })
    expect(await screen.findByText(/^Raw transcript$/)).toBeInTheDocument()
    expect(screen.getByText('raw transcript')).toBeInTheDocument()
    expect(screen.getByText(/^LLM processed$/)).toBeInTheDocument()
    expect(screen.getAllByText('Processed transcript.').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /play audio/i })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /seek audio/i })).toBeInTheDocument()
    expect(screen.getByTestId('audio-waveform')).toBeInTheDocument()
  })
})
