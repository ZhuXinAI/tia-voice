import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'

import type { PostProcessPresetPayload } from '../../../../preload/index'
import { PostProcessPresetEditor } from './PostProcessPresetEditor'
import { PostProcessPresetList } from './PostProcessPresetList'

type PresetsRouteProps = {
  presets: PostProcessPresetPayload[]
  selectedPreset: string
  onSelectPreset: (presetId: string) => void
  onSavePreset: (input: { id: string; name: string; systemPrompt: string }) => void
  onResetPreset: (presetId: string) => void
  onCreatePreset: (input: { name: string; systemPrompt: string }) => void
}

export function PresetsRoute(props: PresetsRouteProps): React.JSX.Element {
  const {
    presets,
    selectedPreset,
    onSelectPreset,
    onSavePreset,
    onResetPreset,
    onCreatePreset
  } = props

  const [dialogPresetId, setDialogPresetId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftSystemPrompt, setDraftSystemPrompt] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogPreset = useMemo(
    () => presets.find((preset) => preset.id === dialogPresetId) ?? null,
    [dialogPresetId, presets]
  )

  useEffect(() => {
    if (creatingNew) {
      setDraftName('')
      setDraftSystemPrompt('')
      setError(null)
      return
    }

    setDraftName(dialogPreset?.name ?? '')
    setDraftSystemPrompt(dialogPreset?.systemPrompt ?? '')
    setError(null)
  }, [creatingNew, dialogPreset])

  const handleStartCreate = (): void => {
    setCreatingNew(true)
    setDialogPresetId(null)
    setError(null)
  }

  const handleSelectPreset = (presetId: string): void => {
    setError(null)
    onSelectPreset(presetId)
  }

  const handleEditPreset = (presetId: string): void => {
    setError(null)
    setCreatingNew(false)
    setDialogPresetId(presetId)
  }

  const handleDialogOpenChange = (open: boolean): void => {
    if (open) {
      return
    }

    setCreatingNew(false)
    setDialogPresetId(null)
    setPending(false)
    setError(null)
  }

  const handleSave = async (): Promise<void> => {
    if (!draftName.trim() || !draftSystemPrompt.trim()) {
      setError('Add both a preset name and instructions.')
      return
    }

    setPending(true)
    setError(null)

    try {
      if (creatingNew) {
        await onCreatePreset({
          name: draftName.trim(),
          systemPrompt: draftSystemPrompt.trim()
        })
        handleDialogOpenChange(false)
        return
      }

      if (!dialogPreset) {
        setError('Select a preset before saving.')
        return
      }

      await onSavePreset({
        id: dialogPreset.id,
        name: draftName.trim(),
        systemPrompt: draftSystemPrompt.trim()
      })
      handleDialogOpenChange(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save preset.')
    } finally {
      setPending(false)
    }
  }

  const handleReset = async (): Promise<void> => {
    if (!dialogPreset?.builtIn) {
      return
    }

    setPending(true)
    setError(null)

    try {
      await onResetPreset(dialogPreset.id)
      handleDialogOpenChange(false)
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset preset.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(135deg,rgba(168,85,247,0.12),rgba(245,158,11,0.08),rgba(15,23,42,0.02))] px-6 py-7">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Presets shape the PostProcess prompt
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-normal text-foreground">
            Tune the instruction layer that sits between the base prompt and the live context.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Pick a preset for everyday use, rewrite its instructions when the output needs a
            different tone, and add new presets for other writing styles or workflows.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">
              1 Base prompt
            </span>
            <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">
              2 Preset prompt
            </span>
            <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">
              3 Remaining context
            </span>
          </div>
        </div>
      </section>

      <section>
        <PostProcessPresetList
          presets={presets}
          selectedPresetId={selectedPreset}
          onSelectPreset={handleSelectPreset}
          onEditPreset={handleEditPreset}
          onStartCreate={handleStartCreate}
        />
      </section>

      <PostProcessPresetEditor
        open={creatingNew || dialogPreset !== null}
        preset={creatingNew ? null : dialogPreset}
        creatingNew={creatingNew}
        draftName={draftName}
        draftSystemPrompt={draftSystemPrompt}
        pending={pending}
        error={error}
        onOpenChange={handleDialogOpenChange}
        onDraftNameChange={setDraftName}
        onDraftSystemPromptChange={setDraftSystemPrompt}
        onSave={() => void handleSave()}
        onResetToDefault={() => void handleReset()}
      />
    </>
  )
}
