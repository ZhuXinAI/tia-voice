import type { PostProcessPresetPayload } from '../../../../preload/index'

type TranslateFn = (key: string) => string

export function getPresetDisplayName(
  preset: Pick<PostProcessPresetPayload, 'id' | 'name' | 'builtIn'> | null | undefined,
  t: TranslateFn
): string {
  if (!preset) {
    return t('presets.builtInName.formal')
  }

  if (!preset.builtIn) {
    return preset.name
  }

  if (preset.id === 'casual') {
    return t('presets.builtInName.casual')
  }

  return t('presets.builtInName.formal')
}
