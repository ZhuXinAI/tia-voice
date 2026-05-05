import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileAudio, RefreshCw } from 'lucide-react'

import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { getMeetingDetail, getMeetingHistoryPage } from '@renderer/lib/ipc'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/utils'

import { MeetingDetailDialog } from './MeetingDetailDialog'
import type { MeetingDetail, MeetingHistoryEntry } from './types'
import { toHumanTime } from './utils'

const PAGE_SIZE = 10

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getMeetingPreview(entry: MeetingHistoryEntry): string {
  return (
    entry.summary ||
    entry.polishedTranscript ||
    (entry.status === 'recording'
      ? 'Recording in progress.'
      : 'Raw transcript and audio are saved locally.')
  )
}

export function MeetingsRoute(): React.JSX.Element {
  const { t } = useI18n()
  const [items, setItems] = useState<MeetingHistoryEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedDetail, setSelectedDetail] = useState<MeetingDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const pageCount = useMemo(
    () => (totalCount === 0 ? 0 : Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount]
  )

  const loadPage = useCallback(async (nextPageIndex: number): Promise<void> => {
    setLoading(true)
    try {
      const page = await getMeetingHistoryPage({
        offset: nextPageIndex * PAGE_SIZE,
        limit: PAGE_SIZE
      })
      setItems(page.items)
      setTotalCount(page.totalCount)
      setPageIndex(nextPageIndex)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage(0)
  }, [loadPage])

  const openDetail = async (entry: MeetingHistoryEntry): Promise<void> => {
    setDetailOpen(true)
    setSelectedDetail(null)
    setDetailLoading(true)

    try {
      setSelectedDetail(await getMeetingDetail(entry.id))
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = (open: boolean): void => {
    setDetailOpen(open)
    if (!open) {
      setSelectedDetail(null)
      setDetailLoading(false)
    }
  }

  const statusLabel = (status: MeetingHistoryEntry['status']): string =>
    t(`meetings.status.${status}`)

  return (
    <>
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardDescription>{t('meetings.total')}</CardDescription>
            <CardTitle className="text-3xl">{totalCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardDescription>{t('meetings.shortcut')}</CardDescription>
            <CardTitle className="text-3xl">Ctrl+R</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardDescription>{t('meetings.storage')}</CardDescription>
            <CardTitle className="text-3xl">{t('meetings.local')}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-border/70 bg-card/70">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{t('meetings.title')}</CardTitle>
            <CardDescription>{t('meetings.description', { totalCount })}</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadPage(pageIndex)}
          >
            <RefreshCw />
            {t('meetings.refresh')}
          </Button>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('meetings.loading')}</p>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-background/40 p-8 text-center">
              <FileAudio className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-4 text-sm font-medium">{t('meetings.emptyTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('meetings.emptyBody')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-border/70 bg-background/50 p-4 transition-colors hover:border-border hover:bg-background/70"
                  onClick={() => void openDetail(entry)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      void openDetail(entry)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={t('meetings.openDetail', { title: entry.title })}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-medium">{entry.title || t('meetings.fallbackTitle')}</p>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
                        entry.status === 'completed' &&
                          'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
                        entry.status === 'processing' &&
                          'border-sky-500/30 bg-sky-500/15 text-sky-300',
                        entry.status === 'recording' &&
                          'border-amber-500/30 bg-amber-500/15 text-amber-300',
                        entry.status === 'failed' &&
                          'border-rose-500/30 bg-rose-500/15 text-rose-300'
                      )}
                    >
                      {statusLabel(entry.status)}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {toHumanTime(entry.startedAt)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {getMeetingPreview(entry)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>
                      {t('meetings.duration', { duration: formatDuration(entry.durationMs) })}
                    </span>
                    <span>{t(`meetings.llmProcessing.${entry.llmProcessing}`)}</span>
                    {entry.audio ? <span>{entry.audio.mimeType}</span> : null}
                  </div>
                  {entry.errorDetail ? (
                    <p className="mt-2 text-xs text-destructive">{entry.errorDetail}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-4">
            <p className="text-sm text-muted-foreground">
              {t('meetings.page', {
                current: pageCount === 0 ? 0 : pageIndex + 1,
                total: pageCount
              })}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading || pageIndex === 0}
                onClick={() => void loadPage(pageIndex - 1)}
              >
                {t('common.previous')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading || pageIndex >= pageCount - 1}
                onClick={() => void loadPage(pageIndex + 1)}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <MeetingDetailDialog
        open={detailOpen}
        onOpenChange={closeDetail}
        detail={selectedDetail}
        loading={detailLoading}
      />
    </>
  )
}
