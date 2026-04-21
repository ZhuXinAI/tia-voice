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
import { requestMicrophonePermission } from '@renderer/lib/microphoneAccess'
import { useI18n } from '@renderer/i18n'
import type { TriggerKey } from '../../../../preload/index'

import type { MainAppState } from '../main-app/types'

type OnboardingFlowProps = {
  initialDashscopeConfigured: boolean
  initialDashscopeKeyLabel: string | null
  hotkeyHint: string
  initialPermissions: MainAppState['permissions']
  registeredHotkey: TriggerKey | null
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
  const { t } = useI18n()
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

  const handleRequestMicrophonePermission = async (): Promise<void> => {
    setPermissionError(null)

    try {
      const granted = await requestMicrophonePermission()
      if (!granted) {
        return
      }

      setMicrophoneGranted(true)
      setStep(4)
    } catch {
      setPermissionError(
        'We could not trigger the microphone prompt. Open System Settings and try again.'
      )
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
              {t('onboarding.gettingStarted')}
            </p>
            <p className="text-sm font-medium">
              {t('onboarding.step', { current: step, total: 5 })}
            </p>
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
              {isSkipping ? t('onboarding.skipping') : t('onboarding.skip')}
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
              <p className="text-base text-muted-foreground">{t('onboarding.heroBody')}</p>
            </div>
            <div className="space-y-3">
              <label className="space-y-2 text-sm font-medium">
                <span>{t('onboarding.dashscopeKey')}</span>
                <Input
                  autoFocus
                  type="password"
                  value={dashscopeApiKey}
                  onChange={(event) => setDashscopeApiKey(event.target.value)}
                  placeholder={t('onboarding.enterDashscopeKey')}
                />
              </label>
              <p className="text-sm text-muted-foreground">{t('onboarding.dashscopeKeyBody')}</p>
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
              {providerSavePending ? t('onboarding.saveKey') : t('onboarding.saveContinue')}
            </Button>
            {providerSaveError ? (
              <p className="text-sm text-destructive">{providerSaveError}</p>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t('onboarding.accessibilityTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('onboarding.accessibilityBody')}</p>
            <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
              <p>
                {accessibilityGranted
                  ? t('onboarding.accessibilityGranted')
                  : t('onboarding.waitingPermission')}
              </p>
              <p className="mt-2">
                macOS path: System Settings &gt; Privacy &amp; Security &gt; Accessibility
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void openPermissionSettings('accessibility')} type="button">
                {t('onboarding.openAccessibility')}
              </Button>
              <Button
                variant="outline"
                onClick={() => void checkAccessibilityPermission(true)}
                type="button"
              >
                {t('onboarding.recheckPermission')}
              </Button>
            </div>
            {permissionError ? <p className="text-sm text-destructive">{permissionError}</p> : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t('onboarding.microphoneTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('onboarding.microphoneBody')}</p>
            <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
              <p>
                {microphoneGranted
                  ? t('onboarding.microphoneGranted')
                  : t('onboarding.waitingPermission')}
              </p>
              <p className="mt-2">
                macOS path: System Settings &gt; Privacy &amp; Security &gt; Microphone
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void handleRequestMicrophonePermission()} type="button">
                {t('onboarding.requestMic')}
              </Button>
              <Button
                variant="outline"
                onClick={() => void checkMicrophonePermission(true)}
                type="button"
              >
                {t('onboarding.recheckPermission')}
              </Button>
            </div>
            {permissionError ? <p className="text-sm text-destructive">{permissionError}</p> : null}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t('onboarding.firstDictationTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('onboarding.firstDictationBody')}</p>
            <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
              <p>{hotkeyHint}</p>
              <p className="mt-2">
                {t('onboarding.currentShortcut')}{' '}
                <span className="font-medium text-foreground">
                  {registeredHotkeyLabel ?? t('onboarding.unavailable')}
                </span>
                . {t('onboarding.recordingBar')}
              </p>
            </div>
            <Textarea
              value={practiceDraft}
              onChange={(event) => setPracticeDraft(event.target.value)}
              rows={6}
              placeholder={t('onboarding.practicePlaceholder')}
            />
            <div className="flex justify-end">
              <Button onClick={() => setStep(5)} type="button">
                {t('common.nextStep')}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t('onboarding.editWithVoiceTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('onboarding.editWithVoiceBody')}</p>
            <Textarea
              value={rewriteDraft}
              onChange={(event) => setRewriteDraft(event.target.value)}
              rows={6}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="outline" onClick={() => setStep(4)} type="button">
                {t('common.previous')}
              </Button>
              <Button
                onClick={() => void handleFinish()}
                disabled={isFinishing || isSkipping}
                type="button"
              >
                {isFinishing ? t('common.saving') : t('common.allSet')}
              </Button>
            </div>
            {finishError ? <p className="text-sm text-destructive">{finishError}</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}
