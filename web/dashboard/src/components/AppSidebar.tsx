import { ArrowUpRight, Camera, LayoutDashboard, ListVideo, Moon, Sun, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExternalLink, StatusDot, HUB_URL } from '@/components/shared'
import { relativeTime } from '@/format'
import type { ConnectionState } from '@/types'

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; count?: number; external?: boolean }

function NavGroup({ title, items, active }: { title: string; items: NavItem[]; active?: string }) {
  return <div className="space-y-1">
    <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{title}</p>
    <ul className="space-y-0.5">
      {items.map(item => {
        const className = 'group flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground'
        const content = <>
          <item.icon className="size-4 text-muted-foreground group-aria-[current=page]:text-foreground" aria-hidden="true" />
          <span className="flex-1">{item.label}</span>
          {item.count !== undefined && <span className="tabular text-xs text-muted-foreground">{item.count}</span>}
          {item.external && <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden="true" />}
        </>
        return <li key={item.label}>
          {item.external
            ? <ExternalLink href={item.href} className={className}>{content}</ExternalLink>
            : <a href={item.href} aria-current={item.href === active ? 'page' : undefined} className={className}>{content}</a>}
        </li>
      })}
    </ul>
  </div>
}

export function AppSidebar({ total, state, updatedAt, now, theme, onToggleTheme }: {
  total: number
  state: ConnectionState
  updatedAt: Date | null
  now: Date
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}) {
  return <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-background lg:flex" aria-label="Sidebar">
    <div className="flex items-center gap-3 px-5 pt-6 pb-5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-500 text-white shadow-sm" aria-hidden="true">
        <Camera className="size-4.5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Augment Vision</p>
        <p className="text-xs text-muted-foreground">People counting</p>
      </div>
    </div>

    <nav className="flex-1 space-y-6 overflow-y-auto px-3" aria-label="Main">
      <NavGroup title="Monitor" active="#overview" items={[
        { label: 'Overview', href: '#overview', icon: LayoutDashboard },
        { label: 'Recordings', href: '#recordings', icon: ListVideo, count: total },
      ]} />
      <NavGroup title="Kerberos Hub" items={[
        { label: 'Recordings', href: `${HUB_URL}/media`, icon: ListVideo, external: true },
        { label: 'Workflow runs', href: `${HUB_URL}/workflows`, icon: Workflow, external: true },
      ]} />
    </nav>

    <div className="space-y-3 p-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-medium">Worker</p>
        <div className="mt-2 text-sm text-muted-foreground">
          {state === 'offline'
            ? <StatusDot tone="destructive">Unreachable, retrying</StatusDot>
            : state === 'connecting' || !updatedAt
              ? <StatusDot tone="warning">Connecting…</StatusDot>
              : <StatusDot tone="success" pulse>Live · {relativeTime(updatedAt, now)}</StatusDot>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Checks for new results every 4 seconds while this tab is open.</p>
      </div>
      <Button variant="ghost" className="w-full justify-start gap-3 px-3 text-foreground/80" onClick={onToggleTheme}>
        {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </Button>
    </div>
  </aside>
}
