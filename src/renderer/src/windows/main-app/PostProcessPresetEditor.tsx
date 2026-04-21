import { Loader2, RotateCcw, Sparkles } from 'lucide-react'

import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import type { PostProcessPresetPayload } from '../../../../preload/index'

type PostProcessPresetEditorProps = {
  open: boolean
  preset: PostProcessPresetPayload | null
  creatingNew: boolean
  pending: boolean
  error: string | null
  draftName: string
  draftSystemPrompt: string
  onOpenChange: (open: boolean) => void
  onDraftNameChange: (value: string) => void
  onDraftSystemPromptChange: (value: string) => void
  onSave: () => void
  onResetToDefault: () => void
}

export function PostProcessPresetEditor(props: PostProcessPresetEditorProps): React.JSX.Element {
  const {
    open,
    preset,
    creatingNew,
    pending,
    error,
    draftName,
    draftSystemPrompt,
    onOpenChange,
    onDraftNameChange,
    onDraftSystemPromptChange,
    onSave,
    onResetToDefault
  } = props

  const title = creatingNew ? 'New preset' : preset?.name ?? 'Preset'
  const description = creatingNew
    ? 'Create a new PostProcess instruction set.'
    : 'Adjust the prompt used for this preset, or reset the built-in wording back to default.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(720px,92vw)] max-w-none border border-border/70 bg-background/95">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-lg border border-border/70 bg-background/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Prompt order
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Base prompt, then this preset prompt, then the remaining transcript and
              selected-text context.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="preset-name">Preset name</Label>
            <Input
              id="preset-name"
              value={draftName}
              onChange={(event) => onDraftNameChange(event.target.value)}
              placeholder="e.g. Customer support"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preset-instructions">Preset prompt</Label>
            <Textarea
              id="preset-instructions"
              value={draftSystemPrompt}
              onChange={(event) => onDraftSystemPromptChange(event.target.value)}
              placeholder="Describe how the PostProcess pass should shape the text."
              rows={9}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-3 sm:justify-between">
          <div>
            {!creatingNew && preset?.builtIn ? (
              <Button type="button" variant="ghost" onClick={onResetToDefault} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reset to default
              </Button>
            ) : null}
          </div>
          <Button type="button" onClick={onSave} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {creatingNew ? 'Create preset' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
