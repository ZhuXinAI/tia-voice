import { useEffect, useState } from 'react'

import trayIconUrl from '@renderer/assets/tray.svg'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
  openPermissionSettings,
  saveDashscopeApiKey,
  startDictation,
  stopDictation
} from '@renderer/lib/ipc'

import type { MainAppState } from '../main-app/types'

type OnboardingFlowProps = {
  initialDashscopeConfigured: boolean
  initialDashscopeKeyLabel: string | null
  hotkeyHint: string
  initialPermissions: MainAppState['permissions']
  registeredHotkey: 'MetaRight' | 'AltRight' | null
  registeredHotkeyLabel: string | null
  mode?: 'page' | 'dialog'
  onComplete: () => Promise<void>
  onSkip?: () => Promise<void>
}

type OnboardingStep = 1 | 2 | 3 | 4 | 5

const STEP_5_STARTER_TEXT =
  'Hi Tony, can we do a meet somewhere around 9am, gonna discuss about the deployment'

function resolveInitialStep(input: {
  dashscopeConfigured: boolean
  permissions: MainAppState['permissions']
}): OnboardingStep {
  if (!input.dashscopeConfigured) {
    return 1
  }

  if (!input.permissions.accessibility.granted) {
    return 2
  }

  if (!input.permissions.microphone.granted) {
    return 3
  }

  return 4
}

export function OnboardingFlow(props: OnboardingFlowProps): React.JSX.Element {
  const {
    initialDashscopeConfigured,
    initialDashscopeKeyLabel,
    hotkeyHint,
    initialPermissions,
    registeredHotkey,
    registeredHotkeyLabel,
    mode = 'page',
    onComplete
  } = props
  const onSkip = props.onSkip ?? onComplete
  const [dashscopeConfigured, setDashscopeConfigured] = useState(initialDashscopeConfigured)
  const [dashscopeKeyLabel, setDashscopeKeyLabel] = useState(initialDashscopeKeyLabel)
  const [accessibilityGranted, setAccessibilityGranted] = useState(
    initialPermissions.accessibility.granted
  )
  const [microphoneGranted, setMicrophoneGranted] = useState(initialPermissions.microphone.granted)
  const [step, setStep] = useState<OnboardingStep>(
    resolveInitialStep({
      dashscopeConfigured: initialDashscopeConfigured,
      permissions: initialPermissions
    })
  )
  const [dashscopeApiKey, setDashscopeApiKey] = useState('')
  const [providerSavePending, setProviderSavePending] = useState(false)
  const [providerSaveError, setProviderSaveError] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [practiceDraft, setPracticeDraft] = useState('')
  const [rewriteDraft, setRewriteDraft] = useState(STEP_5_STARTER_TEXT)
  const [isFinishing, setIsFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [isSkipping, setIsSkipping] = useState(false)

  useEffect(() => {
    setAccessibilityGranted(initialPermissions.accessibility.granted)
    setMicrophoneGranted(initialPermissions.microphone.granted)
  }, [initialPermissions.accessibility.granted, initialPermissions.microphone.granted])

  useEffect(() => {
    if (!dashscopeConfigured || step !== 2) {
      return
    }

    let active = true
    setPermissionError(null)

    const checkPermission = async (prompt: boolean): Promise<void> => {
      try {
        const allowed = await checkAccessibilityPermission(prompt)
        if (!active || !allowed) {
          return
        }

        setAccessibilityGranted(true)
        setStep(3)
      } catch {
        if (!active) {
          return
        }

        setPermissionError(
          'We could not verify Accessibility yet. Keep this window open and try again.'
        )
      }
    }

    void checkPermission(true)
    const intervalId = window.setInterval(() => void checkPermission(false), 1300)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [dashscopeConfigured, step])

  useEffect(() => {
    if (!dashscopeConfigured || !accessibilityGranted || step !== 3) {
      return
    }

    let active = true
    setPermissionError(null)

    const checkPermission = async (prompt: boolean): Promise<void> => {
      try {
        const allowed = await checkMicrophonePermission(prompt)
        if (!active || !allowed) {
          return
        }

        setMicrophoneGranted(true)
        setStep(4)
      } catch {
        if (!active) {
          return
        }

        setPermissionError(
          'We could not verify microphone permission yet. Keep this window open and try again.'
        )
      }
    }

    void checkPermission(true)
    const intervalId = window.setInterval(() => void checkPermission(false), 1300)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [accessibilityGranted, dashscopeConfigured, step])

  useEffect(() => {
    const isDictationStep = step === 4 || step === 5
    if (!isDictationStep || !registeredHotkey) {
      return
    }

    let active = false

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== registeredHotkey || event.repeat || active) {
        return
      }

      active = true
      void startDictation('onboarding')
    }

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== registeredHotkey || !active) {
        return
      }

      active = false
      void stopDictation('onboarding')
    }

    const stopActiveCapture = (): void => {
      if (!active) {
        return
      }

      active = false
      void stopDictation('onboarding')
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', stopActiveCapture)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', stopActiveCapture)
      stopActiveCapture()
    }
  }, [registeredHotkey, step])

  const handleSaveDashscopeKey = async (): Promise<void> => {
    if (!dashscopeApiKey.trim() || providerSavePending) {
      return
    }

    setProviderSavePending(true)
    setProviderSaveError(null)

    try {
      const result = await saveDashscopeApiKey(dashscopeApiKey)
      setDashscopeConfigured(result.configured)
      setDashscopeKeyLabel(result.keyLabel)
      setDashscopeApiKey('')
      setStep(accessibilityGranted ? (microphoneGranted ? 4 : 3) : 2)
    } catch (error) {
      setProviderSaveError(
        error instanceof Error ? error.message : 'Unable to save your DashScope API key right now.'
      )
    } finally {
      setProviderSavePending(false)
    }
  }

  const handleFinish = async (): Promise<void> => {
    if (isFinishing) {
      return
    }

    setIsFinishing(true)
    setFinishError(null)

    try {
      await onComplete()
    } catch (error) {
      setFinishError(
        error instanceof Error ? error.message : 'Unable to save onboarding completion right now.'
      )
      setIsFinishing(false)
    }
  }

  const handleSkip = async (): Promise<void> => {
    if (isSkipping) {
      return
    }

    setIsSkipping(true)
    setFinishError(null)

    try {
      await onSkip()
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : 'Unable to close setup right now.')
      setIsSkipping(false)
    }
  }

  const outerClassName =
    mode === 'dialog' ? 'p-0' : 'flex min-h-svh items-center justify-center p-6'
  const sectionClassName =
    mode === 'dialog'
      ? 'w-full rounded-3xl border-0 bg-transparent p-8 shadow-none'
      : 'w-full max-w-2xl rounded-3xl border border-border/70 bg-card/80 p-8 shadow-xl backdrop-blur-sm'

  return (
    <div className={outerClassName}>
      <section className={sectionClassName}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Getting Started
            </p>
            <p className="text-sm font-medium">Step {step} of 5</p>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((item) => (
              <span
                key={item}
                className={`h-1.5 w-8 rounded-full ${item <= step ? 'bg-primary' : 'bg-border'}`}
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={isSkipping}
              onClick={() => void handleSkip()}
            >
              {isSkipping ? 'Skipping…' : 'Skip'}
            </Button>
          </div>
        </div>

        {step === 1 ? (
          <div className="space-y-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
              <img src={trayIconUrl} alt="TIA Voice tray icon" className="h-9 w-9" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">TIA Voice</h1>
              <p className="text-base text-muted-foreground">
                Open source voice typing for your desktop, powered by your own DashScope key.
              </p>
            </div>
            <div className="space-y-3">
              <label className="space-y-2 text-sm font-medium">
                <span>DashScope API key</span>
                <Input
                  autoFocus
                  type="password"
                  value={dashscopeApiKey}
                  onChange={(event) => setDashscopeApiKey(event.target.value)}
                  placeholder="Enter your DashScope API key"
                />
              </label>
              <p className="text-sm text-muted-foreground">
                We store your key locally on this device and use it directly for ASR and cleanup.
              </p>
              {dashscopeKeyLabel ? (
                <p className="text-sm text-muted-foreground">{dashscopeKeyLabel}</p>
              ) : null}
            </div>
            <Button
              className="min-w-36"
              disabled={!dashscopeApiKey.trim() || providerSavePending}
              onClick={() => void handleSaveDashscopeKey()}
              type="button"
            >
              {providerSavePending ? 'Saving key…' : 'Save and continue'}
            </Button>
            {providerSaveError ? (
              <p className="text-sm text-destructive">{providerSaveError}</p>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">
              Allow Accessibility Permission
            </h2>
            <p className="text-sm text-muted-foreground">
              TIA Voice needs Accessibility permission for global hotkey listening. We will keep
              checking while this window stays open.
            </p>
            <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
              <p>{accessibilityGranted ? 'Accessibility granted.' : 'Waiting for permission...'}</p>
              <p className="mt-2">
                macOS path: System Settings &gt; Privacy &amp; Security &gt; Accessibility
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void openPermissionSettings('accessibility')} type="button">
                Open Accessibility Settings
              </Button>
              <Button
                variant="outline"
                onClick={() => void checkAccessibilityPermission(true)}
                type="button"
              >
                Re-check permission
              </Button>
            </div>
            {permissionError ? <p className="text-sm text-destructive">{permissionError}</p> : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">Allow Microphone Permission</h2>
            <p className="text-sm text-muted-foreground">
              TIA Voice also needs microphone access before dictation can start.
            </p>
            <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
              <p>{microphoneGranted ? 'Microphone granted.' : 'Waiting for permission...'}</p>
              <p className="mt-2">
                macOS path: System Settings &gt; Privacy &amp; Security &gt; Microphone
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void openPermissionSettings('microphone')} type="button">
                Open Microphone Settings
              </Button>
              <Button
                variant="outline"
                onClick={() => void checkMicrophonePermission(true)}
                type="button"
              >
                Re-check permission
              </Button>
            </div>
            {permissionError ? <p className="text-sm text-destructive">{permissionError}</p> : null}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">Try Your First Dictation</h2>
            <p className="text-sm text-muted-foreground">
              Say something like “This is the first sentence I spoke using TIA Voice”.
            </p>
            <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
              <p>{hotkeyHint}</p>
              <p className="mt-2">
                Current dictation shortcut:{' '}
                <span className="font-medium text-foreground">
                  {registeredHotkeyLabel ?? 'Unavailable'}
                </span>
                . The recording bar will appear while you hold it down.
              </p>
            </div>
            <Textarea
              value={practiceDraft}
              onChange={(event) => setPracticeDraft(event.target.value)}
              rows={6}
              placeholder="This is the first sentence I spoke using TIA Voice"
            />
            <div className="flex justify-end">
              <Button onClick={() => setStep(5)} type="button">
                Next
              </Button>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">Edit Text with Voice</h2>
            <p className="text-sm text-muted-foreground">
              Select the text below and say “Update this part of text into a serious email.”
            </p>
            <Textarea
              value={rewriteDraft}
              onChange={(event) => setRewriteDraft(event.target.value)}
              rows={6}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="outline" onClick={() => setStep(4)} type="button">
                Previous
              </Button>
              <Button
                onClick={() => void handleFinish()}
                disabled={isFinishing || isSkipping}
                type="button"
              >
                {isFinishing ? 'Saving…' : 'All set'}
              </Button>
            </div>
            {finishError ? <p className="text-sm text-destructive">{finishError}</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}
