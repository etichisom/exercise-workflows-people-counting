import { ArrowUpRight, LayoutDashboard, ListVideo, Moon, MonitorPlay, ScanEye, Sun, Workflow } from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'
import { ExternalLink, HUB_URL, StatusDot } from '@/components/shared'
import { relativeTime } from '@/format'
import type { ConnectionState } from '@/types'

const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'viewer', label: 'Clip viewer', icon: MonitorPlay },
  { id: 'recordings', label: 'Recordings', icon: ListVideo },
] as const

export type SectionId = (typeof sections)[number]['id']

const hubLinks = [
  { label: 'Recordings', href: `${HUB_URL}/media`, icon: ListVideo },
  { label: 'Workflow runs', href: `${HUB_URL}/workflows`, icon: Workflow },
]

export function AppSidebar({ active, total, state, updatedAt, now, theme, onToggleTheme, ...props }: {
  active: SectionId
  total: number
  state: ConnectionState
  updatedAt: Date | null
  now: Date
  theme: 'light' | 'dark'
  onToggleTheme: () => void
} & React.ComponentProps<typeof Sidebar>) {
  const { isMobile, setOpenMobile } = useSidebar()
  const close = () => { if (isMobile) setOpenMobile(false) }

  return <Sidebar collapsible="offcanvas" aria-label="Sidebar" {...props}>
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild size="lg" className="hover:bg-transparent active:bg-transparent">
            <a href="#overview" onClick={close}>
              <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground" aria-hidden="true">
                <ScanEye className="size-4.5" />
              </span>
              <span className="grid leading-tight">
                <span className="text-sm font-semibold">Augment Vision</span>
                <span className="text-xs text-muted-foreground">People counting</span>
              </span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Monitor</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {sections.map(section => <SidebarMenuItem key={section.id}>
              <SidebarMenuButton asChild isActive={active === section.id} tooltip={section.label}>
                <a href={`#${section.id}`} onClick={close} aria-current={active === section.id ? 'location' : undefined}>
                  <section.icon aria-hidden="true" />
                  <span>{section.label}</span>
                </a>
              </SidebarMenuButton>
              {section.id === 'recordings' && <SidebarMenuBadge className="tabular">{total}</SidebarMenuBadge>}
            </SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Kerberos Hub</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {hubLinks.map(link => <SidebarMenuItem key={link.label}>
              <SidebarMenuButton asChild tooltip={link.label}>
                <ExternalLink href={link.href}>
                  <link.icon aria-hidden="true" />
                  <span className="flex-1">{link.label}</span>
                  <ArrowUpRight className="text-muted-foreground" aria-hidden="true" />
                </ExternalLink>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="mt-auto">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onToggleTheme}>
                {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
      <div className="rounded-lg border bg-background p-3">
        <p className="text-sm font-medium">Worker</p>
        <div className="mt-1.5 text-sm text-muted-foreground">
          {state === 'offline'
            ? <StatusDot tone="destructive">Unreachable, retrying</StatusDot>
            : state === 'connecting' || !updatedAt
              ? <StatusDot tone="warning">Connecting…</StatusDot>
              : <StatusDot tone="success" pulse>Live · {relativeTime(updatedAt, now)}</StatusDot>}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Checks for new results every 4 seconds while this tab is open.</p>
      </div>
    </SidebarFooter>
  </Sidebar>
}
