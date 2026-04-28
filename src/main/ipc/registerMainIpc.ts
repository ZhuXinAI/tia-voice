import { ipcMain } from 'electron'

import {
  IPC_CHANNELS,
  LANGUAGE_PREFERENCES,
  type PostProcessPresetId,
  THEME_MODES,
  type LanguagePreference,
  type ProviderKind,
  type ThemeMode,
  type TriggerKey
} from './channels'
import type { RecordingArtifact } from '../recording/types'
import { getDebugLogPath, logDebug } from '../logging/debugLogger'

export function registerMainIpc(input: {
  getAppState: () => unknown
  getChatState: () => unknown
  getSelectionToolbarState: () => unknown
  getTtsState: () => unknown
  getHistoryPage: (input?: { offset?: number; limit?: number }) => unknown
  getHistoryEntryDebug: (entryId: string) => Promise<unknown>
  finishRecording: (artifact: RecordingArtifact) => Promise<void>
  reportRecordingFailure: (detail: string) => void
  retryHistoryEntry: (entryId: string) => Promise<void>
  startDictation: (source: 'global' | 'onboarding') => Promise<void>
  stopDictation: (source: 'global' | 'onboarding') => Promise<void>
  startTextToSpeech: (input: {
    text: string
    source: 'selection-toolbar' | 'manual'
  }) => Promise<void>
  stopTextToSpeech: () => Promise<void>
  setThemeMode: (themeMode: ThemeMode) => void
  setLanguage: (language: LanguagePreference) => void
  setSelectionToolbarEnabled: (enabled: boolean) => void
  saveDictionaryEntry: (input: {
    id?: string | null
    phrase: string
    replacement: string
    notes?: string | null
  }) => unknown
  deleteDictionaryEntry: (entryId: string) => void
  setPostProcessPreset: (presetId: PostProcessPresetId) => void
  savePostProcessPreset: (input: {
    id: string
    name: string
    systemPrompt: string
    enablePostProcessing: boolean
  }) => unknown
  resetPostProcessPreset: (presetId: string) => unknown
  createPostProcessPreset: (input: {
    name: string
    systemPrompt: string
    enablePostProcessing: boolean
  }) => unknown
  setHotkey: (hotkey: TriggerKey) => void
  setMicrophone: (input: { deviceId: string | null; label: string | null }) => void
  setProvider: (provider: ProviderKind) => void
  setProviderLlmModel: (provider: ProviderKind, model: string) => void
  getProviderSetup: () => { configured: boolean; keyLabel: string | null }
  saveDashscopeApiKey: (apiKey: string) => { configured: boolean; keyLabel: string | null }
  saveOpenAiApiKey: (apiKey: string) => { configured: boolean; keyLabel: string | null }
  completeOnboarding: () => void
  checkAccessibilityPermission: (prompt: boolean) => boolean
  checkMicrophonePermission: (prompt: boolean) => Promise<boolean>
  reportMicrophonePermissionGranted: () => void
  openPermissionSettings: (permission: 'accessibility' | 'microphone') => Promise<void>
  checkForUpdates: () => Promise<unknown>
  restartToUpdate: () => Promise<void>
  resetOnboarding: () => void
  showOnboardingWindow: () => void
}): void {
  ipcMain.removeHandler(IPC_CHANNELS.app.getState)
  ipcMain.removeHandler(IPC_CHANNELS.chat.getState)
  ipcMain.removeHandler(IPC_CHANNELS.selectionToolbar.getState)
  ipcMain.removeHandler(IPC_CHANNELS.tts.getState)
  ipcMain.removeHandler(IPC_CHANNELS.app.getHistoryPage)
  ipcMain.removeHandler(IPC_CHANNELS.app.getHistoryEntryDebug)
  ipcMain.removeHandler(IPC_CHANNELS.recording.complete)
  ipcMain.removeHandler(IPC_CHANNELS.recording.failed)
  ipcMain.removeHandler(IPC_CHANNELS.app.retryHistory)
  ipcMain.removeHandler(IPC_CHANNELS.app.startDictation)
  ipcMain.removeHandler(IPC_CHANNELS.app.stopDictation)
  ipcMain.removeHandler(IPC_CHANNELS.tts.start)
  ipcMain.removeHandler(IPC_CHANNELS.tts.stop)
  ipcMain.removeHandler(IPC_CHANNELS.app.setThemeMode)
  ipcMain.removeHandler(IPC_CHANNELS.app.setLanguage)
  ipcMain.removeHandler(IPC_CHANNELS.app.setSelectionToolbarEnabled)
  ipcMain.removeHandler(IPC_CHANNELS.app.saveDictionaryEntry)
  ipcMain.removeHandler(IPC_CHANNELS.app.deleteDictionaryEntry)
  ipcMain.removeHandler(IPC_CHANNELS.app.setPostProcessPreset)
  ipcMain.removeHandler(IPC_CHANNELS.app.savePostProcessPreset)
  ipcMain.removeHandler(IPC_CHANNELS.app.resetPostProcessPreset)
  ipcMain.removeHandler(IPC_CHANNELS.app.createPostProcessPreset)
  ipcMain.removeHandler(IPC_CHANNELS.app.setHotkey)
  ipcMain.removeHandler(IPC_CHANNELS.app.setMicrophone)
  ipcMain.removeHandler(IPC_CHANNELS.app.setProvider)
  ipcMain.removeHandler(IPC_CHANNELS.app.setProviderLlmModel)
  ipcMain.removeHandler(IPC_CHANNELS.app.getProviderSetup)
  ipcMain.removeHandler(IPC_CHANNELS.app.saveDashscopeApiKey)
  ipcMain.removeHandler(IPC_CHANNELS.app.saveOpenAiApiKey)
  ipcMain.removeHandler(IPC_CHANNELS.app.completeOnboarding)
  ipcMain.removeHandler(IPC_CHANNELS.app.checkAccessibilityPermission)
  ipcMain.removeHandler(IPC_CHANNELS.app.checkMicrophonePermission)
  ipcMain.removeHandler(IPC_CHANNELS.app.reportMicrophonePermissionGranted)
  ipcMain.removeHandler(IPC_CHANNELS.app.openPermissionSettings)
  ipcMain.removeHandler(IPC_CHANNELS.app.checkForUpdates)
  ipcMain.removeHandler(IPC_CHANNELS.app.restartToUpdate)
  ipcMain.removeHandler(IPC_CHANNELS.app.resetOnboarding)
  ipcMain.removeHandler(IPC_CHANNELS.app.showOnboardingWindow)
  ipcMain.removeHandler(IPC_CHANNELS.debug.getLogPath)
  ipcMain.handle(IPC_CHANNELS.debug.getLogPath, () => getDebugLogPath())

  ipcMain.removeAllListeners(IPC_CHANNELS.debug.log)
  ipcMain.on(
    IPC_CHANNELS.debug.log,
    (_event, payload: { message?: unknown; details?: unknown } | undefined) => {
      const message =
        typeof payload?.message === 'string' && payload.message.trim() !== ''
          ? payload.message
          : 'Renderer debug event'
      logDebug('renderer', message, payload?.details)
    }
  )

  ipcMain.handle(IPC_CHANNELS.app.getState, () => input.getAppState())
  ipcMain.handle(IPC_CHANNELS.chat.getState, () => input.getChatState())
  ipcMain.handle(IPC_CHANNELS.selectionToolbar.getState, () => input.getSelectionToolbarState())
  ipcMain.handle(IPC_CHANNELS.tts.getState, () => input.getTtsState())
  ipcMain.handle(
    IPC_CHANNELS.app.getHistoryPage,
    (_event, pageInput: { offset?: unknown; limit?: unknown } | undefined) => {
      return input.getHistoryPage({
        offset:
          typeof pageInput?.offset === 'number' && Number.isFinite(pageInput.offset)
            ? pageInput.offset
            : undefined,
        limit:
          typeof pageInput?.limit === 'number' && Number.isFinite(pageInput.limit)
            ? pageInput.limit
            : undefined
      })
    }
  )
  ipcMain.handle(IPC_CHANNELS.app.getHistoryEntryDebug, async (_event, entryId: unknown) => {
    if (typeof entryId !== 'string' || entryId.trim() === '') {
      return null
    }

    return input.getHistoryEntryDebug(entryId)
  })
  ipcMain.handle(IPC_CHANNELS.recording.complete, async (_event, artifact: RecordingArtifact) => {
    await input.finishRecording({
      ...artifact,
      buffer:
        artifact.buffer instanceof Uint8Array ? artifact.buffer : new Uint8Array(artifact.buffer)
    })
  })
  ipcMain.handle(IPC_CHANNELS.recording.failed, async (_event, detail: string) => {
    input.reportRecordingFailure(detail)
  })
  ipcMain.handle(IPC_CHANNELS.app.retryHistory, async (_event, entryId: string) => {
    await input.retryHistoryEntry(entryId)
  })
  ipcMain.handle(IPC_CHANNELS.app.startDictation, async (_event, source: unknown) => {
    await input.startDictation(source === 'onboarding' ? 'onboarding' : 'global')
  })
  ipcMain.handle(IPC_CHANNELS.app.stopDictation, async (_event, source: unknown) => {
    await input.stopDictation(source === 'onboarding' ? 'onboarding' : 'global')
  })
  ipcMain.handle(
    IPC_CHANNELS.tts.start,
    async (_event, value: { text?: unknown; source?: unknown } | undefined) => {
      if (typeof value?.text !== 'string' || value.text.trim() === '') {
        throw new Error('A valid text string is required.')
      }

      await input.startTextToSpeech({
        text: value.text,
        source: value.source === 'manual' ? 'manual' : 'selection-toolbar'
      })
    }
  )
  ipcMain.handle(IPC_CHANNELS.tts.stop, async () => {
    await input.stopTextToSpeech()
  })
  ipcMain.handle(IPC_CHANNELS.app.setThemeMode, (_event, themeMode: unknown) => {
    if (typeof themeMode !== 'string' || !THEME_MODES.includes(themeMode as ThemeMode)) {
      return
    }

    input.setThemeMode(themeMode as ThemeMode)
  })
  ipcMain.handle(IPC_CHANNELS.app.setLanguage, (_event, language: unknown) => {
    if (
      typeof language !== 'string' ||
      !LANGUAGE_PREFERENCES.includes(language as LanguagePreference)
    ) {
      return
    }

    input.setLanguage(language as LanguagePreference)
  })
  ipcMain.handle(IPC_CHANNELS.app.setSelectionToolbarEnabled, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      return
    }

    input.setSelectionToolbarEnabled(enabled)
  })
  ipcMain.handle(
    IPC_CHANNELS.app.saveDictionaryEntry,
    (
      _event,
      value:
        | {
            id?: unknown
            phrase?: unknown
            replacement?: unknown
            notes?: unknown
          }
        | undefined
    ) => {
      if (
        typeof value?.phrase !== 'string' ||
        value.phrase.trim() === '' ||
        typeof value?.replacement !== 'string' ||
        value.replacement.trim() === ''
      ) {
        throw new Error('Valid dictionary phrase and normalized output are required.')
      }

      return input.saveDictionaryEntry({
        id: typeof value.id === 'string' && value.id.trim() !== '' ? value.id : null,
        phrase: value.phrase,
        replacement: value.replacement,
        notes: typeof value.notes === 'string' ? value.notes : ''
      })
    }
  )
  ipcMain.handle(IPC_CHANNELS.app.deleteDictionaryEntry, (_event, entryId: unknown) => {
    if (typeof entryId !== 'string' || entryId.trim() === '') {
      return
    }

    input.deleteDictionaryEntry(entryId)
  })
  ipcMain.handle(IPC_CHANNELS.app.setPostProcessPreset, (_event, presetId: unknown) => {
    if (typeof presetId !== 'string' || presetId.trim() === '') {
      return
    }

    input.setPostProcessPreset(presetId as PostProcessPresetId)
  })
  ipcMain.handle(
    IPC_CHANNELS.app.savePostProcessPreset,
    (
      _event,
      value:
        | {
            id?: unknown
            name?: unknown
            systemPrompt?: unknown
            enablePostProcessing?: unknown
          }
        | undefined
    ) => {
      if (
        typeof value?.id !== 'string' ||
        value.id.trim() === '' ||
        typeof value?.name !== 'string' ||
        typeof value?.systemPrompt !== 'string' ||
        typeof value?.enablePostProcessing !== 'boolean'
      ) {
        throw new Error('Valid post-process preset fields are required.')
      }

      return input.savePostProcessPreset({
        id: value.id,
        name: value.name,
        systemPrompt: value.systemPrompt,
        enablePostProcessing: value.enablePostProcessing
      })
    }
  )
  ipcMain.handle(IPC_CHANNELS.app.resetPostProcessPreset, (_event, presetId: unknown) => {
    if (typeof presetId !== 'string' || presetId.trim() === '') {
      throw new Error('A valid post-process preset id is required.')
    }

    return input.resetPostProcessPreset(presetId)
  })
  ipcMain.handle(
    IPC_CHANNELS.app.createPostProcessPreset,
    (
      _event,
      value: { name?: unknown; systemPrompt?: unknown; enablePostProcessing?: unknown } | undefined
    ) => {
      if (
        typeof value?.name !== 'string' ||
        typeof value?.systemPrompt !== 'string' ||
        typeof value?.enablePostProcessing !== 'boolean'
      ) {
        throw new Error('Valid post-process preset fields are required.')
      }

      return input.createPostProcessPreset({
        name: value.name,
        systemPrompt: value.systemPrompt,
        enablePostProcessing: value.enablePostProcessing
      })
    }
  )
  ipcMain.handle(IPC_CHANNELS.app.setHotkey, (_event, hotkey: unknown) => {
    if (hotkey !== 'MetaRight' && hotkey !== 'AltRight' && hotkey !== 'ControlRight') {
      return
    }

    input.setHotkey(hotkey)
  })
  ipcMain.handle(
    IPC_CHANNELS.app.setMicrophone,
    (_event, value: { deviceId?: unknown; label?: unknown } | undefined) => {
      input.setMicrophone({
        deviceId:
          typeof value?.deviceId === 'string' && value.deviceId.trim() !== ''
            ? value.deviceId
            : null,
        label: typeof value?.label === 'string' && value.label.trim() !== '' ? value.label : null
      })
    }
  )
  ipcMain.handle(IPC_CHANNELS.app.setProvider, (_event, provider: unknown) => {
    if (provider !== 'dashscope' && provider !== 'openai') {
      return
    }

    input.setProvider(provider)
  })
  ipcMain.handle(
    IPC_CHANNELS.app.setProviderLlmModel,
    (_event, value: { provider?: unknown; model?: unknown } | undefined) => {
      if (
        (value?.provider !== 'dashscope' && value?.provider !== 'openai') ||
        typeof value?.model !== 'string' ||
        value.model.trim() === ''
      ) {
        return
      }

      input.setProviderLlmModel(value.provider, value.model)
    }
  )
  ipcMain.handle(IPC_CHANNELS.app.getProviderSetup, () => {
    return input.getProviderSetup()
  })
  ipcMain.handle(IPC_CHANNELS.app.saveDashscopeApiKey, (_event, apiKey: unknown) => {
    if (typeof apiKey !== 'string') {
      throw new Error('DashScope API key is required.')
    }

    return input.saveDashscopeApiKey(apiKey)
  })
  ipcMain.handle(IPC_CHANNELS.app.saveOpenAiApiKey, (_event, apiKey: unknown) => {
    if (typeof apiKey !== 'string') {
      throw new Error('OpenAI API key is required.')
    }

    return input.saveOpenAiApiKey(apiKey)
  })
  ipcMain.handle(IPC_CHANNELS.app.completeOnboarding, () => {
    input.completeOnboarding()
  })
  ipcMain.handle(IPC_CHANNELS.app.checkAccessibilityPermission, (_event, prompt: unknown) => {
    return input.checkAccessibilityPermission(Boolean(prompt))
  })
  ipcMain.handle(IPC_CHANNELS.app.checkMicrophonePermission, async (_event, prompt: unknown) => {
    return input.checkMicrophonePermission(Boolean(prompt))
  })
  ipcMain.handle(IPC_CHANNELS.app.reportMicrophonePermissionGranted, () => {
    input.reportMicrophonePermissionGranted()
  })
  ipcMain.handle(IPC_CHANNELS.app.openPermissionSettings, async (_event, permission: unknown) => {
    if (permission !== 'accessibility' && permission !== 'microphone') {
      return
    }

    await input.openPermissionSettings(permission)
  })
  ipcMain.handle(IPC_CHANNELS.app.checkForUpdates, async () => {
    return input.checkForUpdates()
  })
  ipcMain.handle(IPC_CHANNELS.app.restartToUpdate, async () => {
    await input.restartToUpdate()
  })
  ipcMain.handle(IPC_CHANNELS.app.resetOnboarding, () => {
    input.resetOnboarding()
  })
  ipcMain.handle(IPC_CHANNELS.app.showOnboardingWindow, () => {
    input.showOnboardingWindow()
  })
}
