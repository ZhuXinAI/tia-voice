import { useEffect, useMemo, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import {
  completeOnboarding,
  getHistoryEntryDebug,
  getMainAppState,
  openPermissionSettings,
  resetOnboarding,
  retryHistoryEntry,
  saveDashscopeApiKey,
  showOnboardingWindow,
  setThemeMode,
  subscribeToAppState
} from '../lib/ipc'
import type { ThemeMode } from '../../../preload/index'

import { defaultMainAppState, starterDictionary } from './main-app/defaults'
import { DictionaryRoute } from './main-app/DictionaryRoute'
import { HomeRoute } from './main-app/HomeRoute'
import { HistoryDebugDialog } from './main-app/HistoryDebugDialog'
import { MainAppLayout } from './main-app/MainAppLayout'
import { OnboardingDialog } from './main-app/OnboardingDialog'
import { SettingsDialog } from './main-app/SettingsDialog'
import type {
  DictionaryPhrase,
  MainAppHistoryEntry,
  SettingsSection,
  TiaHistoryDebugEntry
} from './main-app/types'
import { countWords } from './main-app/utils'

export default function MainAppWindow(): React.JSX.Element {
  const [state, setState] = useState(defaultMainAppState)
  const [retrying, setRetrying] = useState<Record<string, boolean>>({})
  const [onboardingOpen, setOnboardingOpen] = useState(defaultMainAppState.onboarding.visible)
  const [selectedHistory, setSelectedHistory] = useState<MainAppHistoryEntry | null>(null)
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<TiaHistoryDebugEntry | null>(
    null
  )
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')

  const [dictionary, setDictionary] = useState<DictionaryPhrase[]>(starterDictionary)
  const [phraseDraft, setPhraseDraft] = useState('')
  const [replacementDraft, setReplacementDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')

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

  const handleHistoryDialogOpenChange = (open: boolean): void => {
    if (open) {
      return
    }

    setSelectedHistory(null)
    setSelectedHistoryDetail(null)
    setHistoryDetailLoading(false)
  }

  const wordsSpoken = useMemo(() => {
    return state.history.reduce((sum, item) => sum + countWords(item.preview), 0)
  }, [state.history])

  const averageWpm = useMemo(() => {
    if (state.history.length < 2 || wordsSpoken === 0) {
      return null
    }

    const sortedByTime = [...state.history].sort((a, b) => a.createdAt - b.createdAt)
    const elapsedMs = sortedByTime[sortedByTime.length - 1].createdAt - sortedByTime[0].createdAt

    if (elapsedMs <= 0) {
      return null
    }

    const elapsedMinutes = elapsedMs / 60000
    return Math.max(1, Math.round(wordsSpoken / elapsedMinutes))
  }, [state.history, wordsSpoken])

  const history = useMemo(() => {
    return [...state.history].sort((a, b) => b.createdAt - a.createdAt)
  }, [state.history])

  const handleAddPhrase = (): void => {
    if (!phraseDraft.trim() || !replacementDraft.trim()) {
      return
    }

    const next: DictionaryPhrase = {
      id: crypto.randomUUID(),
      phrase: phraseDraft.trim(),
      replacement: replacementDraft.trim(),
      notes: noteDraft.trim()
    }

    setDictionary((current) => [next, ...current])
    setPhraseDraft('')
    setReplacementDraft('')
    setNoteDraft('')
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

  const handleOpenOnboardingFromSettings = async (): Promise<void> => {
    setSettingsOpen(false)
    setOnboardingOpen(true)
    await showOnboardingWindow()
    await syncMainAppState()
  }

  const handleOpenPermissionSettings = async (
    permission: 'accessibility' | 'microphone'
  ): Promise<void> => {
    await openPermissionSettings(permission)
  }

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/"
          element={
            <MainAppLayout
              dashscope={state.dashscope}
              onOpenSettings={handleOpenSettings}
              permissions={state.permissions}
              voiceBackendStatus={state.voiceBackendStatus}
            />
          }
        >
          <Route
            index
            element={
              <HomeRoute
                wordsSpoken={wordsSpoken}
                averageWpm={averageWpm}
                history={history}
                retrying={retrying}
                onOpenDetails={(entry) => void handleOpenHistoryDetails(entry)}
                onRetry={handleRetry}
              />
            }
          />

          <Route
            path="dictionary"
            element={
              <DictionaryRoute
                dictionary={dictionary}
                phraseDraft={phraseDraft}
                replacementDraft={replacementDraft}
                noteDraft={noteDraft}
                onPhraseDraftChange={setPhraseDraft}
                onReplacementDraftChange={setReplacementDraft}
                onNoteDraftChange={setNoteDraft}
                onAddPhrase={handleAddPhrase}
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
        dashscope={state.dashscope}
        permissions={state.permissions}
        themeMode={state.themeMode}
        onThemeModeChange={handleThemeModeChange}
        onSaveDashscopeApiKey={handleSaveDashscopeApiKey}
        onOpenPermissionSettings={handleOpenPermissionSettings}
        onOpenOnboarding={handleOpenOnboardingFromSettings}
        onResetOnboarding={handleResetOnboarding}
      />

      <HistoryDebugDialog
        open={selectedHistory !== null}
        onOpenChange={handleHistoryDialogOpenChange}
        historyTitle={selectedHistory?.title ?? 'Transcription details'}
        detail={selectedHistoryDetail}
        loading={historyDetailLoading}
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
  )
}
