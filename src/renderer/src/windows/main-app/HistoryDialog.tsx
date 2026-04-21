import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { useI18n } from '@renderer/i18n'

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
  const { t } = useI18n()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('history.fullTitle')}</DialogTitle>
          <DialogDescription>{t('history.fullDescription', { totalCount })}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('history.loading')}</p>
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
            {t('history.page', {
              current: pageCount === 0 ? 0 : pageIndex + 1,
              total: pageCount
            })}
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onPreviousPage}
              disabled={loading || pageIndex === 0}
            >
              {t('common.previous')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onNextPage}
              disabled={loading || pageIndex >= pageCount - 1}
            >
              {t('common.next')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
