import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { useI18n } from '@renderer/i18n'

import type { DictionaryPhrase } from './types'

type DictionaryRouteProps = {
  dictionary: DictionaryPhrase[]
  phraseDraft: string
  replacementDraft: string
  noteDraft: string
  onPhraseDraftChange: (value: string) => void
  onReplacementDraftChange: (value: string) => void
  onNoteDraftChange: (value: string) => void
  onAddPhrase: () => void
}

export function DictionaryRoute(props: DictionaryRouteProps): React.JSX.Element {
  const {
    dictionary,
    phraseDraft,
    replacementDraft,
    noteDraft,
    onPhraseDraftChange,
    onReplacementDraftChange,
    onNoteDraftChange,
    onAddPhrase
  } = props
  const { t } = useI18n()

  return (
    <>
      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <CardTitle>{t('dictionary.title')}</CardTitle>
          <CardDescription>{t('dictionary.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phrase">{t('dictionary.spokenPhrase')}</Label>
              <Input
                id="phrase"
                value={phraseDraft}
                onChange={(event) => onPhraseDraftChange(event.target.value)}
                placeholder={t('dictionary.spokenPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="replacement">{t('dictionary.normalizedOutput')}</Label>
              <Input
                id="replacement"
                value={replacementDraft}
                onChange={(event) => onReplacementDraftChange(event.target.value)}
                placeholder={t('dictionary.normalizedPlaceholder')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('dictionary.notes')}</Label>
            <Textarea
              id="notes"
              value={noteDraft}
              onChange={(event) => onNoteDraftChange(event.target.value)}
              placeholder={t('dictionary.notesPlaceholder')}
              rows={3}
            />
          </div>

          <Button onClick={onAddPhrase} type="button">
            {t('dictionary.addRule')}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <CardTitle>{t('dictionary.entriesTitle')}</CardTitle>
          <CardDescription>{t('dictionary.entriesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dictionary.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border/70 bg-background/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dictionary.spoken')}</p>
                  <p className="font-medium">{entry.phrase}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{t('dictionary.output')}</p>
                  <p className="font-medium">{entry.replacement}</p>
                </div>
              </div>
              {entry.notes ? (
                <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
