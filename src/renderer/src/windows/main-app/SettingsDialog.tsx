import { useState } from 'react'
import { Info, Keyboard, Languages, Mic2, Settings2, ShieldAlert, SunMoon } from 'lucide-react'

import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Separator } from '@renderer/components/ui/separator'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import { useI18n } from '@renderer/i18n'

import { AboutSettingsSection } from './AboutSettingsSection'
import { LanguageSettingsSection } from './LanguageSettingsSection'
import { formatMaskedKeyLabel } from './maskedKeyLabel'
import type { DashscopeSetupState, MainAppState, SettingsSection } from './types'
import type { ProviderKind, ThemeMode, TriggerKey } from '../../../../preload/index'
import type { AppLanguage, LanguagePreference } from '../../../../shared/i18n/config'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  registeredHotkey: TriggerKey | null
  selectedProvider: ProviderKind
  selectedMicrophone: {
    deviceId: string | null
    label: string | null
  }
  microphoneOptions: Array<{
    deviceId: string | null
    label: string
  }>
  dashscope: DashscopeSetupState
  openai: DashscopeSetupState
  permissions: MainAppState['permissions']
  appInfo: MainAppState['appInfo']
  autoUpdate: MainAppState['autoUpdate']
  languagePreference: LanguagePreference
  resolvedLanguage: AppLanguage
  themeMode: ThemeMode
  onThemeModeChange: (themeMode: ThemeMode) => Promise<void>
  onLanguageChange: (language: LanguagePreference) => Promise<void>
  onHotkeyChange: (hotkey: TriggerKey) => Promise<void>
  onMicrophoneChange: (input: { deviceId: string | null; label: string | null }) => Promise<void>
  onProviderChange: (provider: ProviderKind) => Promise<void>
  onProviderLlmModelChange: (provider: ProviderKind, model: string) => Promise<void>
  onSaveDashscopeApiKey: (apiKey: string) => Promise<void>
  onSaveOpenAiApiKey: (apiKey: string) => Promise<void>
  onOpenPermissionSettings: (permission: 'accessibility' | 'microphone') => Promise<void>
  onCheckForUpdates: () => Promise<void>
  onRestartToUpdate: () => Promise<void>
  onOpenOnboarding: () => Promise<void>
  onResetOnboarding: () => Promise<void>
}

type TranslateFn = ReturnType<typeof useI18n>['t']

function getShortcutOptions(
  platform: NodeJS.Platform,
  t: TranslateFn
): Array<{
  id: TriggerKey
  label: string
  detail: string
}> {
  if (platform === 'win32') {
    return [
      {
        id: 'ControlRight',
        label: t('settings.shortcut.rightControl'),
        detail: t('settings.shortcut.rightControlDetail')
      },
      {
        id: 'AltRight',
        label: t('settings.shortcut.rightAlt'),
        detail: t('settings.shortcut.rightAltWindowsDetail')
      }
    ]
  }

  return [
    {
      id: 'MetaRight',
      label: t('settings.shortcut.rightCommand'),
      detail: t('settings.shortcut.rightCommandDetail')
    },
    {
      id: 'AltRight',
      label:
        platform === 'darwin'
          ? t('settings.shortcut.rightOption')
          : t('settings.shortcut.rightAlt'),
      detail:
        platform === 'darwin'
          ? t('settings.shortcut.rightOptionDetail')
          : t('settings.shortcut.rightAltDetail')
    }
  ]
}

function getProviderOptions(t: TranslateFn): Array<{
  id: ProviderKind
  label: string
  detail: string
}> {
  return [
    {
      id: 'dashscope',
      label: t('provider.dashscope'),
      detail: t('settings.provider.dashscopeDetail')
    },
    {
      id: 'openai',
      label: t('provider.openai'),
      detail: t('settings.provider.openaiDetail')
    }
  ]
}

function getThemeOptions(t: TranslateFn): Array<{
  id: ThemeMode
  label: string
  detail: string
}> {
  return [
    {
      id: 'system',
      label: t('settings.theme.system'),
      detail: t('settings.theme.systemDetail')
    },
    {
      id: 'dark',
      label: t('settings.theme.dark'),
      detail: t('settings.theme.darkDetail')
    },
    {
      id: 'light',
      label: t('settings.theme.light'),
      detail: t('settings.theme.lightDetail')
    }
  ]
}

const settingsMenu: Array<{
  id: SettingsSection
  icon: typeof Settings2
}> = [
  {
    id: 'general',
    icon: Settings2
  },
  {
    id: 'providers',
    icon: Mic2
  },
  {
    id: 'permissions',
    icon: ShieldAlert
  },
  {
    id: 'language',
    icon: Languages
  },
  {
    id: 'about',
    icon: Info
  }
]

export function SettingsDialog(props: SettingsDialogProps): React.JSX.Element {
  const platform = window.electron?.process.platform ?? 'darwin'
  const {
    open,
    onOpenChange,
    section,
    onSectionChange,
    registeredHotkey,
    selectedProvider,
    selectedMicrophone,
    microphoneOptions,
    dashscope,
    openai,
    permissions,
    appInfo,
    autoUpdate,
    languagePreference,
    resolvedLanguage,
    themeMode,
    onThemeModeChange,
    onLanguageChange,
    onHotkeyChange,
    onMicrophoneChange,
    onProviderChange,
    onProviderLlmModelChange,
    onSaveDashscopeApiKey,
    onSaveOpenAiApiKey,
    onOpenPermissionSettings,
    onCheckForUpdates,
    onRestartToUpdate,
    onOpenOnboarding,
    onResetOnboarding
  } = props
  const { t } = useI18n()
  const shortcutOptions = getShortcutOptions(platform, t)
  const providerOptions = getProviderOptions(t)
  const themeOptions = getThemeOptions(t)

  const [themePending, setThemePending] = useState(false)
  const [languagePending, setLanguagePending] = useState<LanguagePreference | null>(null)
  const [hotkeyPending, setHotkeyPending] = useState<TriggerKey | null>(null)
  const [microphonePending, setMicrophonePending] = useState<string | null>(null)
  const [providerPending, setProviderPending] = useState<ProviderKind | null>(null)
  const [providerModelPending, setProviderModelPending] = useState<ProviderKind | null>(null)
  const [dashscopeApiKeyDraft, setDashscopeApiKeyDraft] = useState('')
  const [openAiApiKeyDraft, setOpenAiApiKeyDraft] = useState('')
  const [providerSavePending, setProviderSavePending] = useState<ProviderKind | null>(null)
  const [providerSaveError, setProviderSaveError] = useState<string | null>(null)
  const [permissionActionPending, setPermissionActionPending] = useState<
    'accessibility' | 'microphone' | null
  >(null)
  const [onboardingResetPending, setOnboardingResetPending] = useState(false)
  const [onboardingResetError, setOnboardingResetError] = useState<string | null>(null)
  const showDevOnboardingTools = import.meta.env.DEV

  const activeThemeDetail =
    themeOptions.find((option) => option.id === themeMode)?.detail ?? themeOptions[0].detail
  const selectedShortcut =
    shortcutOptions.find((option) => option.id === registeredHotkey) ?? shortcutOptions[0]
  const selectedMicrophoneLabel =
    selectedMicrophone.deviceId === null
      ? t('settings.systemDefaultMic')
      : (selectedMicrophone.label ?? t('settings.previousSelectedMic'))

  const handleThemeModeChange = async (nextMode: ThemeMode): Promise<void> => {
    if (nextMode === themeMode || themePending) {
      return
    }

    setThemePending(true)

    try {
      await onThemeModeChange(nextMode)
    } finally {
      setThemePending(false)
    }
  }

  const handleLanguageChange = async (language: LanguagePreference): Promise<void> => {
    if (languagePending || languagePreference === language) {
      return
    }

    setLanguagePending(language)
    try {
      await onLanguageChange(language)
    } finally {
      setLanguagePending(null)
    }
  }

  const handleHotkeyChange = async (hotkey: TriggerKey): Promise<void> => {
    if (hotkey === registeredHotkey || hotkeyPending) {
      return
    }

    setHotkeyPending(hotkey)

    try {
      await onHotkeyChange(hotkey)
    } finally {
      setHotkeyPending(null)
    }
  }

  const handleMicrophoneChange = async (deviceId: string | null, label: string): Promise<void> => {
    if (microphonePending || selectedMicrophone.deviceId === deviceId) {
      return
    }

    setMicrophonePending(deviceId ?? '__default__')

    try {
      await onMicrophoneChange({
        deviceId,
        label: deviceId ? label : null
      })
    } finally {
      setMicrophonePending(null)
    }
  }

  const handleProviderChange = async (provider: ProviderKind): Promise<void> => {
    if (provider === selectedProvider || providerPending) {
      return
    }

    setProviderPending(provider)

    try {
      await onProviderChange(provider)
    } finally {
      setProviderPending(null)
    }
  }

  const handleProviderLlmModelChange = async (
    provider: ProviderKind,
    model: string
  ): Promise<void> => {
    const currentModel = provider === 'openai' ? openai.llmModel : dashscope.llmModel
    if (providerModelPending || currentModel === model) {
      return
    }

    setProviderModelPending(provider)

    try {
      await onProviderLlmModelChange(provider, model)
    } finally {
      setProviderModelPending(null)
    }
  }

  const handleSaveDashscopeKey = async (): Promise<void> => {
    if (!dashscopeApiKeyDraft.trim() || providerSavePending) {
      return
    }

    setProviderSavePending('dashscope')
    setProviderSaveError(null)

    try {
      await onSaveDashscopeApiKey(dashscopeApiKeyDraft)
      setDashscopeApiKeyDraft('')
    } catch (error) {
      setProviderSaveError(
        error instanceof Error ? error.message : t('settings.error.saveDashscopeKey')
      )
    } finally {
      setProviderSavePending(null)
    }
  }

  const handleSaveOpenAiKey = async (): Promise<void> => {
    if (!openAiApiKeyDraft.trim() || providerSavePending) {
      return
    }

    setProviderSavePending('openai')
    setProviderSaveError(null)

    try {
      await onSaveOpenAiApiKey(openAiApiKeyDraft)
      setOpenAiApiKeyDraft('')
    } catch (error) {
      setProviderSaveError(
        error instanceof Error ? error.message : t('settings.error.saveOpenAiKey')
      )
    } finally {
      setProviderSavePending(null)
    }
  }

  const handleResetOnboarding = async (): Promise<void> => {
    if (onboardingResetPending) {
      return
    }

    setOnboardingResetPending(true)
    setOnboardingResetError(null)

    try {
      await onResetOnboarding()
      onOpenChange(false)
    } catch (error) {
      setOnboardingResetError(
        error instanceof Error ? error.message : t('settings.error.resetOnboarding')
      )
    } finally {
      setOnboardingResetPending(false)
    }
  }

  const handleOpenPermissionSettings = async (
    permission: 'accessibility' | 'microphone'
  ): Promise<void> => {
    if (permissionActionPending) {
      return
    }

    setPermissionActionPending(permission)
    try {
      await onOpenPermissionSettings(permission)
    } finally {
      setPermissionActionPending(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] w-[min(960px,92vw)] max-w-none overflow-hidden border border-border/70 bg-background/95 p-0 text-foreground shadow-2xl backdrop-blur-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid h-[78vh] grid-cols-[220px_1fr] overflow-hidden max-md:grid-cols-1">
          <aside className="border-r border-border/60 bg-muted/30 p-4 max-md:border-b max-md:border-r-0">
            <p className="px-2 pb-4 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {t('settings.title')}
            </p>
            <div className="space-y-1">
              {settingsMenu.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={section === item.id ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-2"
                  onClick={() => onSectionChange(item.id)}
                >
                  <item.icon className="h-4 w-4" />
                  {t(`settings.${item.id}`)}
                </Button>
              ))}
            </div>
          </aside>

          <section className="overflow-y-auto p-8">
            {section === 'general' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold">{t('settings.generalTitle')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t('settings.generalBody')}</p>
                </div>

                <Card className="border-border/70 bg-card/70">
                  <CardContent className="p-0">
                    <div className="flex items-center gap-4 p-5">
                      <SunMoon className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">{t('settings.theme')}</p>
                        <p className="text-sm text-muted-foreground">{activeThemeDetail}</p>
                      </div>
                      <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/50 p-1">
                        {themeOptions.map((option) => (
                          <Button
                            key={option.id}
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={themePending}
                            className={cn(
                              'rounded-md px-3 text-xs transition-colors',
                              option.id === themeMode
                                ? 'bg-background text-foreground shadow-sm hover:bg-background'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                            onClick={() => void handleThemeModeChange(option.id)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div className="items-start gap-4 p-5 md:flex">
                      <Keyboard className="h-5 w-5 text-muted-foreground" />
                      <div className="mt-4 flex-1 space-y-3 md:mt-0">
                        <p className="font-medium">{t('settings.shortcuts')}</p>
                        <p className="text-sm text-muted-foreground">{selectedShortcut.detail}</p>
                        <div className="flex flex-wrap gap-2">
                          {shortcutOptions.map((option) => (
                            <Button
                              key={option.id}
                              type="button"
                              variant={registeredHotkey === option.id ? 'secondary' : 'outline'}
                              disabled={hotkeyPending !== null}
                              onClick={() => void handleHotkeyChange(option.id)}
                            >
                              {hotkeyPending === option.id ? t('settings.saving') : option.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="items-start gap-4 p-5 md:flex">
                      <Mic2 className="h-5 w-5 text-muted-foreground" />
                      <div className="mt-4 flex-1 space-y-3 md:mt-0">
                        <p className="font-medium">{t('settings.microphone')}</p>
                        <p className="text-sm text-muted-foreground">{selectedMicrophoneLabel}</p>
                        <div className="flex flex-wrap gap-2">
                          {microphoneOptions.map((option) => {
                            const isSelected = selectedMicrophone.deviceId === option.deviceId
                            const optionKey = option.deviceId ?? '__default__'

                            return (
                              <Button
                                key={optionKey}
                                type="button"
                                variant={isSelected ? 'secondary' : 'outline'}
                                disabled={microphonePending !== null}
                                onClick={() =>
                                  void handleMicrophoneChange(option.deviceId, option.label)
                                }
                              >
                                {microphonePending === optionKey
                                  ? t('settings.saving')
                                  : option.deviceId === null
                                    ? t('settings.systemDefaultMic')
                                    : option.label}
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {section === 'providers' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold">{t('settings.providersTitle')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.providersBody')}
                  </p>
                </div>

                <Card className="border-border/70 bg-card/70">
                  <CardContent className="space-y-5 p-5">
                    <div className="space-y-2">
                      <p className="font-medium">{t('settings.providerActive')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.providerActiveBody')}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {providerOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={cn(
                            'rounded-2xl border p-4 text-left transition-colors',
                            selectedProvider === option.id
                              ? 'border-foreground/30 bg-background text-foreground'
                              : 'border-border/70 bg-background/50 text-muted-foreground hover:border-border hover:text-foreground'
                          )}
                          disabled={providerPending !== null}
                          onClick={() => void handleProviderChange(option.id)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">{option.label}</p>
                            {selectedProvider === option.id ? (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                                {t('settings.providerActiveBadge')}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm">{option.detail}</p>
                          {providerPending === option.id ? (
                            <p className="mt-3 text-xs text-muted-foreground">
                              {t('settings.switching')}
                            </p>
                          ) : null}
                        </button>
                      ))}
                    </div>

                    <Separator />

                    <div className="space-y-1">
                      <p className="font-medium">{t('settings.dashscopeKey')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.localKeyStorage')}
                      </p>
                    </div>

                    <label className="space-y-2 text-sm font-medium">
                      <span>{t('settings.replaceSavedKey')}</span>
                      <Input
                        type="password"
                        value={dashscopeApiKeyDraft}
                        onChange={(event) => setDashscopeApiKeyDraft(event.target.value)}
                        placeholder={
                          dashscope.configured
                            ? t('settings.enterNewDashscopeKey')
                            : t('settings.enterDashscopeKey')
                        }
                      />
                    </label>

                    <div className="rounded-xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                      <p>
                        {t('sidebar.provider')}: {t('provider.dashscope')}
                      </p>
                      <p>
                        {t('settings.status')}:{' '}
                        {formatMaskedKeyLabel(dashscope.keyLabel, t, t('sidebar.noApiKey'))}
                      </p>
                      <p>
                        {t('settings.transcriptionModel')}: {dashscope.asrModel}
                      </p>
                      <div className="mt-3 space-y-2">
                        <label className="block text-sm font-medium text-foreground">
                          {t('settings.processingModel')}
                        </label>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          value={dashscope.llmModel}
                          disabled={providerModelPending !== null}
                          onChange={(event) =>
                            void handleProviderLlmModelChange('dashscope', event.target.value)
                          }
                        >
                          {dashscope.availableLlmModels.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          {providerModelPending === 'dashscope'
                            ? t('settings.processingModelSaving')
                            : t('settings.postProcessModelCurrent', { model: dashscope.llmModel })}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        disabled={!dashscopeApiKeyDraft.trim() || providerSavePending !== null}
                        onClick={() => void handleSaveDashscopeKey()}
                      >
                        {providerSavePending === 'dashscope'
                          ? t('common.saving')
                          : dashscope.configured
                            ? t('settings.updateKey')
                            : t('settings.saveKey')}
                      </Button>
                    </div>

                    <Separator />

                    <div className="space-y-1">
                      <p className="font-medium">{t('settings.openAiKey')}</p>
                      <p className="text-sm text-muted-foreground">{t('settings.openAiKeyBody')}</p>
                    </div>

                    <label className="space-y-2 text-sm font-medium">
                      <span>{t('settings.replaceSavedKey')}</span>
                      <Input
                        type="password"
                        value={openAiApiKeyDraft}
                        onChange={(event) => setOpenAiApiKeyDraft(event.target.value)}
                        placeholder={
                          openai.configured
                            ? t('settings.enterNewOpenAiKey')
                            : t('settings.enterOpenAiKey')
                        }
                      />
                    </label>

                    <div className="rounded-xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                      <p>
                        {t('sidebar.provider')}: {t('provider.openai')}
                      </p>
                      <p>
                        {t('settings.status')}:{' '}
                        {formatMaskedKeyLabel(openai.keyLabel, t, t('sidebar.noApiKey'))}
                      </p>
                      <p>
                        {t('settings.transcriptionModel')}: {openai.asrModel}
                      </p>
                      <div className="mt-3 space-y-2">
                        <label className="block text-sm font-medium text-foreground">
                          {t('settings.processingModel')}
                        </label>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          value={openai.llmModel}
                          disabled={providerModelPending !== null}
                          onChange={(event) =>
                            void handleProviderLlmModelChange('openai', event.target.value)
                          }
                        >
                          {openai.availableLlmModels.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          {providerModelPending === 'openai'
                            ? t('settings.processingModelSaving')
                            : t('settings.postProcessModelCurrent', { model: openai.llmModel })}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        disabled={!openAiApiKeyDraft.trim() || providerSavePending !== null}
                        onClick={() => void handleSaveOpenAiKey()}
                      >
                        {providerSavePending === 'openai'
                          ? t('common.saving')
                          : openai.configured
                            ? t('settings.updateKey')
                            : t('settings.saveKey')}
                      </Button>
                      {selectedProvider === 'dashscope' && dashscope.configured ? (
                        <span className="text-sm text-muted-foreground">
                          {t('settings.readyForVoiceTyping')}
                        </span>
                      ) : null}
                      {selectedProvider === 'openai' && openai.configured ? (
                        <span className="text-sm text-muted-foreground">
                          {t('settings.openAiReady')}
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void onOpenOnboarding()}
                      >
                        {t('settings.openSetupGuide')}
                      </Button>
                    </div>

                    {providerSaveError ? (
                      <p className="text-sm text-destructive">{providerSaveError}</p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {section === 'permissions' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold">{t('settings.permissionsTitle')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.permissionsBody')}
                  </p>
                </div>

                <Card className="border-border/70 bg-card/70">
                  <CardContent className="space-y-5 p-5">
                    {[permissions.accessibility, permissions.microphone].map(
                      (permission, index) => (
                        <div key={permission.kind} className="space-y-5">
                          <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-background/60 p-5 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'inline-flex h-2.5 w-2.5 rounded-full',
                                    permission.granted ? 'bg-emerald-400' : 'bg-amber-400'
                                  )}
                                  aria-hidden="true"
                                />
                                <p className="font-medium">
                                  {permission.kind === 'accessibility'
                                    ? t('settings.permission.accessibility')
                                    : t('settings.permission.microphone')}
                                </p>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {t(`settings.permissionStatus.${permission.status}`)}
                                </span>
                              </div>
                              <p className="text-sm font-medium">{permission.label}</p>
                              <p className="text-sm text-muted-foreground">
                                {permission.description}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('settings.macosPath', {
                                  section:
                                    permission.kind === 'accessibility'
                                      ? t('settings.permission.accessibility')
                                      : t('settings.permission.microphone')
                                })}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant={permission.granted ? 'outline' : 'default'}
                              disabled={permissionActionPending !== null}
                              onClick={() => void handleOpenPermissionSettings(permission.kind)}
                            >
                              {permissionActionPending === permission.kind
                                ? t('settings.opening')
                                : permission.ctaLabel}
                            </Button>
                          </div>

                          {index === 0 ? <Separator /> : null}
                        </div>
                      )
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/70">
                  <CardContent className="space-y-4 p-5">
                    <div className="space-y-1">
                      <p className="font-medium">{t('settings.permissionStatus')}</p>
                      <p className="text-sm text-muted-foreground">
                        {permissions.hasMissing
                          ? t('settings.permissionSummaryBlocked')
                          : t('settings.permissionSummaryReady')}
                      </p>
                    </div>
                    <Switch
                      checked={!permissions.hasMissing}
                      disabled
                      aria-label={t('settings.permissionSummaryAria')}
                    />
                  </CardContent>
                </Card>

                {showDevOnboardingTools ? (
                  <Card className="border-border/70 bg-card/70">
                    <CardContent className="space-y-4 p-5">
                      <div className="space-y-1">
                        <p className="font-medium">{t('settings.onboardingTools')}</p>
                        <p className="text-sm text-muted-foreground">
                          {t('settings.onboardingToolsBody')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={onboardingResetPending}
                        onClick={() => void handleResetOnboarding()}
                      >
                        {onboardingResetPending
                          ? t('settings.resetting')
                          : t('settings.resetOnboarding')}
                      </Button>
                      {onboardingResetError ? (
                        <p className="text-sm text-destructive">{onboardingResetError}</p>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ) : null}

            {section === 'about' ? (
              <AboutSettingsSection
                appInfo={appInfo}
                autoUpdate={autoUpdate}
                onCheckForUpdates={onCheckForUpdates}
                onRestartToUpdate={onRestartToUpdate}
              />
            ) : null}

            {section === 'language' ? (
              <LanguageSettingsSection
                languagePreference={languagePreference}
                resolvedLanguage={resolvedLanguage}
                pending={languagePending !== null}
                onLanguageChange={handleLanguageChange}
              />
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
