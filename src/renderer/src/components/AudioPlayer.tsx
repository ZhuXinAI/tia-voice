import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'

import type { TiaHistoryDebugEntry } from '../../../preload/index'
import { Button } from './ui/button'
import { cn } from '@renderer/lib/utils'

const PEAK_COUNT = 40
const FALLBACK_PEAKS = Array.from({ length: PEAK_COUNT }, (_, index) => {
  const wave = Math.sin((index / (PEAK_COUNT - 1)) * Math.PI * 3)
  return 0.28 + Math.abs(wave) * 0.34
})

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00'
  }

  const roundedSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(roundedSeconds / 3600)
  const minutes = Math.floor((roundedSeconds % 3600) / 60)
  const remainingSeconds = roundedSeconds % 60

  if (hours > 0) {
    return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
  }

  return [minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function createWaveformPeaks(buffer: AudioBuffer, count: number): number[] {
  const channelCount = Math.max(1, buffer.numberOfChannels)
  const frameCount = buffer.length
  const blockSize = Math.max(1, Math.floor(frameCount / count))
  const peaks = new Array(count).fill(0).map((_, index) => {
    const start = index * blockSize
    const end = Math.min(frameCount, start + blockSize)
    let peak = 0

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      let amplitude = 0

      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        amplitude += Math.abs(buffer.getChannelData(channelIndex)[sampleIndex] ?? 0)
      }

      peak = Math.max(peak, amplitude / channelCount)
    }

    return peak
  })

  const maxPeak = peaks.reduce((largest, value) => Math.max(largest, value), 0)
  if (maxPeak <= 0) {
    return FALLBACK_PEAKS
  }

  return peaks.map((value) => 0.16 + (value / maxPeak) * 0.84)
}

type AudioPlayerProps = {
  audio: NonNullable<TiaHistoryDebugEntry['audio']>
}

export function AudioPlayer(props: AudioPlayerProps): React.JSX.Element {
  const { audio } = props
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(audio.durationMs / 1000)
  const [peaks, setPeaks] = useState<number[]>(FALLBACK_PEAKS)

  useEffect(() => {
    const audioBytes = new Uint8Array(audio.bytes)
    const blob = new Blob([audioBytes.buffer.slice(0)], { type: audio.mimeType })
    const nextAudioUrl = URL.createObjectURL(blob)
    setAudioUrl(nextAudioUrl)

    return () => {
      URL.revokeObjectURL(nextAudioUrl)
    }
  }, [audio])

  useEffect(() => {
    setDuration(audio.durationMs / 1000)
    setCurrentTime(0)
    setIsPlaying(false)
  }, [audio.durationMs, audio.mimeType, audio.bytes])

  useEffect(() => {
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) {
      setPeaks(FALLBACK_PEAKS)
      return
    }

    let cancelled = false
    const audioContext = new AudioContextClass()

    void (async () => {
      try {
        const decoded = await audioContext.decodeAudioData(new Uint8Array(audio.bytes).slice().buffer)
        if (!cancelled) {
          setPeaks(createWaveformPeaks(decoded, PEAK_COUNT))
        }
      } catch {
        if (!cancelled) {
          setPeaks(FALLBACK_PEAKS)
        }
      } finally {
        void audioContext.close()
      }
    })()

    return () => {
      cancelled = true
      void audioContext.close()
    }
  }, [audio])

  useEffect(() => {
    const element = audioRef.current
    if (!element) {
      return
    }

    const syncCurrentTime = (): void => {
      setCurrentTime(element.currentTime || 0)
    }

    const syncDuration = (): void => {
      const nextDuration =
        Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : audio.durationMs / 1000
      setDuration(nextDuration)
    }

    const handlePlay = (): void => setIsPlaying(true)
    const handlePause = (): void => setIsPlaying(false)
    const handleEnded = (): void => {
      setIsPlaying(false)
      setCurrentTime(element.duration || 0)
    }

    syncDuration()
    syncCurrentTime()

    element.addEventListener('timeupdate', syncCurrentTime)
    element.addEventListener('loadedmetadata', syncDuration)
    element.addEventListener('durationchange', syncDuration)
    element.addEventListener('play', handlePlay)
    element.addEventListener('pause', handlePause)
    element.addEventListener('ended', handleEnded)

    return () => {
      element.removeEventListener('timeupdate', syncCurrentTime)
      element.removeEventListener('loadedmetadata', syncDuration)
      element.removeEventListener('durationchange', syncDuration)
      element.removeEventListener('play', handlePlay)
      element.removeEventListener('pause', handlePause)
      element.removeEventListener('ended', handleEnded)
    }
  }, [audio.durationMs, audioUrl])

  const resolvedDuration = duration > 0 ? duration : audio.durationMs / 1000
  const progress = resolvedDuration > 0 ? Math.min(1, currentTime / resolvedDuration) : 0

  const progressStyle = useMemo(
    () => ({
      width: `${Math.max(progress * 100, 0)}%`
    }),
    [progress]
  )

  const scrubberPositionStyle = useMemo(
    () => ({
      left: `${Math.max(progress * 100, 0)}%`
    }),
    [progress]
  )

  const seekTo = (nextTime: number): void => {
    const element = audioRef.current
    if (!element) {
      return
    }

    const clampedTime = Math.max(0, Math.min(nextTime, resolvedDuration))
    element.currentTime = clampedTime
    setCurrentTime(clampedTime)
  }

  const handleTogglePlayback = async (): Promise<void> => {
    const element = audioRef.current
    if (!element) {
      return
    }

    if (element.paused) {
      try {
        await element.play()
      } catch {
        setIsPlaying(false)
      }
      return
    }

    element.pause()
  }

  const handleWaveformClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) {
      return
    }

    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    seekTo(ratio * resolvedDuration)
  }

  return (
    <div className="mt-3 rounded-2xl border border-border/70 bg-background/75 p-4 shadow-sm" data-testid="audio-player">
      <audio ref={audioRef} preload="metadata" src={audioUrl ?? undefined} className="hidden" />

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          className="h-11 w-11 rounded-full"
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
          onClick={() => void handleTogglePlayback()}
        >
          {isPlaying ? <Pause /> : <Play className="translate-x-px" />}
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <span>Waveform preview</span>
            <span>{audio.mimeType}</span>
          </div>

          <button
            type="button"
            className="relative mt-3 h-24 w-full overflow-hidden rounded-2xl border border-border/70 bg-linear-to-r from-primary/8 via-secondary/12 to-primary/6 text-left transition hover:border-primary/40"
            onClick={handleWaveformClick}
            aria-label="Seek audio waveform"
          >
            <div className="pointer-events-none absolute inset-y-0 left-0 bg-primary/16" style={progressStyle} />
            <div className="relative flex h-full items-end gap-1 px-3 py-4" data-testid="audio-waveform">
              {peaks.map((peak, index) => {
                const barProgress = index / Math.max(peaks.length - 1, 1)
                return (
                  <span
                    key={`${index}-${peak}`}
                    className={cn(
                      'min-w-0 flex-1 rounded-full transition-colors',
                      barProgress <= progress ? 'bg-primary' : 'bg-foreground/18'
                    )}
                    style={{
                      height: `${Math.max(14, peak * 100)}%`
                    }}
                  />
                )
              })}
            </div>
            <span
              className="pointer-events-none absolute inset-y-3 w-0.5 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-background)_72%,transparent)]"
              style={scrubberPositionStyle}
            />
          </button>

          <input
            type="range"
            min={0}
            max={resolvedDuration || 0}
            step={0.01}
            value={Math.min(currentTime, resolvedDuration)}
            onChange={(event) => seekTo(Number(event.target.value))}
            aria-label="Seek audio"
            className="mt-3 h-2 w-full cursor-pointer accent-[var(--color-primary)]"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="font-mono tabular-nums text-muted-foreground">{formatClock(currentTime)}</span>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => seekTo(currentTime - 5)}
        >
          <RotateCcw />
          Back 5s
        </Button>

        <span className="font-mono tabular-nums text-foreground">{formatClock(resolvedDuration)}</span>
      </div>
    </div>
  )
}
