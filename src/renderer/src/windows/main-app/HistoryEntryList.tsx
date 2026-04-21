import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

import type { MainAppHistoryEntry } from './types'
import { toHumanTime } from './utils'

type HistoryEntryListProps = {
  history: MainAppHistoryEntry[]
  retrying: Record<string, boolean>
  emptyMessage?: string
  onOpenDetails: (entry: MainAppHistoryEntry) => void
  onRetry: (entryId: string) => Promise<void>
}

export function HistoryEntryList(props: HistoryEntryListProps): React.JSX.Element {
  const {
    history,
    retrying,
    emptyMessage = 'No voice history yet. Your next cleaned transcription will appear here.',
    onOpenDetails,
    onRetry
  } = props

  if (!history.length) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="space-y-3">
      {history.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg border border-border/70 bg-background/50 p-4 transition-colors hover:border-border hover:bg-background/70"
          onClick={() => onOpenDetails(entry)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpenDetails(entry)
            }
          }}
          aria-label={`Open details for ${entry.title}`}
          role="button"
          tabIndex={0}
        >
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-medium">{entry.title}</p>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
                entry.status === 'completed' &&
                  'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
                entry.status === 'pending' && 'border-sky-500/30 bg-sky-500/15 text-sky-300',
                entry.status === 'failed' && 'border-rose-500/30 bg-rose-500/15 text-rose-300'
              )}
            >
              {entry.status}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {toHumanTime(entry.createdAt)}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{entry.preview}</p>

          {entry.errorDetail ? (
            <p className="mt-2 text-xs text-destructive">{entry.errorDetail}</p>
          ) : null}

          {entry.status === 'failed' && entry.hasAudio ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={Boolean(retrying[entry.id])}
              onClick={(event) => {
                event.stopPropagation()
                void onRetry(entry.id)
              }}
              type="button"
            >
              {retrying[entry.id] ? 'Retrying…' : 'Retry'}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
