import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

import { HistoryEntryList } from './HistoryEntryList'
import type { MainAppHistoryEntry } from './types'

type HistoryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: MainAppHistoryEntry[]
  totalCount: number
  pageIndex: number
  pageCount: number
  loading: boolean
  retrying: Record<string, boolean>
  onPreviousPage: () => void
  onNextPage: () => void
  onOpenDetails: (entry: MainAppHistoryEntry) => void
  onRetry: (entryId: string) => Promise<void>
}

export function HistoryDialog(props: HistoryDialogProps): React.JSX.Element {
  const {
    open,
    onOpenChange,
    history,
    totalCount,
    pageIndex,
    pageCount,
    loading,
    retrying,
    onPreviousPage,
    onNextPage,
    onOpenDetails,
    onRetry
  } = props

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Full transcription history</DialogTitle>
          <DialogDescription>
            Browse all {totalCount} saved transcriptions. Each page shows 10 records.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : (
          <HistoryEntryList
            history={history}
            retrying={retrying}
            onOpenDetails={onOpenDetails}
            onRetry={onRetry}
          />
        )}

        <DialogFooter className="items-center justify-between gap-3 border-t border-border/70 pt-4 sm:flex-row sm:space-x-0">
          <p className="text-sm text-muted-foreground">
            Page {pageCount === 0 ? 0 : pageIndex + 1} of {pageCount}
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onPreviousPage}
              disabled={loading || pageIndex === 0}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onNextPage}
              disabled={loading || pageIndex >= pageCount - 1}
            >
              Next
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
