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

import { AboutSettingsSection } from './AboutSettingsSection'
import type { DashscopeSetupState, MainAppState, SettingsSection } from './types'
import type { ProviderKind, ThemeMode, TriggerKey } from '../../../../preload/index'

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
  themeMode: ThemeMode
  onThemeModeChange: (themeMode: ThemeMode) => Promise<void>
  onHotkeyChange: (hotkey: TriggerKey) => Promise<void>
  onMicrophoneChange: (input: { deviceId: string | null; label: string | null }) => Promise<void>
  onProviderChange: (provider: ProviderKind) => Promise<void>
  onSaveDashscopeApiKey: (apiKey: string) => Promise<void>
  onSaveOpenAiApiKey: (apiKey: string) => Promise<void>
  onOpenPermissionSettings: (permission: 'accessibility' | 'microphone') => Promise<void>
  onCheckForUpdates: () => Promise<void>
  onRestartToUpdate: () => Promise<void>
  onOpenOnboarding: () => Promise<void>
  onResetOnboarding: () => Promise<void>
}

const shortcutOptions: Array<{
  id: TriggerKey
  label: string
  detail: string
}> = [
  {
    id: 'MetaRight',
    label: 'Right Command',
    detail: 'Default on macOS for push-to-talk.'
  },
  {
    id: 'AltRight',
    label: 'Right Option',
    detail: 'Alternative shortcut if Command conflicts with your setup.'
  }
]
const languageOptions = [
  'English · Chinese - Simplified (简体中文)',
  'English only',
  'Chinese - Simplified only'
]
const providerOptions: Array<{
  id: ProviderKind
  label: string
  detail: string
}> = [
  {
    id: 'dashscope',
    label: 'DashScope',
    detail: 'Current production provider.'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    detail: 'Beta provider powered through the AI SDK.'
  }
]
const themeOptions: Array<{
  id: ThemeMode
  label: string
  detail: string
}> = [
  {
    id: 'system',
    label: 'System',
    detail: 'Follow your operating system appearance.'
  },
  {
    id: 'dark',
    label: 'Dark',
    detail: 'Use dark appearance for lower-light environments.'
  },
  {
    id: 'light',
    label: 'Light',
    detail: 'Use light appearance for bright environments.'
  }
]

const settingsMenu: Array<{
  id: SettingsSection
  label: string
  icon: typeof Settings2
}> = [
  {
    id: 'general',
    label: 'General',
    icon: Settings2
  },
  {
    id: 'providers',
    label: 'Providers',
    icon: Mic2
  },
  {
    id: 'permissions',
    label: 'Permissions',
    icon: ShieldAlert
  },
  {
    id: 'about',
    label: 'About',
    icon: Info
  }
]

export function SettingsDialog(props: SettingsDialogProps): React.JSX.Element {
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
    themeMode,
    onThemeModeChange,
    onHotkeyChange,
    onMicrophoneChange,
    onProviderChange,
    onSaveDashscopeApiKey,
    onSaveOpenAiApiKey,
    onOpenPermissionSettings,
    onCheckForUpdates,
    onRestartToUpdate,
    onOpenOnboarding,
    onResetOnboarding
  } = props

  const [languageIndex, setLanguageIndex] = useState(0)
  const [themePending, setThemePending] = useState(false)
  const [hotkeyPending, setHotkeyPending] = useState<TriggerKey | null>(null)
  const [microphonePending, setMicrophonePending] = useState<string | null>(null)
  const [providerPending, setProviderPending] = useState<ProviderKind | null>(null)
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
  const selectedMicrophoneLabel = selectedMicrophone.label ?? 'System default microphone'

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
        error instanceof Error ? error.message : 'Unable to save your DashScope API key right now.'
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
        error instanceof Error ? error.message : 'Unable to save your OpenAI API key right now.'
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
        error instanceof Error ? error.message : 'Unable to reset onboarding cache right now.'
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
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure general and system preferences.</DialogDescription>
        </DialogHeader>

        <div className="grid h-[78vh] grid-cols-[220px_1fr] overflow-hidden max-md:grid-cols-1">
          <aside className="border-r border-border/60 bg-muted/30 p-4 max-md:border-b max-md:border-r-0">
            <p className="px-2 pb-4 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Settings
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
                  {item.label}
                </Button>
              ))}
            </div>
          </aside>

          <section className="overflow-y-auto p-8">
            {section === 'general' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold">General</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Shortcut, input device, and language behavior for dictation.
                  </p>
                </div>

                <Card className="border-border/70 bg-card/70">
                  <CardContent className="p-0">
                    <div className="flex items-center gap-4 p-5">
                      <SunMoon className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">Theme</p>
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
                        <p className="font-medium">Shortcuts</p>
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
                              {hotkeyPending === option.id ? 'Saving…' : option.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="items-start gap-4 p-5 md:flex">
                      <Mic2 className="h-5 w-5 text-muted-foreground" />
                      <div className="mt-4 flex-1 space-y-3 md:mt-0">
                        <p className="font-medium">Microphone</p>
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
                                {microphonePending === optionKey ? 'Saving…' : option.label}
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex items-center gap-4 p-5">
                      <Languages className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">Languages</p>
                        <p className="text-sm text-muted-foreground">
                          {languageOptions[languageIndex]}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() =>
                          setLanguageIndex((index) => (index + 1) % languageOptions.length)
                        }
                      >
                        Change
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {section === 'providers' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold">Providers</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose the voice stack you want TIA Voice to use, then save the matching API key
                    locally on this device.
                  </p>
                </div>

                <Card className="border-border/70 bg-card/70">
                  <CardContent className="space-y-5 p-5">
                    <div className="space-y-2">
                      <p className="font-medium">Active provider</p>
                      <p className="text-sm text-muted-foreground">
                        Switching providers updates both transcription and PostProcess models.
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
                                Active
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm">{option.detail}</p>
                          {providerPending === option.id ? (
                            <p className="mt-3 text-xs text-muted-foreground">Switching…</p>
                          ) : null}
                        </button>
                      ))}
                    </div>

                    <Separator />

                    <div className="space-y-1">
                      <p className="font-medium">DashScope API key</p>
                      <p className="text-sm text-muted-foreground">
                        Your key is stored locally on this device and used directly by the desktop
                        app.
                      </p>
                    </div>

                    <label className="space-y-2 text-sm font-medium">
                      <span>Replace saved key</span>
                      <Input
                        type="password"
                        value={dashscopeApiKeyDraft}
                        onChange={(event) => setDashscopeApiKeyDraft(event.target.value)}
                        placeholder={
                          dashscope.configured
                            ? 'Enter a new DashScope API key'
                            : 'Enter your DashScope API key'
                        }
                      />
                    </label>

                    <div className="rounded-xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                      <p>Provider: DashScope</p>
                      <p>Status: {dashscope.keyLabel ?? 'No key saved yet'}</p>
                      <p>Models: qwen3-asr-flash + qwen-plus</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        disabled={!dashscopeApiKeyDraft.trim() || providerSavePending !== null}
                        onClick={() => void handleSaveDashscopeKey()}
                      >
                        {providerSavePending === 'dashscope'
                          ? 'Saving…'
                          : dashscope.configured
                            ? 'Update key'
                            : 'Save key'}
                      </Button>
                    </div>

                    <Separator />

                    <div className="space-y-1">
                      <p className="font-medium">OpenAI API key</p>
                      <p className="text-sm text-muted-foreground">
                        OpenAI uses the AI SDK integration for `gpt-4o-mini-transcribe` and
                        `gpt-5-mini`.
                      </p>
                    </div>

                    <label className="space-y-2 text-sm font-medium">
                      <span>Replace saved key</span>
                      <Input
                        type="password"
                        value={openAiApiKeyDraft}
                        onChange={(event) => setOpenAiApiKeyDraft(event.target.value)}
                        placeholder={
                          openai.configured
                            ? 'Enter a new OpenAI API key'
                            : 'Enter your OpenAI API key'
                        }
                      />
                    </label>

                    <div className="rounded-xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                      <p>Provider: OpenAI</p>
                      <p>Status: {openai.keyLabel ?? 'No key saved yet'}</p>
                      <p>Models: gpt-4o-mini-transcribe + gpt-5-mini</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        disabled={!openAiApiKeyDraft.trim() || providerSavePending !== null}
                        onClick={() => void handleSaveOpenAiKey()}
                      >
                        {providerSavePending === 'openai'
                          ? 'Saving…'
                          : openai.configured
                            ? 'Update key'
                            : 'Save key'}
                      </Button>
                      {selectedProvider === 'dashscope' && dashscope.configured ? (
                        <span className="text-sm text-muted-foreground">
                          Ready for voice typing
                        </span>
                      ) : null}
                      {selectedProvider === 'openai' && openai.configured ? (
                        <span className="text-sm text-muted-foreground">
                          OpenAI beta is ready for voice typing
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void onOpenOnboarding()}
                      >
                        Open setup guide
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
                  <h2 className="text-3xl font-semibold">Permissions</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    TIA Voice re-checks these whenever the app window becomes active so missing
                    macOS permissions stay visible.
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
                                    ? 'Accessibility'
                                    : 'Microphone'}
                                </p>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {permission.status}
                                </span>
                              </div>
                              <p className="text-sm font-medium">{permission.label}</p>
                              <p className="text-sm text-muted-foreground">
                                {permission.description}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                macOS path: System Settings &gt; Privacy &amp; Security &gt;{' '}
                                {permission.kind === 'accessibility'
                                  ? 'Accessibility'
                                  : 'Microphone'}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant={permission.granted ? 'outline' : 'default'}
                              disabled={permissionActionPending !== null}
                              onClick={() => void handleOpenPermissionSettings(permission.kind)}
                            >
                              {permissionActionPending === permission.kind
                                ? 'Opening…'
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
                      <p className="font-medium">Permission status</p>
                      <p className="text-sm text-muted-foreground">
                        {permissions.hasMissing
                          ? 'TIA Voice is still blocked from full voice typing until both permissions are enabled.'
                          : 'All required permissions are enabled for voice typing.'}
                      </p>
                    </div>
                    <Switch
                      checked={!permissions.hasMissing}
                      disabled
                      aria-label="Permission summary"
                    />
                  </CardContent>
                </Card>

                {showDevOnboardingTools ? (
                  <Card className="border-border/70 bg-card/70">
                    <CardContent className="space-y-4 p-5">
                      <div className="space-y-1">
                        <p className="font-medium">Onboarding test tools</p>
                        <p className="text-sm text-muted-foreground">
                          Clear onboarding completion so the app starts at setup again next time.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={onboardingResetPending}
                        onClick={() => void handleResetOnboarding()}
                      >
                        {onboardingResetPending ? 'Resetting…' : 'Reset onboarding cache'}
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
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
