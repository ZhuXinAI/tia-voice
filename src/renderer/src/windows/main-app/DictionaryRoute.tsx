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

  return (
    <>
      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <CardTitle>Pronunciation dictionary</CardTitle>
          <CardDescription>
            Teach the PostProcess model how to normalize brand names, acronyms, and special
            phrases.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phrase">Spoken phrase</Label>
              <Input
                id="phrase"
                value={phraseDraft}
                onChange={(event) => onPhraseDraftChange(event.target.value)}
                placeholder="e.g. build mine"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="replacement">Normalized output</Label>
              <Input
                id="replacement"
                value={replacementDraft}
                onChange={(event) => onReplacementDraftChange(event.target.value)}
                placeholder="e.g. BuildMind"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Optional instruction notes</Label>
            <Textarea
              id="notes"
              value={noteDraft}
              onChange={(event) => onNoteDraftChange(event.target.value)}
              placeholder="Add handling details that help LLM PostProcess."
              rows={3}
            />
          </div>

          <Button onClick={onAddPhrase} type="button">
            Add phrase rule
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <CardTitle>Current dictionary entries</CardTitle>
          <CardDescription>
            These rules will be used to stabilize transcription PostProcess output.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dictionary.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border/70 bg-background/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Spoken</p>
                  <p className="font-medium">{entry.phrase}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Output</p>
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
