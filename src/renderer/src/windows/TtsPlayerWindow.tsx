import { Pause, Play, Square, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { Transcription, TranscriptionSegment } from '../components/tts/Transcription'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import { getTtsState, stopTextToSpeech, subscribeToTtsState } from '../lib/ipc'
import type { TtsStatePayload } from '../../../preload/index'
import type { TtsTranscriptSegment } from '../../../shared/tts'

type AppRegionStyle = CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag'
}

const DRAG_STYLE: AppRegionStyle = { WebkitAppRegion: 'drag' }
const NO_DRAG_STYLE: AppRegionStyle = { WebkitAppRegion: 'no-drag' }

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00'
  }

  const roundedSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(roundedSeconds / 60)
  const remainingSeconds = roundedSeconds % 60
  return [minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function estimateSegments(
  sourceSegments: TtsTranscriptSegment[],
  text: string,
  duration: number
): TtsTranscriptSegment[] {
  if (sourceSegments.some((segment) => segment.endSecond > segment.startSecond)) {
    return sourceSegments
  }

  const tokens = text.match(/\s+|[^\s]+/g) ?? []
  const timedTokens = tokens.filter((token) => token.trim().length > 0)
  const slice = duration > 0 && timedTokens.length > 0 ? duration / timedTokens.length : 0
  let cursor = 0

  return tokens.map((token) => {
    if (token.trim().length === 0) {
      return {
        text: token,
        startSecond: cursor,
        endSecond: cursor
      }
    }

    const segment = {
      text: token,
      startSecond: cursor,
      endSecond: cursor + slice
    }
    cursor += slice
    return segment
  })
}

export default function TtsPlayerWindow(): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const [state, setState] = useState<TtsStatePayload>({
    status: 'idle',
    sessionId: null,
    source: null,
    text: '',
    audioUrl: null,
    audioExpiresAt: null,
    segments: [],
    voice: null,
    model: null,
    createdAt: null,
    error: null
  })
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  useEffect(() => {
    const applyState = (nextState: TtsStatePayload): void => {
      setState(nextState)

      if (nextState.sessionId !== sessionIdRef.current) {
        sessionIdRef.current = nextState.sessionId
        setCurrentTime(0)
        setDuration(0)
        setIsPlaying(false)
        setPlaybackError(null)
      }
    }

    void getTtsState().then(applyState)
    return subscribeToTtsState(applyState)
  }, [])

  useEffect(() => {
    const element = audioRef.current
    if (!element) {
      return
    }

    const syncCurrentTime = (): void => setCurrentTime(element.currentTime || 0)
    const syncDuration = (): void => {
      setDuration(Number.isFinite(element.duration) ? element.duration : 0)
    }
    const handlePlay = (): void => setIsPlaying(true)
    const handlePause = (): void => setIsPlaying(false)
    const handleError = (): void => {
      setIsPlaying(false)
      setPlaybackError('Speech audio could not be loaded. The generated URL may be expired.')
    }

    element.addEventListener('timeupdate', syncCurrentTime)
    element.addEventListener('loadedmetadata', syncDuration)
    element.addEventListener('durationchange', syncDuration)
    element.addEventListener('play', handlePlay)
    element.addEventListener('pause', handlePause)
    element.addEventListener('ended', handlePause)
    element.addEventListener('error', handleError)

    return () => {
      element.removeEventListener('timeupdate', syncCurrentTime)
      element.removeEventListener('loadedmetadata', syncDuration)
      element.removeEventListener('durationchange', syncDuration)
      element.removeEventListener('play', handlePlay)
      element.removeEventListener('pause', handlePause)
      element.removeEventListener('ended', handlePause)
      element.removeEventListener('error', handleError)
    }
  }, [])

  useEffect(() => {
    const element = audioRef.current
    if (!element || !state.audioUrl || state.status !== 'ready') {
      return
    }

    element.currentTime = 0
    setPlaybackError(null)
    void element.play().catch((error) => {
      setIsPlaying(false)
      setPlaybackError(error instanceof Error ? error.message : 'Speech audio could not play.')
    })
  }, [state.audioUrl, state.status, state.sessionId])

  const displaySegments = useMemo(
    () => estimateSegments(state.segments, state.text, duration),
    [duration, state.segments, state.text]
  )
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0

  const seekTo = (time: number): void => {
    const element = audioRef.current
    if (!element) {
      return
    }

    element.currentTime = Math.max(0, Math.min(time, duration || time))
    setCurrentTime(element.currentTime)
  }

  const togglePlayback = async (): Promise<void> => {
    const element = audioRef.current
    if (!element) {
      return
    }

    if (element.paused) {
      await element.play().catch(() => undefined)
      return
    }

    element.pause()
  }

  return (
    <div className="window flex items-end justify-end bg-transparent p-5">
      <audio
        ref={audioRef}
        src={state.audioUrl ?? undefined}
        preload="metadata"
        className="hidden"
      />
      <section
        className="w-[min(100vw-40px,420px)] rounded-[28px] border border-border/70 bg-background/96 p-4 shadow-[0_14px_36px_rgba(0,0,0,0.18)] backdrop-blur-xl"
        style={DRAG_STYLE}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Text to Speech
            </p>
            <div className="mt-1 flex items-center gap-2 text-sm text-foreground/80">
              <Volume2 className="size-4 text-primary" />
              <span>{state.voice ?? 'CosyVoice'}</span>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            style={NO_DRAG_STYLE}
            aria-label="Stop text-to-speech"
            onClick={() => {
              audioRef.current?.pause()
              void stopTextToSpeech()
            }}
          >
            <Square className="size-4" />
          </Button>
        </div>

        <div
          className="mt-4 rounded-[22px] border border-border/60 bg-muted/40 p-4"
          style={NO_DRAG_STYLE}
        >
          {state.status === 'loading' ? (
            <p className="text-sm leading-relaxed text-muted-foreground">Preparing speech...</p>
          ) : state.status === 'error' || playbackError ? (
            <p className="text-sm leading-relaxed text-destructive">
              {state.error ?? playbackError ?? 'TTS failed.'}
            </p>
          ) : (
            <Transcription segments={displaySegments} currentTime={currentTime} onSeek={seekTo}>
              {(segment, index) => (
                <TranscriptionSegment
                  key={`${index}-${segment.startSecond}-${segment.text}`}
                  segment={segment}
                  index={index}
                  currentTime={currentTime}
                  onSeek={seekTo}
                />
              )}
            </Transcription>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3" style={NO_DRAG_STYLE}>
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 rounded-full"
            aria-label={isPlaying ? 'Pause speech' : 'Play speech'}
            onClick={() => void togglePlayback()}
            disabled={state.status !== 'ready' || !state.audioUrl}
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </Button>
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatClock(currentTime)}</span>
              <span>{formatClock(duration)}</span>
            </div>
            <button
              type="button"
              className="mt-2 h-2.5 w-full rounded-full bg-muted"
              aria-label="Seek speech playback"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                if (rect.width <= 0) {
                  return
                }

                const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
                seekTo(ratio * duration)
              }}
            >
              <span
                className={cn('block h-full rounded-full bg-primary transition-[width]')}
                style={{ width: `${progress * 100}%` }}
              />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
