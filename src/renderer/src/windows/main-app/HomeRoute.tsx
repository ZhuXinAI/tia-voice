import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

import type { MainAppHistoryEntry } from './types'
import { toHumanTime } from './utils'

type HomeRouteProps = {
  wordsSpoken: number
  averageWpm: number | null
  history: MainAppHistoryEntry[]
  retrying: Record<string, boolean>
  onOpenDetails: (entry: MainAppHistoryEntry) => void
  onRetry: (entryId: string) => Promise<void>
}

export function HomeRoute(props: HomeRouteProps): React.JSX.Element {
  const { wordsSpoken, averageWpm, history, retrying, onOpenDetails, onRetry } = props

  return (
    <>
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardDescription>Total words spoken</CardDescription>
            <CardTitle className="text-3xl">{wordsSpoken.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardDescription>Average WPM</CardDescription>
            <CardTitle className="text-3xl">
              {averageWpm === null ? '—' : averageWpm.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardDescription>Transcriptions</CardDescription>
            <CardTitle className="text-3xl">{history.length}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <CardTitle>Transcription history</CardTitle>
          <CardDescription>
            Full session history with retry actions for failed entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {history.length ? (
            history.map((entry) => (
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
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No voice history yet. Your next cleaned transcription will appear here.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
