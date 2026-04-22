import { Check, Pencil, Plus, Sparkles } from 'lucide-react'

import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/utils'
import type { PostProcessPresetPayload } from '../../../../preload/index'
import { getPresetDisplayName } from './presetDisplayName'

type PostProcessPresetListProps = {
  presets: PostProcessPresetPayload[]
  selectedPresetId: string
  onSelectPreset: (presetId: string) => void
  onEditPreset: (presetId: string) => void
  onStartCreate: () => void
}

function summarizePrompt(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 88) {
    return normalized
  }

  return `${normalized.slice(0, 85)}...`
}

export function PostProcessPresetList(props: PostProcessPresetListProps): React.JSX.Element {
  const { presets, selectedPresetId, onSelectPreset, onEditPreset, onStartCreate } = props
  const { t } = useI18n()

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t('presets.libraryTitle')}</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">{t('presets.libraryDescription')}</p>
        </div>
        <Button type="button" size="sm" onClick={onStartCreate}>
          <Plus className="h-4 w-4" />
          {t('presets.newPreset')}
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        <TooltipProvider delayDuration={100}>
          {presets.map((preset) => {
            const isSelected = preset.id === selectedPresetId
            const presetDisplayName = getPresetDisplayName(preset, t)

            return (
              <div
                key={preset.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/8'
                    : 'border-border/70 bg-background/50 hover:border-primary/30 hover:bg-background/80'
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectPreset(preset.id)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {preset.builtIn ? (
                      <Sparkles className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-semibold">
                        {preset.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {presetDisplayName}
                      </p>
                      {preset.builtIn ? (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                          {t('presets.builtIn')}
                        </span>
                      ) : null}
                      {!preset.enablePostProcessing ? (
                        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {t('presets.llmOff')}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {preset.enablePostProcessing
                        ? summarizePrompt(preset.systemPrompt)
                        : t('presets.rawTranscriptDescription')}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-2 pt-0.5">
                  <div
                    aria-hidden="true"
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 text-muted-foreground'
                    )}
                  >
                    {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full text-muted-foreground"
                        aria-label={t('presets.editPresetAria', { name: presetDisplayName })}
                        onClick={() => onEditPreset(preset.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('presets.editPreset')}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )
          })}
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}
