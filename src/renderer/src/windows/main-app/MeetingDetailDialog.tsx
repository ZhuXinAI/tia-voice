import { AudioPlayer } from '@renderer/components/AudioPlayer'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/utils'

import type { MeetingDetail } from './types'
import { toHumanTime } from './utils'

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatSegmentTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getSpeakerLabel(speaker: MeetingDetail['transcriptSegments'][number]['speaker']): string {
  return speaker === 'you' ? 'You' : 'Others'
}

function buildRawTranscript(detail: MeetingDetail): string {
  return detail.transcriptSegments
    .filter((segment) => segment.final && segment.text.trim() !== '')
    .map(
      (segment) =>
        `[${formatSegmentTime(segment.beginMs)}] ${getSpeakerLabel(segment.speaker)}: ${segment.text.trim()}`
    )
    .join('\n')
}

export function MeetingDetailDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: MeetingDetail | null
  loading: boolean
}): React.JSX.Element {
  const { open, onOpenChange, detail, loading } = props
  const { t } = useI18n()
  const rawTranscript = detail ? buildRawTranscript(detail) : ''
  const statusLabel = detail ? t(`meetings.status.${detail.status}`) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detail?.title || t('meetings.detailTitle')}</DialogTitle>
          <DialogDescription>
            {detail ? toHumanTime(detail.startedAt) : t('meetings.detailDescription')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('meetings.loadingDetail')}</p>
        ) : detail ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span
                className={cn(
                  'rounded-full border px-2 py-1 text-xs font-medium capitalize',
                  detail.status === 'completed' &&
                    'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
                  detail.status === 'processing' && 'border-sky-500/30 bg-sky-500/15 text-sky-300',
                  detail.status === 'recording' &&
                    'border-amber-500/30 bg-amber-500/15 text-amber-300',
                  detail.status === 'failed' && 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                )}
              >
                {statusLabel}
              </span>
              <span className="text-muted-foreground">
                {t('meetings.duration', { duration: formatDuration(detail.durationMs) })}
              </span>
              <span className="text-muted-foreground">
                {t(`meetings.llmProcessing.${detail.llmProcessing}`)}
              </span>
            </div>

            {detail.audio ? (
              <section className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t('meetings.audio')}
                </p>
                <AudioPlayer audio={detail.audio} />
              </section>
            ) : null}

            <section className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t('meetings.summary')}
              </p>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                {detail.summary || t('meetings.noSummary')}
              </p>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t('meetings.polishedTranscript')}
                </p>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                  {detail.polishedTranscript || t('meetings.noPolishedTranscript')}
                </p>
              </article>

              <article className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t('meetings.rawTranscript')}
                </p>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                  {rawTranscript || t('meetings.noRawTranscript')}
                </p>
              </article>
            </section>

            {detail.errorDetail ? (
              <section className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-rose-300">
                  {t('meetings.errorDetail')}
                </p>
                <p className="mt-2 text-sm text-rose-100">{detail.errorDetail}</p>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('meetings.noDetail')}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
