import { useEffect, useMemo, useState } from 'react'
import { Languages, MonitorSpeaker, X } from 'lucide-react'

import {
  DEFAULT_LIVE_CAPTION_PREFERENCES,
  LIVE_CAPTION_SOURCE_LANGUAGES,
  LIVE_CAPTION_TARGET_LANGUAGES,
  type LiveCaptionPreferences,
  type LiveCaptionSourceLanguage,
  type LiveCaptionState,
  type LiveCaptionTargetLanguage
} from '../../../shared/liveCaption'
import {
  getLiveCaptionPreferences,
  getLiveCaptionState,
  getMainAppState,
  setLiveCaptionPreferences,
  startLiveCaption,
  subscribeToLiveCaptionCommand,
  subscribeToLiveCaptionState
} from '../lib/ipc'

const LANGUAGE_LABELS: Record<LiveCaptionSourceLanguage | LiveCaptionTargetLanguage, string> = {
  auto: 'Auto detect',
  zh: 'Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  yue: 'Cantonese',
  de: 'German',
  fr: 'French',
  ru: 'Russian',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  id: 'Indonesian',
  ar: 'Arabic',
  th: 'Thai',
  hi: 'Hindi',
  da: 'Danish',
  ur: 'Urdu',
  tr: 'Turkish',
  nl: 'Dutch',
  ms: 'Malay',
  vi: 'Vietnamese'
}

function closeWindow(): void {
  window.close()
}

export default function LiveCaptionConfigWindow(): React.JSX.Element {
  const [preferences, setPreferences] = useState<LiveCaptionPreferences>(
    DEFAULT_LIVE_CAPTION_PREFERENCES
  )
  const [state, setState] = useState<LiveCaptionState | null>(null)
  const [dashscopeConfigured, setDashscopeConfigured] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    void getLiveCaptionPreferences().then((nextPreferences) => {
      if (mounted) {
        setPreferences(nextPreferences)
      }
    })
    void getLiveCaptionState().then((nextState) => {
      if (mounted) {
        setState(nextState)
        setError(nextState.error)
      }
    })
    void getMainAppState().then((appState) => {
      if (mounted) {
        setDashscopeConfigured(appState.dashscope.configured)
      }
    })

    const unsubscribeCommand = subscribeToLiveCaptionCommand((command) => {
      if (command.type === 'state') {
        setState(command.state)
        setError(command.state.error)
      }
    })
    const unsubscribeState = subscribeToLiveCaptionState((nextState) => {
      setState(nextState)
      setError(nextState.error)
    })

    return () => {
      mounted = false
      unsubscribeCommand()
      unsubscribeState()
    }
  }, [])

  const targetLanguage = preferences.targetLanguage ?? 'none'
  const canStart = !pending && state?.status !== 'starting' && state?.status !== 'listening'

  const sourceOptions = useMemo(() => [...LIVE_CAPTION_SOURCE_LANGUAGES], [])
  const targetOptions = useMemo(() => [...LIVE_CAPTION_TARGET_LANGUAGES], [])

  const handleStart = async (): Promise<void> => {
    if (!canStart) {
      return
    }

    setPending(true)
    setError(null)
    try {
      await setLiveCaptionPreferences(preferences)
      const started = await startLiveCaption(preferences)
      if (!started) {
        const nextState = await getLiveCaptionState()
        setState(nextState)
        setError(nextState.error)
      }
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Unable to start Live Caption.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="window live-caption-config-window" data-testid="live-caption-config-window">
      <section className="live-caption-config-shell">
        <header className="live-caption-config-header">
          <div className="live-caption-config-title">
            <span className="live-caption-config-icon">
              <MonitorSpeaker aria-hidden="true" />
            </span>
            <div>
              <h1>Live Caption</h1>
              <p>Ctrl+L</p>
            </div>
          </div>
          <button
            aria-label="Close"
            className="live-caption-icon-button"
            type="button"
            onClick={closeWindow}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="live-caption-config-fields">
          <label className="live-caption-field">
            <span>Source language</span>
            <select
              value={preferences.sourceLanguage}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  sourceLanguage: event.target.value as LiveCaptionSourceLanguage
                }))
              }
            >
              {sourceOptions.map((language) => (
                <option key={language} value={language}>
                  {LANGUAGE_LABELS[language]}
                </option>
              ))}
            </select>
          </label>

          <label className="live-caption-field">
            <span>Translate to</span>
            <select
              value={targetLanguage}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  targetLanguage:
                    event.target.value === 'none'
                      ? null
                      : (event.target.value as LiveCaptionTargetLanguage)
                }))
              }
            >
              <option value="none">Off</option>
              {targetOptions.map((language) => (
                <option key={language} value={language}>
                  {LANGUAGE_LABELS[language]}
                </option>
              ))}
            </select>
          </label>

          {preferences.targetLanguage ? (
            <label className="live-caption-check-row">
              <input
                checked={preferences.showOriginalWhenTranslating}
                type="checkbox"
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    showOriginalWhenTranslating: event.target.checked
                  }))
                }
              />
              <span>Show original below translation</span>
            </label>
          ) : null}
        </div>

        {!dashscopeConfigured ? (
          <p className="live-caption-config-error">Add a DashScope key in Settings first.</p>
        ) : null}
        {error ? <p className="live-caption-config-error">{error}</p> : null}

        <button
          className="live-caption-start-button"
          disabled={!canStart}
          type="button"
          onClick={() => void handleStart()}
        >
          <Languages aria-hidden="true" />
          <span>{pending ? 'Starting...' : 'Start'}</span>
        </button>
      </section>
    </div>
  )
}
