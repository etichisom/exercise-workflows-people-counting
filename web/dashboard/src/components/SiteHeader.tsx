import { ArrowUpRight } from 'lucide-react'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ExternalLink, HUB_URL, StatusDot } from '@/components/shared'
import { relativeTime } from '@/format'
import type { ConnectionState } from '@/types'

export function SiteHeader({ state, updatedAt, now, range }: {
  state: ConnectionState
  updatedAt: Date | null
  now: Date
  range: string
}) {
  return <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:rounded-t-xl">
    <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden md:inline-flex">People counting</BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">
              <h1 className="text-base font-medium">Shop occupancy</h1>
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbItem className="hidden truncate text-muted-foreground xl:inline-flex">· {range}</BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <span className="hidden h-8 items-center rounded-full border px-3 text-sm text-muted-foreground sm:inline-flex" role="status">
        {state === 'offline'
          ? <StatusDot tone="destructive">Worker unreachable</StatusDot>
          : state === 'connecting' || !updatedAt
            ? <StatusDot tone="warning">Connecting…</StatusDot>
            : <StatusDot tone="success" pulse>Live · {relativeTime(updatedAt, now)}</StatusDot>}
      </span>
      <Button asChild size="sm" variant="outline">
        <ExternalLink href={`${HUB_URL}/media`}>
          Open Hub <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
        </ExternalLink>
      </Button>
    </div>
  </header>
}
