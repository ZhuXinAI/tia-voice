import { useState } from 'react'
import { AlertTriangle, BookText, Download, Home, Settings2, Sparkles } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { Button } from '@renderer/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@renderer/components/ui/sidebar'
import { useI18n } from '@renderer/i18n'

import type { DashscopeSetupState, MainAppState, SettingsSection } from './types'
import { TrayIcon } from './TrayIcon'

type MainSidebarProps = {
  dashscope: DashscopeSetupState
  openai: DashscopeSetupState
  selectedProvider: MainAppState['selectedProvider']
  postProcessPreset: MainAppState['postProcessPreset']
  postProcessPresets: MainAppState['postProcessPresets']
  permissions: MainAppState['permissions']
  autoUpdate: MainAppState['autoUpdate']
  onOpenSettings: (section?: SettingsSection) => void
  onRestartToUpdate: () => Promise<void>
}

export function MainSidebar(props: MainSidebarProps): React.JSX.Element {
  const {
    dashscope,
    openai,
    selectedProvider,
    postProcessPreset,
    postProcessPresets,
    permissions,
    autoUpdate,
    onOpenSettings,
    onRestartToUpdate
  } = props
  const { t } = useI18n()
  const location = useLocation()
  const [restartPending, setRestartPending] = useState(false)
  const isHomeRoute = location.pathname === '/'
  const isDictionaryRoute = location.pathname.startsWith('/dictionary')
  const isPresetsRoute = location.pathname.startsWith('/presets')
  const activeProvider = selectedProvider === 'openai' ? openai : dashscope
  const activeProviderLabel = selectedProvider === 'openai' ? 'OpenAI' : 'DashScope'
  const hasDownloadedUpdate = autoUpdate.status === 'update-downloaded'
  const activePresetLabel =
    postProcessPresets.find((preset) => preset.id === postProcessPreset)?.name ?? 'Formal'

  const handleRestartToUpdate = async (): Promise<void> => {
    if (!hasDownloadedUpdate || restartPending) {
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
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 text-primary">
            <TrayIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">TIA Voice</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t('sidebar.desktopAssistant')}
                </p>
              </div>

              {hasDownloadedUpdate ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={restartPending}
                  className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
                  onClick={() => void handleRestartToUpdate()}
                >
                  <Download className="h-3 w-3" />
                  {restartPending ? t('sidebar.restarting') : t('sidebar.update')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('sidebar.navigation')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isHomeRoute} tooltip={t('nav.home')}>
                  <Link to="/">
                    <Home />
                    <span>{t('nav.home')}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isDictionaryRoute}
                  tooltip={t('nav.dictionary')}
                >
                  <Link to="/dictionary">
                    <BookText />
                    <span>{t('nav.dictionary')}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isPresetsRoute} tooltip={t('nav.presets')}>
                  <Link to="/presets">
                    <Sparkles />
                    <span>{t('nav.presets')}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onOpenSettings()} tooltip={t('nav.settings')}>
                  <Settings2 />
                  <span>{t('nav.settings')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        {permissions.hasMissing ? (
          <Button
            className="mb-3 w-full justify-start gap-2 border-amber-500/30 bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:text-amber-200"
            variant="outline"
            onClick={() => onOpenSettings('permissions')}
            type="button"
          >
            <AlertTriangle className="h-4 w-4" />
            <span>{t('sidebar.permissionsAttention')}</span>
          </Button>
        ) : null}

        <div className="group-data-[collapsible=icon]:hidden rounded-lg border border-sidebar-border/70 bg-sidebar-accent/30 p-3">
          {permissions.hasMissing ? (
            <>
              <p className="text-xs uppercase tracking-[0.08em] text-amber-700 dark:text-amber-200">
                {t('sidebar.warning')}
              </p>
              <p className="mt-2 text-sm font-medium">{t('sidebar.permissionsMissingTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('sidebar.permissionsMissingBody')}</p>
              <Button
                className="mt-3 w-full"
                variant="outline"
                onClick={() => onOpenSettings('permissions')}
                type="button"
              >
                {t('sidebar.fixPermissions')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {t('sidebar.provider')}
              </p>
              <p className="mt-2 text-sm font-medium">{activeProviderLabel}</p>
              <p className="text-xs text-muted-foreground">
                {activeProvider.keyLabel ?? t('sidebar.noApiKey')}
              </p>
              <div className="mt-3 flex items-center justify-between rounded-lg border border-sidebar-border/70 bg-background/60 px-3 py-2 text-xs">
                <span className="text-muted-foreground">{t('sidebar.postProcessPreset')}</span>
                <span className="font-medium text-foreground">{activePresetLabel}</span>
              </div>
              <Button
                className="mt-3 w-full"
                variant="outline"
                onClick={() => onOpenSettings('providers')}
                type="button"
              >
                {activeProvider.configured ? t('sidebar.manageKey') : t('sidebar.addKey')}
              </Button>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
