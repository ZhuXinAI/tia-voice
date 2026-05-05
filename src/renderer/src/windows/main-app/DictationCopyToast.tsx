import { Button } from '@renderer/components/ui/button'
import { useI18n } from '@renderer/i18n'
import { AlertCircle, CheckCircle2, Copy, X } from 'lucide-react'

import type { MainAppState } from './types'

export type DictationFallbackToastState = NonNullable<MainAppState['dictationFallback']>

export type CopyNoticeState = {
  id: number
  status: 'copied' | 'failed'
}

type DictationFallbackToastProps = {
  fallback: DictationFallbackToastState | null
  copying: boolean
  onCopy: (historyId: string) => void
  onDismiss: () => void
}

type CopyNoticeToastProps = {
  notice: CopyNoticeState | null
}

export function DictationFallbackToast(props: DictationFallbackToastProps): React.JSX.Element | null {
  const { fallback, copying, onCopy, onDismiss } = props
  const { t } = useI18n()

  if (!fallback) {
    return null
  }

  const body =
    fallback.reason === 'paste-failed'
      ? t('dictationFallback.pasteFailedBody')
      : t('dictationFallback.body')

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2.5rem))] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-secondary p-2 text-secondary-foreground">
          <AlertCircle aria-hidden="true" className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t('dictationFallback.title')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-2 h-8 w-8"
              onClick={onDismiss}
              aria-label={t('common.dismiss')}
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          {fallback.preview ? (
            <p className="mt-3 max-h-16 overflow-hidden rounded-md border border-border/70 bg-background/70 px-3 py-2 text-sm text-muted-foreground">
              {fallback.preview}
            </p>
          ) : null}

          <Button
            type="button"
            className="mt-3"
            onClick={() => onCopy(fallback.historyId)}
            disabled={copying}
          >
            <Copy aria-hidden="true" />
            {copying ? t('history.copying') : t('dictationFallback.copyAction')}
          </Button>
        </div>
      </div>
    </aside>
  )
}

export function CopyNoticeToast(props: CopyNoticeToastProps): React.JSX.Element | null {
  const { notice } = props
  const { t } = useI18n()

  if (!notice) {
    return null
  }

  const copied = notice.status === 'copied'

  return (
    <aside
      key={notice.id}
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg"
    >
      {copied ? (
        <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-500" />
      ) : (
        <AlertCircle aria-hidden="true" className="size-4 text-destructive" />
      )}
      <span>{copied ? t('history.copied') : t('history.copyFailed')}</span>
    </aside>
  )
}
