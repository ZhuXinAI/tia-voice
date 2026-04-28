import type { ReactNode } from 'react'

import { cn } from '@renderer/lib/utils'
import type { TtsTranscriptSegment } from '../../../../shared/tts'

type TranscriptionProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  segments: TtsTranscriptSegment[]
  currentTime?: number
  onSeek?: (time: number) => void
  children: (segment: TtsTranscriptSegment, index: number) => ReactNode
}

type TranscriptionSegmentProps = React.ComponentProps<'button'> & {
  segment: TtsTranscriptSegment
  index: number
  currentTime: number
  onSeek?: (time: number) => void
}

export function Transcription({
  segments,
  children,
  className,
  ...props
}: TranscriptionProps): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-wrap gap-x-0 gap-y-1 text-sm leading-relaxed', className)}
      data-slot="transcription"
      {...props}
    >
      {segments
        .filter((segment) => segment.text.trim().length > 0 || /\s+/.test(segment.text))
        .map((segment, index) => children(segment, index))}
      {segments.length === 0 ? (
        <span className="text-muted-foreground/70">Transcript unavailable.</span>
      ) : null}
    </div>
  )
}

export function TranscriptionSegment({
  segment,
  index,
  currentTime,
  onSeek,
  className,
  onClick,
  ...props
}: TranscriptionSegmentProps): React.JSX.Element {
  const isActive = currentTime >= segment.startSecond && currentTime < segment.endSecond
  const isPast = currentTime >= segment.endSecond && segment.endSecond > segment.startSecond
  const interactive = Boolean(onSeek)

  return (
    <button
      type="button"
      data-slot="transcription-segment"
      data-index={index}
      data-active={isActive}
      className={cn(
        'inline rounded-sm px-0.5 text-left transition-colors',
        interactive ? 'cursor-pointer hover:text-foreground' : 'cursor-default',
        isActive ? 'bg-primary/16 text-foreground shadow-[inset_0_-1px_0_var(--color-ring)]' : '',
        isPast ? 'text-muted-foreground' : '',
        !isActive && !isPast ? 'text-muted-foreground/75' : '',
        className
      )}
      onClick={(event) => {
        onSeek?.(segment.startSecond)
        onClick?.(event)
      }}
      {...props}
    >
      {segment.text}
    </button>
  )
}
