import { BookText, Home, Settings2 } from 'lucide-react'
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

import type { DashscopeSetupState, SettingsSection } from './types'
import { TrayIcon } from './TrayIcon'

type MainSidebarProps = {
  dashscope: DashscopeSetupState
  onOpenSettings: (section?: SettingsSection) => void
}

export function MainSidebar(props: MainSidebarProps): React.JSX.Element {
  const { dashscope, onOpenSettings } = props
  const location = useLocation()
  const isDictionaryRoute = location.pathname.startsWith('/dictionary')

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 text-primary">
            <TrayIcon className="h-4 w-4" />
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-semibold">TIA Voice</p>
            <p className="text-xs text-muted-foreground">Desktop assistant</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={!isDictionaryRoute} tooltip="Home">
                  <Link to="/">
                    <Home />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isDictionaryRoute} tooltip="Dictionary">
                  <Link to="/dictionary">
                    <BookText />
                    <span>Dictionary</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onOpenSettings()} tooltip="Settings">
                  <Settings2 />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        <div className="group-data-[collapsible=icon]:hidden rounded-lg border border-sidebar-border/70 bg-sidebar-accent/30 p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Provider</p>
          <p className="mt-2 text-sm font-medium">DashScope</p>
          <p className="text-xs text-muted-foreground">
            {dashscope.keyLabel ?? 'No API key saved yet'}
          </p>
          <Button
            className="mt-3 w-full"
            variant="outline"
            onClick={() => onOpenSettings('providers')}
            type="button"
          >
            {dashscope.configured ? 'Manage key' : 'Add key'}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
