import { Languages } from 'lucide-react'

import { Card, CardContent } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import { useI18n } from '@renderer/i18n'

import type { AppLanguage, LanguagePreference } from '../../../../shared/i18n/config'

type LanguageSettingsSectionProps = {
  languagePreference: LanguagePreference
  resolvedLanguage: AppLanguage
  pending: boolean
  onLanguageChange: (language: LanguagePreference) => Promise<void>
}

const LANGUAGE_OPTIONS: Array<{
  id: LanguagePreference
  labelKey: string
  detailKey: string
  resolvedLanguage?: AppLanguage
}> = [
  {
    id: 'system',
    labelKey: 'settings.languageSystem',
    detailKey: 'settings.languageSystemDetail'
  },
  {
    id: 'en',
    labelKey: 'settings.languageEnglish',
    detailKey: 'settings.languageEnglish',
    resolvedLanguage: 'en'
  },
  {
    id: 'zh-CN',
    labelKey: 'settings.languageSimplified',
    detailKey: 'settings.languageSimplified',
    resolvedLanguage: 'zh-CN'
  },
  {
    id: 'zh-TW',
    labelKey: 'settings.languageTraditional',
    detailKey: 'settings.languageTraditional',
    resolvedLanguage: 'zh-TW'
  }
]

function getLanguageLabel(t: (key: string) => string, language: AppLanguage): string {
  if (language === 'zh-CN') {
    return t('settings.languageSimplified')
  }

  if (language === 'zh-TW') {
    return t('settings.languageTraditional')
  }

  return t('settings.languageEnglish')
}

export function LanguageSettingsSection(props: LanguageSettingsSectionProps): React.JSX.Element {
  const { languagePreference, resolvedLanguage, pending, onLanguageChange } = props
  const { t } = useI18n()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold">{t('settings.languageTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('settings.languageBody')}</p>
      </div>

      <Card className="border-border/70 bg-card/70">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-start gap-4 rounded-2xl border border-border/70 bg-background/60 p-5">
            <Languages className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">
                {t('settings.languageCurrent', {
                  language: getLanguageLabel(t, resolvedLanguage)
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {languagePreference === 'system'
                  ? t('settings.languageResolved', {
                      language: getLanguageLabel(t, resolvedLanguage)
                    })
                  : t('settings.languageDirect')}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {LANGUAGE_OPTIONS.map((option) => {
              const isSelected = languagePreference === option.id
              const isResolved = option.resolvedLanguage === resolvedLanguage

              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    'rounded-2xl border p-4 text-left transition-colors',
                    isSelected
                      ? 'border-foreground/30 bg-background text-foreground'
                      : 'border-border/70 bg-background/50 text-muted-foreground hover:border-border hover:text-foreground'
                  )}
                  disabled={pending}
                  onClick={() => void onLanguageChange(option.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{t(option.labelKey)}</p>
                    <div className="flex items-center gap-2">
                      {isResolved ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {t('settings.usingNow')}
                        </span>
                      ) : null}
                      {isSelected ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {t('settings.active')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-sm">{t(option.detailKey)}</p>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
