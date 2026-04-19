import { useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { cn } from '@renderer/lib/utils'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@renderer/components/ui/sidebar'

import { MainSidebar } from './MainSidebar'
import type { DashscopeSetupState, MainAppState, SettingsSection } from './types'

type MainAppLayoutProps = {
  dashscope: DashscopeSetupState
  onOpenSettings: (section?: SettingsSection) => void
  voiceBackendStatus: MainAppState['voiceBackendStatus']
}

export function MainAppLayout(props: MainAppLayoutProps): React.JSX.Element {
  const { dashscope, onOpenSettings, voiceBackendStatus } = props
  const location = useLocation()

  const currentSectionTitle = useMemo(() => {
    if (location.pathname.startsWith('/dictionary')) {
      return 'Dictionary'
    }

    return 'Home'
  }, [location.pathname])

  return (
    <SidebarProvider defaultOpen className="h-svh bg-background text-foreground">
      <MainSidebar dashscope={dashscope} onOpenSettings={onOpenSettings} />

      <SidebarInset className="h-svh overflow-hidden bg-background">
        <header className="flex h-14 items-center gap-3 border-b border-border/60 px-4">
          <SidebarTrigger />
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Workspace</p>
            <h1 className="text-sm font-semibold">{currentSectionTitle}</h1>
          </div>

          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span
              className={cn(
                'inline-flex h-2.5 w-2.5 rounded-full',
                voiceBackendStatus.ready ? 'bg-emerald-400' : 'bg-amber-400'
              )}
              aria-hidden="true"
            />
            {voiceBackendStatus.label}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <Outlet />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
