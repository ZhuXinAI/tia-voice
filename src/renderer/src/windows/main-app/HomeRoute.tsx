import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'

import { HistoryEntryList } from './HistoryEntryList'
import type { MainAppHistoryEntry } from './types'

type HomeRouteProps = {
  wordsSpoken: number
  averageWpm: number | null
  totalCount: number
  history: MainAppHistoryEntry[]
  retrying: Record<string, boolean>
  onOpenDetails: (entry: MainAppHistoryEntry) => void
  onShowAll: () => void
  onRetry: (entryId: string) => Promise<void>
}

export function HomeRoute(props: HomeRouteProps): React.JSX.Element {
  const {
    wordsSpoken,
    averageWpm,
    totalCount,
    history,
    retrying,
    onOpenDetails,
    onShowAll,
    onRetry
  } = props

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
            <CardTitle className="text-3xl">{totalCount}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <CardTitle>Transcription history</CardTitle>
          <CardDescription>
            Showing the {history.length} most recent of {totalCount} transcriptions with retry
            actions for failed entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <HistoryEntryList
            history={history}
            retrying={retrying}
            onOpenDetails={onOpenDetails}
            onRetry={onRetry}
          />

          {totalCount > history.length ? (
            <div className="flex justify-center pt-2">
              <Button type="button" variant="outline" onClick={onShowAll}>
                Show All
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  )
}
