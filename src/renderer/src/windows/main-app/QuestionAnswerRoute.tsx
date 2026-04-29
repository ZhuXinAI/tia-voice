import { MessageCircleQuestion } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/utils'

import type { MainAppState } from './types'
import { toHumanTime } from './utils'

type QuestionAnswerRouteProps = {
  history: MainAppState['questionHistory']
  totalCount: number
}

export function QuestionAnswerRoute(props: QuestionAnswerRouteProps): React.JSX.Element {
  const { history, totalCount } = props
  const { t } = useI18n()

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageCircleQuestion className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{t('qa.title')}</CardTitle>
            <CardDescription>
              {t('qa.description', {
                historyCount: history.length,
                totalCount
              })}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('qa.empty')}</p>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <article
                key={entry.id}
                className="rounded-lg border border-border/70 bg-background/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
                      entry.status === 'completed' &&
                        'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
                      entry.status === 'pending' && 'border-sky-500/30 bg-sky-500/15 text-sky-300',
                      entry.status === 'failed' && 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                    )}
                  >
                    {t(`history.status.${entry.status}`)}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {toHumanTime(entry.createdAt)}
                  </span>
                </div>

                <p className="mt-3 text-sm font-medium">{entry.question || t('qa.pending')}</p>
                {entry.selectedText ? (
                  <p className="mt-2 line-clamp-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {entry.selectedText}
                  </p>
                ) : null}
                {entry.answer ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                    {entry.answer}
                  </p>
                ) : null}
                {entry.errorDetail ? (
                  <p className="mt-3 text-xs text-destructive">{entry.errorDetail}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
