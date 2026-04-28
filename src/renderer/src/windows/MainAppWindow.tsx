import { useEffect, useMemo, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import {
  checkForUpdates,
  completeOnboarding,
  getHistoryEntryDebug,
  getMainAppState,
  openPermissionSettings,
  resetOnboarding,
  restartToUpdate,
  retryHistoryEntry,
  deleteDictionaryEntry,
  createPostProcessPreset,
  saveDictionaryEntry,
  saveDashscopeApiKey,
  saveOpenAiApiKey,
  resetPostProcessPreset,
  savePostProcessPreset,
  setLanguage,
  setSelectionToolbarEnabled,
  setPostProcessPreset,
  setProviderLlmModel,
  showOnboardingWindow,
  setHotkey,
  setMicrophone,
  setProvider,
  setThemeMode,
  subscribeToAppState
} from '../lib/ipc'
import { requestMicrophonePermission } from '../lib/microphoneAccess'
import type {
  PostProcessPresetId,
  ProviderKind,
  ThemeMode,
  TriggerKey,
  LanguagePreference
} from '../../../preload/index'
import { I18nProvider } from '@renderer/i18n'
import { getNavigatorPreferredLocales, resolveAppLanguage } from '../../../shared/i18n/config'

import { defaultMainAppState } from './main-app/defaults'
import { DictionaryRoute } from './main-app/DictionaryRoute'
import { HomeRoute } from './main-app/HomeRoute'
import { HistoryDialog } from './main-app/HistoryDialog'
import { HistoryDebugDialog } from './main-app/HistoryDebugDialog'
import { MainAppLayout } from './main-app/MainAppLayout'
import { OnboardingDialog } from './main-app/OnboardingDialog'
import { PresetsRoute } from './main-app/PresetsRoute'
import { SettingsDialog } from './main-app/SettingsDialog'
import type { MainAppHistoryEntry, SettingsSection, TiaHistoryDebugEntry } from './main-app/types'
import { useAudioInputs } from './main-app/useAudioInputs'
import { useHistoryPagination } from './main-app/useHistoryPagination'

export default function MainAppWindow(): React.JSX.Element {
  const [state, setState] = useState(defaultMainAppState)
  const [retrying, setRetrying] = useState<Record<string, boolean>>({})
  const [historyListOpen, setHistoryListOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(defaultMainAppState.onboarding.visible)
  const [selectedHistory, setSelectedHistory] = useState<MainAppHistoryEntry | null>(null)
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<TiaHistoryDebugEntry | null>(
    null
  )
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')

  const [phraseDraft, setPhraseDraft] = useState('')
  const [replacementDraft, setReplacementDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const { audioInputs } = useAudioInputs()
  const historyPagination = useHistoryPagination({
    recentHistory: state.history,
    totalCount: state.historySummary.totalCount,
    open: historyListOpen
  })

  const syncMainAppState = async (): Promise<void> => {
    const nextState = await getMainAppState()
    setState(nextState)
  }

  useEffect(() => {
    void getMainAppState().then(setState)
    return subscribeToAppState(setState)
  }, [])

  useEffect(() => {
    const handleWindowFocus = (): void => {
      void syncMainAppState()
    }

    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [])

  useEffect(() => {
    setOnboardingOpen(state.onboarding.visible)
  }, [state.onboarding.visible])

  useEffect(() => {
    const rootElement = document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener?: (listener: () => void) => void
      removeListener?: (listener: () => void) => void
    }

    const applyTheme = (): void => {
      const prefersDark = mediaQuery.matches
      const shouldUseDark =
        state.themeMode === 'dark' || (state.themeMode === 'system' && prefersDark)
      rootElement.classList.toggle('dark', shouldUseDark)
      rootElement.dataset.themeMode = state.themeMode
    }

    applyTheme()

    if (state.themeMode !== 'system') {
      return () => undefined
    }

    const handleSystemThemeChange = (): void => {
      applyTheme()
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemThemeChange)
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }

    legacyMediaQuery.addListener?.(handleSystemThemeChange)
    return () => legacyMediaQuery.removeListener?.(handleSystemThemeChange)
  }, [state.themeMode])

  const handleRetry = async (entryId: string): Promise<void> => {
    setRetrying((current) => ({
      ...current,
      [entryId]: true
    }))

    try {
      await retryHistoryEntry(entryId)
    } finally {
      setRetrying((current) => {
        const next = { ...current }
        delete next[entryId]
        return next
      })
    }
  }

  const handleOpenHistoryDetails = async (entry: MainAppHistoryEntry): Promise<void> => {
    setSelectedHistory(entry)
    setSelectedHistoryDetail(null)
    setHistoryDetailLoading(true)

    try {
      const detail = await getHistoryEntryDebug(entry.id)
      setSelectedHistoryDetail(detail)
    } finally {
      setHistoryDetailLoading(false)
    }
  }

  const handleHistoryDetailOpenChange = (open: boolean): void => {
    if (open) {
      return
    }

    setSelectedHistory(null)
    setSelectedHistoryDetail(null)
    setHistoryDetailLoading(false)
  }

  const handleOpenHistoryDetailsFromDialog = (entry: MainAppHistoryEntry): void => {
    setHistoryListOpen(false)
    void handleOpenHistoryDetails(entry)
  }
  const microphoneOptions = useMemo(() => {
    const selectedOption =
      state.microphone.selectedDeviceId || state.microphone.selectedDeviceLabel
        ? [
            {
              deviceId: state.microphone.selectedDeviceId,
              label: state.microphone.selectedDeviceLabel ?? 'Previously selected microphone'
            }
          ]
        : []

    return [...selectedOption, ...audioInputs].filter(
      (option, index, allOptions) =>
        allOptions.findIndex((candidate) => candidate.deviceId === option.deviceId) === index
    )
  }, [audioInputs, state.microphone.selectedDeviceId, state.microphone.selectedDeviceLabel])

  const handleAddPhrase = async (): Promise<void> => {
    if (!phraseDraft.trim() || !replacementDraft.trim()) {
      return
    }

    await saveDictionaryEntry({
      phrase: phraseDraft.trim(),
      replacement: replacementDraft.trim(),
      notes: noteDraft.trim()
    })
    await syncMainAppState()

    setPhraseDraft('')
    setReplacementDraft('')
    setNoteDraft('')
  }

  const handleDeletePhrase = async (entryId: string): Promise<void> => {
    await deleteDictionaryEntry(entryId)
    await syncMainAppState()
  }

  const handleOpenSettings = (section: SettingsSection = 'general'): void => {
    setSettingsSection(section)
    setSettingsOpen(true)
  }

  const handleThemeModeChange = async (themeMode: ThemeMode): Promise<void> => {
    const previousThemeMode = state.themeMode
    setState((current) => ({
      ...current,
      themeMode
    }))

    try {
      await setThemeMode(themeMode)
    } catch {
      setState((current) => ({
        ...current,
        themeMode: previousThemeMode
      }))
    }
  }

  const handlePostProcessPresetChange = async (presetId: PostProcessPresetId): Promise<void> => {
    const previousPreset = state.postProcessPreset
    setState((current) => ({
      ...current,
      postProcessPreset: presetId
    }))

    try {
      await setPostProcessPreset(presetId)
      await syncMainAppState()
    } catch {
      setState((current) => ({
        ...current,
        postProcessPreset: previousPreset
      }))
    }
  }

  const handleSavePostProcessPreset = async (input: {
    id: string
    name: string
    systemPrompt: string
    enablePostProcessing: boolean
  }): Promise<void> => {
    await savePostProcessPreset(input)
    await syncMainAppState()
  }

  const handleResetPostProcessPreset = async (presetId: string): Promise<void> => {
    await resetPostProcessPreset(presetId)
    await syncMainAppState()
  }

  const handleCreatePostProcessPreset = async (input: {
    name: string
    systemPrompt: string
    enablePostProcessing: boolean
  }): Promise<void> => {
    await createPostProcessPreset(input)
    await syncMainAppState()
  }

  const handleHotkeyChange = async (hotkey: TriggerKey): Promise<void> => {
    await setHotkey(hotkey)
    await syncMainAppState()
  }

  const handleMicrophoneChange = async (input: {
    deviceId: string | null
    label: string | null
  }): Promise<void> => {
    await setMicrophone(input)
    await syncMainAppState()
  }

  const handleProviderChange = async (provider: ProviderKind): Promise<void> => {
    await setProvider(provider)
    await syncMainAppState()
  }

  const handleProviderLlmModelChange = async (
    provider: ProviderKind,
    model: string
  ): Promise<void> => {
    await setProviderLlmModel({ provider, model })
    await syncMainAppState()
  }

  const handleLanguageChange = async (language: LanguagePreference): Promise<void> => {
    const previousLanguage = state.language
    const resolved = resolveAppLanguage(language, getNavigatorPreferredLocales())
    setState((current) => ({
      ...current,
      language: {
        preference: language,
        resolved
      }
    }))

    try {
      await setLanguage(language)
      await syncMainAppState()
    } catch {
      setState((current) => ({
        ...current,
        language: previousLanguage
      }))
    }
  }

  const handleSelectionToolbarEnabledChange = async (enabled: boolean): Promise<void> => {
    await setSelectionToolbarEnabled(enabled)
    await syncMainAppState()
  }

  const handleResetOnboarding = async (): Promise<void> => {
    await resetOnboarding()
    await showOnboardingWindow()
    await syncMainAppState()
  }

  const handleCompleteOnboarding = async (): Promise<void> => {
    await completeOnboarding()
  }

  const handleOnboardingOpenChange = (open: boolean): void => {
    setOnboardingOpen(open)
    if (!open && state.onboarding.visible) {
      void handleCompleteOnboarding()
    }
  }

  const handleSkipOnboarding = async (): Promise<void> => {
    setOnboardingOpen(false)
    try {
      await handleCompleteOnboarding()
    } catch (error) {
      setOnboardingOpen(true)
      throw error
    }
  }

  const handleSaveDashscopeApiKey = async (apiKey: string): Promise<void> => {
    await saveDashscopeApiKey(apiKey)
    await syncMainAppState()
  }

  const handleSaveOpenAiApiKey = async (apiKey: string): Promise<void> => {
    await saveOpenAiApiKey(apiKey)
    await syncMainAppState()
  }

  const handleOpenOnboardingFromSettings = async (): Promise<void> => {
    setSettingsOpen(false)
    setOnboardingOpen(true)
    await showOnboardingWindow()
    await syncMainAppState()
  }

  const handleOpenPermissionSettings = async (
    permission: 'accessibility' | 'microphone'
  ): Promise<void> => {
    if (permission === 'microphone') {
      await requestMicrophonePermission()
      await syncMainAppState()
      return
    }

    await openPermissionSettings(permission)
  }

  const handleCheckForUpdates = async (): Promise<void> => {
    await checkForUpdates()
    await syncMainAppState()
  }

  const handleRestartToUpdate = async (): Promise<void> => {
    await restartToUpdate()
  }

  return (
    <I18nProvider language={state.language.resolved}>
      <HashRouter>
        <Routes>
          <Route
            path="/"
            element={
              <MainAppLayout
                dashscope={state.dashscope}
                openai={state.openai}
                selectedProvider={state.selectedProvider}
                postProcessPreset={state.postProcessPreset}
                postProcessPresets={state.postProcessPresets}
                onOpenSettings={handleOpenSettings}
                permissions={state.permissions}
                voiceBackendStatus={state.voiceBackendStatus}
                autoUpdate={state.autoUpdate}
                onRestartToUpdate={handleRestartToUpdate}
              />
            }
          >
            <Route
              index
              element={
                <HomeRoute
                  wordsSpoken={state.historySummary.wordsSpoken}
                  averageWpm={state.historySummary.averageWpm}
                  totalCount={state.historySummary.totalCount}
                  history={state.history}
                  retrying={retrying}
                  onOpenDetails={(entry) => void handleOpenHistoryDetails(entry)}
                  onShowAll={() => setHistoryListOpen(true)}
                  onRetry={handleRetry}
                />
              }
            />

            <Route
              path="dictionary"
              element={
                <DictionaryRoute
                  dictionary={state.dictionaryEntries}
                  phraseDraft={phraseDraft}
                  replacementDraft={replacementDraft}
                  noteDraft={noteDraft}
                  onPhraseDraftChange={setPhraseDraft}
                  onReplacementDraftChange={setReplacementDraft}
                  onNoteDraftChange={setNoteDraft}
                  onAddPhrase={handleAddPhrase}
                  onDeletePhrase={handleDeletePhrase}
                />
              }
            />

            <Route
              path="presets"
              element={
                <PresetsRoute
                  presets={state.postProcessPresets}
                  selectedPreset={state.postProcessPreset}
                  onSelectPreset={(presetId) => void handlePostProcessPresetChange(presetId)}
                  onSavePreset={(input) => void handleSavePostProcessPreset(input)}
                  onResetPreset={(presetId) => void handleResetPostProcessPreset(presetId)}
                  onCreatePreset={(input) => void handleCreatePostProcessPreset(input)}
                />
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          section={settingsSection}
          onSectionChange={setSettingsSection}
          registeredHotkey={state.registeredHotkey}
          selectedProvider={state.selectedProvider}
          selectedMicrophone={{
            deviceId: state.microphone.selectedDeviceId,
            label: state.microphone.selectedDeviceLabel
          }}
          microphoneOptions={microphoneOptions}
          dashscope={state.dashscope}
          openai={state.openai}
          permissions={state.permissions}
          appInfo={state.appInfo}
          autoUpdate={state.autoUpdate}
          languagePreference={state.language.preference}
          resolvedLanguage={state.language.resolved}
          themeMode={state.themeMode}
          selectionToolbarEnabled={state.features.selectionToolbar}
          onThemeModeChange={handleThemeModeChange}
          onLanguageChange={handleLanguageChange}
          onSelectionToolbarEnabledChange={handleSelectionToolbarEnabledChange}
          onHotkeyChange={handleHotkeyChange}
          onMicrophoneChange={handleMicrophoneChange}
          onProviderChange={handleProviderChange}
          onProviderLlmModelChange={handleProviderLlmModelChange}
          onSaveDashscopeApiKey={handleSaveDashscopeApiKey}
          onSaveOpenAiApiKey={handleSaveOpenAiApiKey}
          onOpenPermissionSettings={handleOpenPermissionSettings}
          onCheckForUpdates={handleCheckForUpdates}
          onRestartToUpdate={handleRestartToUpdate}
          onOpenOnboarding={handleOpenOnboardingFromSettings}
          onResetOnboarding={handleResetOnboarding}
        />

        <HistoryDebugDialog
          open={selectedHistory !== null}
          onOpenChange={handleHistoryDetailOpenChange}
          historyTitle={selectedHistory?.title ?? ''}
          detail={selectedHistoryDetail}
          loading={historyDetailLoading}
        />

        <HistoryDialog
          open={historyListOpen}
          onOpenChange={setHistoryListOpen}
          history={historyPagination.history}
          totalCount={state.historySummary.totalCount}
          pageIndex={historyPagination.pageIndex}
          pageCount={historyPagination.pageCount}
          loading={historyPagination.loading}
          retrying={retrying}
          onPreviousPage={historyPagination.goToPreviousPage}
          onNextPage={historyPagination.goToNextPage}
          onOpenDetails={handleOpenHistoryDetailsFromDialog}
          onRetry={handleRetry}
        />

        <OnboardingDialog
          open={onboardingOpen}
          dashscopeConfigured={state.dashscope.configured}
          dashscopeKeyLabel={state.dashscope.keyLabel}
          hotkeyHint={state.hotkeyHint}
          permissions={state.permissions}
          registeredHotkey={state.registeredHotkey}
          registeredHotkeyLabel={state.registeredHotkeyLabel}
          onOpenChange={handleOnboardingOpenChange}
          onComplete={handleCompleteOnboarding}
          onSkip={handleSkipOnboarding}
        />
      </HashRouter>
    </I18nProvider>
  )
}
