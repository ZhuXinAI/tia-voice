import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'

import { useI18n } from '@renderer/i18n'
import type { PostProcessPresetPayload } from '../../../../preload/index'
import { PostProcessPresetEditor } from './PostProcessPresetEditor'
import { PostProcessPresetList } from './PostProcessPresetList'

type PresetsRouteProps = {
  presets: PostProcessPresetPayload[]
  selectedPreset: string
  onSelectPreset: (presetId: string) => void
  onSavePreset: (input: {
    id: string
    name: string
    systemPrompt: string
    enablePostProcessing: boolean
  }) => void
  onResetPreset: (presetId: string) => void
  onCreatePreset: (input: {
    name: string
    systemPrompt: string
    enablePostProcessing: boolean
  }) => void
}

export function PresetsRoute(props: PresetsRouteProps): React.JSX.Element {
  const { presets, selectedPreset, onSelectPreset, onSavePreset, onResetPreset, onCreatePreset } =
    props
  const { t } = useI18n()

  const [dialogPresetId, setDialogPresetId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftSystemPrompt, setDraftSystemPrompt] = useState('')
  const [draftEnablePostProcessing, setDraftEnablePostProcessing] = useState(true)
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
      setDraftEnablePostProcessing(true)
      setError(null)
      return
    }

    setDraftName(dialogPreset?.name ?? '')
    setDraftSystemPrompt(dialogPreset?.systemPrompt ?? '')
    setDraftEnablePostProcessing(dialogPreset?.enablePostProcessing ?? true)
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
    if (!draftName.trim()) {
      setError(t('presets.validationNameRequired'))
      return
    }

    setPending(true)
    setError(null)

    try {
      if (creatingNew) {
        await onCreatePreset({
          name: draftName.trim(),
          systemPrompt: draftSystemPrompt.trim(),
          enablePostProcessing: draftEnablePostProcessing
        })
        handleDialogOpenChange(false)
        return
      }

      if (!dialogPreset) {
        setError(t('presets.validationSelectPreset'))
        return
      }

      await onSavePreset({
        id: dialogPreset.id,
        name: draftName.trim(),
        systemPrompt: draftSystemPrompt.trim(),
        enablePostProcessing: draftEnablePostProcessing
      })
      handleDialogOpenChange(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('presets.errorSave'))
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
      setError(resetError instanceof Error ? resetError.message : t('presets.errorReset'))
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
            {t('presets.badge')}
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-normal text-foreground">
            {t('presets.heroTitle')}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('presets.heroBody')}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">
              {t('presets.layer.base')}
            </span>
            <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">
              {t('presets.layer.preset')}
            </span>
            <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">
              {t('presets.layer.context')}
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
        draftEnablePostProcessing={draftEnablePostProcessing}
        onDraftEnablePostProcessingChange={setDraftEnablePostProcessing}
        onSave={() => void handleSave()}
        onResetToDefault={() => void handleReset()}
      />
    </>
  )
}
