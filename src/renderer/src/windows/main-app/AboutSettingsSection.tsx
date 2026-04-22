import { Download, ExternalLink, Github, Info, RefreshCcw } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/utils'

import { TrayIcon } from './TrayIcon'
import type { MainAppState } from './types'

const RELEASES_URL = 'https://github.com/ZhuXinAI/tia-voice/releases'
const REPOSITORY_URL = 'https://github.com/ZhuXinAI/tia-voice'

type AboutSettingsSectionProps = {
  appInfo: MainAppState['appInfo']
  autoUpdate: MainAppState['autoUpdate']
  onCheckForUpdates: () => Promise<void>
  onRestartToUpdate: () => Promise<void>
}

function formatVersion(version: string): string {
  return version.startsWith('v') ? version : `v${version}`
}

function buildStatusLabel(
  autoUpdate: MainAppState['autoUpdate'],
  t: ReturnType<typeof useI18n>['t']
): string {
  switch (autoUpdate.status) {
    case 'checking':
      return t('about.status.checking')
    case 'update-available':
      return t('about.status.downloading', {
        version: autoUpdate.availableVersion
          ? formatVersion(autoUpdate.availableVersion)
          : undefined
      })
    case 'update-downloaded':
      return t('about.status.ready', {
        version: autoUpdate.availableVersion
          ? formatVersion(autoUpdate.availableVersion)
          : undefined
      })
    case 'up-to-date':
      return t('about.status.current')
    case 'unsupported':
      return t('about.status.unsupported')
    case 'error':
      return autoUpdate.message ?? t('about.status.error')
    case 'idle':
    default:
      return t('about.status.idle')
  }
}

export function AboutSettingsSection(props: AboutSettingsSectionProps): React.JSX.Element {
  const { appInfo, autoUpdate, onCheckForUpdates, onRestartToUpdate } = props
  const { t, formatDateTime } = useI18n()
  const [checkPending, setCheckPending] = useState(false)
  const [restartPending, setRestartPending] = useState(false)

  const versionLabel = useMemo(() => formatVersion(appInfo.version), [appInfo.version])
  const lastCheckedLabel = useMemo(
    () =>
      autoUpdate.lastCheckedAt
        ? formatDateTime(autoUpdate.lastCheckedAt, {
            dateStyle: 'medium',
            timeStyle: 'short'
          })
        : null,
    [autoUpdate.lastCheckedAt, formatDateTime]
  )
  const hasDownloadedUpdate = autoUpdate.status === 'update-downloaded'
  const canCheckForUpdates = autoUpdate.status !== 'checking' && autoUpdate.status !== 'unsupported'

  const handleCheckForUpdates = async (): Promise<void> => {
    if (!canCheckForUpdates || checkPending || restartPending) {
      return
    }

    setCheckPending(true)
    try {
      await onCheckForUpdates()
    } finally {
      setCheckPending(false)
    }
  }

  const handleRestartToUpdate = async (): Promise<void> => {
    if (!hasDownloadedUpdate || checkPending || restartPending) {
      return
    }

    setRestartPending(true)
    try {
      await onRestartToUpdate()
    } finally {
      setRestartPending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold">{t('about.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('about.body')}</p>
      </div>

      <Card className="border-border/70 bg-card/70">
        <CardHeader className="border-b border-border/60 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <TrayIcon className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-2xl">{appInfo.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{t('about.productBody')}</p>
              </div>
            </div>

            <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
              {versionLabel}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {t('about.version')}
              </p>
              <p className="mt-2 text-base font-medium">{versionLabel}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {t('about.updateStatus')}
              </p>
              <p className="mt-2 text-base font-medium">{buildStatusLabel(autoUpdate, t)}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {t('about.lastChecked')}
              </p>
              <p className="mt-2 text-base font-medium">{lastCheckedLabel ?? t('about.notYet')}</p>
            </div>
          </div>

          <div
            className={cn(
              'rounded-xl border px-4 py-3 text-sm',
              autoUpdate.status === 'error'
                ? 'border-destructive/50 bg-destructive/5 text-destructive'
                : 'border-border/70 bg-background/60 text-muted-foreground'
            )}
          >
            {autoUpdate.message ?? buildStatusLabel(autoUpdate, t)}
            {autoUpdate.status === 'update-available' &&
            autoUpdate.downloadProgressPercent !== null ? (
              <span className="ml-2 font-medium text-foreground">
                {Math.round(autoUpdate.downloadProgressPercent)}%
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            {hasDownloadedUpdate ? (
              <Button type="button" onClick={() => void handleRestartToUpdate()}>
                <Download className="h-4 w-4" />
                {restartPending ? t('sidebar.restarting') : t('about.restartToUpdate')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={!canCheckForUpdates || checkPending || restartPending}
                onClick={() => void handleCheckForUpdates()}
              >
                <RefreshCcw className="h-4 w-4" />
                {checkPending || autoUpdate.status === 'checking'
                  ? t('about.checking')
                  : t('about.checkForUpdates')}
              </Button>
            )}

            <Button asChild variant="outline">
              <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {t('about.releaseNotes')}
              </a>
            </Button>

            <Button asChild variant="ghost">
              <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
                <Github className="h-4 w-4" />
                {t('about.repository')}
              </a>
            </Button>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('about.updateBadge')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
