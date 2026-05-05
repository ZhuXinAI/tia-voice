import { useEffect, useMemo, useState } from 'react'
import { Captions, LoaderCircle, X } from 'lucide-react'

import {
  DEFAULT_LIVE_CAPTION_PREFERENCES,
  type LiveCaptionLine,
  type LiveCaptionState
} from '../../../shared/liveCaption'
import { useSystemAudioCapture } from '../audio/useSystemAudioCapture'
import {
  getLiveCaptionState,
  reportLiveCaptionCaptureFailure,
  sendLiveCaptionPcmChunk,
  stopLiveCaption,
  subscribeToLiveCaptionCommand,
  subscribeToLiveCaptionState
} from '../lib/ipc'

const DEFAULT_STATE: LiveCaptionState = {
  status: 'idle',
  source: null,
  preferences: DEFAULT_LIVE_CAPTION_PREFERENCES,
  lines: [],
  error: null
}

function getPrimaryText(line: LiveCaptionLine, state: LiveCaptionState): string {
  if (state.preferences.targetLanguage && line.translatedText) {
    return line.translatedText
  }

  return line.sourceText
}

function getSecondaryText(line: LiveCaptionLine, state: LiveCaptionState): string | null {
  if (
    !state.preferences.targetLanguage ||
    !state.preferences.showOriginalWhenTranslating ||
    !line.translatedText ||
    !line.sourceText
  ) {
    return null
  }

  return line.sourceText
}

export default function LiveCaptionOverlayWindow(): React.JSX.Element {
  const [state, setState] = useState<LiveCaptionState>(DEFAULT_STATE)
  const captureDependencies = useMemo(
    () => ({
      onPcmChunk: sendLiveCaptionPcmChunk,
      onFailure: reportLiveCaptionCaptureFailure
    }),
    []
  )
  const capture = useSystemAudioCapture(captureDependencies)
  const { start, status, stop } = capture

  useEffect(() => {
    let mounted = true

    void getLiveCaptionState().then((nextState) => {
      if (mounted) {
        setState(nextState)
      }
    })

    const unsubscribeCommand = subscribeToLiveCaptionCommand((command) => {
      if (command.type === 'state') {
        setState(command.state)
        return
      }

      if (command.type === 'start-capture') {
        void start()
        return
      }

      stop()
    })
    const unsubscribeState = subscribeToLiveCaptionState(setState)

    return () => {
      mounted = false
      stop()
      unsubscribeCommand()
      unsubscribeState()
    }
  }, [start, stop])

  const lines = useMemo(() => state.lines.slice(-3).reverse(), [state.lines])
  const isStarting = state.status === 'starting' || status === 'starting'
  const isLive = state.status === 'listening'

  const handleClose = async (): Promise<void> => {
    stop()
    await stopLiveCaption('overlay-close')
  }

  return (
    <div className="window live-caption-overlay-window" data-testid="live-caption-overlay-window">
      <section className="live-caption-overlay-shell">
        <header className="live-caption-overlay-header">
          <div className="live-caption-overlay-status">
            <span className={isLive ? 'live-caption-dot is-live' : 'live-caption-dot'} />
            <Captions aria-hidden="true" />
            <span>{state.source === 'meeting' ? 'Others' : 'Live Caption'}</span>
          </div>
          <button
            aria-label="Close Live Caption"
            className="live-caption-icon-button live-caption-no-drag"
            type="button"
            onClick={() => void handleClose()}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="live-caption-lines">
          {state.error ? <p className="live-caption-error">{state.error}</p> : null}
          {!state.error && lines.length === 0 ? (
            <p className="live-caption-placeholder">
              {isStarting ? (
                <LoaderCircle aria-hidden="true" />
              ) : (
                <span className="live-caption-placeholder-dot" />
              )}
              <span>{isStarting ? 'Starting...' : 'Listening...'}</span>
            </p>
          ) : null}
          {!state.error
            ? lines.map((line) => {
                const secondaryText = getSecondaryText(line, state)
                return (
                  <article
                    className={line.final ? 'live-caption-line is-final' : 'live-caption-line'}
                    key={line.id}
                  >
                    <p>{getPrimaryText(line, state)}</p>
                    {secondaryText ? <small>{secondaryText}</small> : null}
                  </article>
                )
              })
            : null}
        </div>
      </section>
    </div>
  )
}
