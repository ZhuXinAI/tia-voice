import { useState } from 'react'
import { Keyboard, Languages, Mic2, Monitor, Settings2, SunMoon, Volume2 } from 'lucide-react'

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

import type { DashscopeSetupState, SettingsSection } from './types'
import type { ThemeMode } from '../../../../preload/index'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  dashscope: DashscopeSetupState
  themeMode: ThemeMode
  onThemeModeChange: (themeMode: ThemeMode) => Promise<void>
  onSaveDashscopeApiKey: (apiKey: string) => Promise<void>
  onOpenOnboarding: () => Promise<void>
  onResetOnboarding: () => Promise<void>
}

const shortcutOptions = [
  'Hold fn and speak',
  'Press and hold right Option',
  'Double tap right Option'
]
const microphoneOptions = ['Built-in mic (recommended)', 'External USB microphone', 'AirPods Pro']
const languageOptions = [
  'English · Chinese - Simplified (简体中文)',
  'English only',
  'Chinese - Simplified only'
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
    id: 'system',
    label: 'System',
    icon: Monitor
  }
]

export function SettingsDialog(props: SettingsDialogProps): React.JSX.Element {
  const {
    open,
    onOpenChange,
    section,
    onSectionChange,
    dashscope,
    themeMode,
    onThemeModeChange,
    onSaveDashscopeApiKey,
    onOpenOnboarding,
    onResetOnboarding
  } = props

  const [shortcutsIndex, setShortcutsIndex] = useState(0)
  const [micIndex, setMicIndex] = useState(0)
  const [languageIndex, setLanguageIndex] = useState(0)
  const [beepEnabled, setBeepEnabled] = useState(true)
  const [showInDock, setShowInDock] = useState(true)
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [themePending, setThemePending] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [providerSavePending, setProviderSavePending] = useState(false)
  const [providerSaveError, setProviderSaveError] = useState<string | null>(null)
  const [onboardingResetPending, setOnboardingResetPending] = useState(false)
  const [onboardingResetError, setOnboardingResetError] = useState<string | null>(null)
  const showDevOnboardingTools = import.meta.env.DEV

  const activeThemeDetail =
    themeOptions.find((option) => option.id === themeMode)?.detail ?? themeOptions[0].detail

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

  const handleSaveDashscopeKey = async (): Promise<void> => {
    if (!apiKeyDraft.trim() || providerSavePending) {
      return
    }

    setProviderSavePending(true)
    setProviderSaveError(null)

    try {
      await onSaveDashscopeApiKey(apiKeyDraft)
      setApiKeyDraft('')
    } catch (error) {
      setProviderSaveError(
        error instanceof Error ? error.message : 'Unable to save your DashScope API key right now.'
      )
    } finally {
      setProviderSavePending(false)
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

                    <div className="flex items-center gap-4 p-5">
                      <Keyboard className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">Shortcuts</p>
                        <p className="text-sm text-muted-foreground">
                          {shortcutOptions[shortcutsIndex]}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() =>
                          setShortcutsIndex((index) => (index + 1) % shortcutOptions.length)
                        }
                      >
                        Change
                      </Button>
                    </div>

                    <Separator />

                    <div className="flex items-center gap-4 p-5">
                      <Mic2 className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">Microphone</p>
                        <p className="text-sm text-muted-foreground">
                          {microphoneOptions[micIndex]}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() =>
                          setMicIndex((index) => (index + 1) % microphoneOptions.length)
                        }
                      >
                        Change
                      </Button>
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
                    TIA Voice currently supports DashScope only. OpenAI support will land later.
                  </p>
                </div>

                <Card className="border-border/70 bg-card/70">
                  <CardContent className="space-y-5 p-5">
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
                        value={apiKeyDraft}
                        onChange={(event) => setApiKeyDraft(event.target.value)}
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
                        disabled={!apiKeyDraft.trim() || providerSavePending}
                        onClick={() => void handleSaveDashscopeKey()}
                      >
                        {providerSavePending
                          ? 'Saving…'
                          : dashscope.configured
                            ? 'Update key'
                            : 'Save key'}
                      </Button>
                      {dashscope.configured ? (
                        <span className="text-sm text-muted-foreground">
                          Ready for voice typing
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

            {section === 'system' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold">System</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Runtime behavior and operating system integration.
                  </p>
                </div>

                <Card className="border-border/70 bg-card/70">
                  <CardContent className="space-y-5 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">Beep sound</p>
                        <p className="text-sm text-muted-foreground">
                          Play an audible cue when dictation starts.
                        </p>
                      </div>
                      <Switch checked={beepEnabled} onCheckedChange={setBeepEnabled} />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">Show app in dock</p>
                        <p className="text-sm text-muted-foreground">
                          Keep the main app visible in the system dock.
                        </p>
                      </div>
                      <Switch checked={showInDock} onCheckedChange={setShowInDock} />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">Launch app at login</p>
                        <p className="text-sm text-muted-foreground">
                          Start TIA Voice automatically after sign-in.
                        </p>
                      </div>
                      <Switch checked={launchAtLogin} onCheckedChange={setLaunchAtLogin} />
                    </div>
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

                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Volume2 className="h-3.5 w-3.5" />
                  System settings are currently local UI state and will be wired to persistent
                  preferences next.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
