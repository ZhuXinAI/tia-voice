import { useMemo } from 'react'

import { AudioPlayer } from '@renderer/components/AudioPlayer'
import type { TiaHistoryDebugEntry } from '../../../../preload/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/utils'

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  return `${(sizeBytes / 1024).toFixed(1)} KB`
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp)
}

export function HistoryDebugDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  historyTitle: string
  detail: TiaHistoryDebugEntry | null
  loading: boolean
}): React.JSX.Element {
  const { open, onOpenChange, historyTitle, detail, loading } = props
  const { t } = useI18n()
  const statusLabel = detail ? t(`history.status.${detail.status}`) : null
  const llmProcessingLabel = detail
    ? t(`historyDebug.llmProcessingStatus.${detail.llmProcessing}`)
    : null

  const audioMeta = useMemo(() => {
    if (!detail?.audio) {
      return null
    }

    return [
      formatDuration(detail.audio.durationMs),
      formatBytes(detail.audio.sizeBytes),
      detail.audio.mimeType
    ].join(' / ')
  }, [detail])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{historyTitle || t('historyDebug.title')}</DialogTitle>
          <DialogDescription>
            {detail ? formatTime(detail.createdAt) : t('historyDebug.description')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('historyDebug.loading')}</p>
        ) : detail ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span
                className={cn(
                  'rounded-full border px-2 py-1 text-xs font-medium capitalize',
                  detail.status === 'completed' &&
                    'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
                  detail.status === 'pending' && 'border-sky-500/30 bg-sky-500/15 text-sky-300',
                  detail.status === 'failed' && 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                )}
              >
                {statusLabel}
              </span>
              {audioMeta ? <span className="text-muted-foreground">{audioMeta}</span> : null}
            </div>

            <section className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t('historyDebug.audioPlayback')}
              </p>
              {detail.audio ? (
                <AudioPlayer audio={detail.audio} />
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">{t('historyDebug.noAudio')}</p>
              )}
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <article className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t('historyDebug.rawTranscript')}
                </p>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                  {detail.transcript || t('historyDebug.noRawTranscript')}
                </p>
              </article>

              <article className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t('historyDebug.llmProcessing')}
                </p>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                  {detail.llmProcessing === 'completed'
                    ? detail.cleanedText || t('historyDebug.noProcessed')
                    : llmProcessingLabel}
                </p>
              </article>
            </section>

            {detail.errorDetail ? (
              <section className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-rose-300">
                  {t('historyDebug.errorDetail')}
                </p>
                <p className="mt-2 text-sm text-rose-100">{detail.errorDetail}</p>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('historyDebug.noDetails')}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
