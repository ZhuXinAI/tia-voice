type TranslateFn = (
  key: string,
  params?: Record<string, string | number | null | undefined>
) => string

const SAVED_LOCALLY_PREFIX = 'Saved locally'

export function formatMaskedKeyLabel(
  value: string | null | undefined,
  t: TranslateFn,
  emptyLabel: string
): string {
  if (!value) {
    return emptyLabel
  }

  if (!value.startsWith(SAVED_LOCALLY_PREFIX)) {
    return value
  }

  const suffix = value.slice(SAVED_LOCALLY_PREFIX.length).trim()
  return t('settings.savedLocally', { suffix })
}
