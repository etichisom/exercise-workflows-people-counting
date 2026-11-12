import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TriangleAlert, Video } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { AppSidebar } from '@/components/AppSidebar'
import { CrowdDonut } from '@/components/CrowdDonut'
import { InsightStats } from '@/components/InsightStats'
import { LatestFrame } from '@/components/LatestFrame'
import type { SectionId } from '@/components/AppSidebar'
import { OccupancyChart } from '@/components/OccupancyChart'
import { RecordingDrawer } from '@/components/RecordingDrawer'
import { RecordingsTable } from '@/components/RecordingsTable'
import { SectionCards } from '@/components/SectionCards'
import { SiteHeader } from '@/components/SiteHeader'
import { Viewer } from '@/components/Viewer'
import { prefersReducedMotion, useActiveSection, useNow, useResults, useTheme } from '@/hooks'
import { recordedAt } from '@/format'
import { chronological, summarize } from '@/summary'
import type { ResultRecord } from '@/types'

const dateRange = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const SECTIONS: readonly SectionId[] = ['overview', 'viewer', 'recordings']

function LoadingState() {
  return <div className="space-y-6 px-4 lg:px-6" aria-busy="true" aria-label="Loading results">
    <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {[0, 1, 2, 3].map(key => <Skeleton key={key} className="h-36 rounded-xl" />)}
    </div>
    <Skeleton className="h-80 rounded-xl" />
    <Skeleton className="h-[26rem] rounded-xl" />
  </div>
}

function EmptyState() {
  return <div className="px-4 lg:px-6">
    <Card className="items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
        <Video className="size-5" />
      </span>
      <h2 className="text-lg font-semibold">No recordings processed yet</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        When the Agent records a clip and Hub forwards it, the worker counts the people in it and the result appears here within a few seconds.
      </p>
    </Card>
  </div>
}

function SectionTitle({ id, title, description }: { id: string; title: string; description: string }) {
  return <div className="space-y-0.5 px-4 lg:px-6">
    <h2 id={id} className="text-base font-semibold">{title}</h2>
    <p className="text-sm text-muted-foreground">{description}</p>
  </div>
}

export function App() {
  const [theme, toggleTheme] = useTheme()
  const { results, state, updatedAt } = useResults()
  const now = useNow()
  const active = useActiveSection(SECTIONS)
  // The viewer follows the newest clip until an older one is picked.
  const [pinned, setPinned] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<ResultRecord | null>(null)

  const list = useMemo(() => results ?? [], [results])
  const summary = useMemo(() => summarize(list), [list])
  const ordered = useMemo(() => chronological(list), [list])
  const sentToHub = useMemo(() => list.filter(record => record.delivery === 'submitted').length, [list])

  // Highlight recordings that arrive after the first load. Rendering reads the
  // previous set; the effect records what has been shown.
  const seen = useRef<Set<string> | null>(null)
  const previous = seen.current
  const newRuns = new Set(previous && results ? results.filter(r => !previous.has(r.runId)).map(r => r.runId) : [])
  useEffect(() => {
    if (results) seen.current = new Set(results.map(record => record.runId))
  }, [results])

  const latest = ordered[ordered.length - 1] ?? null
  const pinnedIndex = pinned === null ? -1 : ordered.findIndex(record => record.runId === pinned)
  const index = pinnedIndex >= 0 ? pinnedIndex : ordered.length - 1
  const selected = ordered[index] ?? null
  const isLatest = selected !== null && selected === latest

  const scrollAfterClose = useRef(false)
  const scrollToViewer = () => document.getElementById('viewer')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  // On close the drawer returns focus to the row that opened it, which would
  // scroll the page back to the table. When the viewer was asked for, focus
  // and scroll go to the viewer instead.
  const onDrawerCloseFocus = (event: Event) => {
    if (!scrollAfterClose.current) return
    scrollAfterClose.current = false
    event.preventDefault()
    document.getElementById('viewer')?.focus({ preventScroll: true })
    scrollToViewer()
  }

  const select = useCallback((record: ResultRecord) => setPinned(record === latest ? null : record.runId), [latest])
  const showInViewer = useCallback((record: ResultRecord) => {
    select(record)
    if (drawer) {
      scrollAfterClose.current = true
      setDrawer(null)
    } else scrollToViewer()
  }, [select, drawer])

  const range = ordered.length
    ? `${ordered.length} ${ordered.length === 1 ? 'clip' : 'clips'}, ${dateRange.format(recordedAt(ordered[0]))} to ${dateRange.format(recordedAt(ordered[ordered.length - 1]))}`
    : 'Waiting for the first clip'

  return <SidebarProvider style={{
    '--sidebar-width': 'calc(var(--spacing) * 64)',
    '--header-height': 'calc(var(--spacing) * 14)',
  } as React.CSSProperties}>
    <a href="#main" className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-3 focus:ring-ring/50">
      Skip to content
    </a>
    <AppSidebar variant="inset" active={active} total={summary.total} state={state} updatedAt={updatedAt} now={now}
      theme={theme} onToggleTheme={toggleTheme} />

    <SidebarInset id="main" className="min-w-0">
      <SiteHeader state={state} updatedAt={updatedAt} now={now} />
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="space-y-1 px-4 lg:px-6">
          <h1 className="text-2xl font-semibold tracking-tight">Shop occupancy</h1>
          <p className="text-sm text-muted-foreground">People counted in each recording by the YOLO workflow stage · {range}</p>
        </div>
        {state === 'offline' && <div className="px-4 lg:px-6">
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-medium">Can’t reach the worker</p>
              <p className="text-muted-foreground">
                {results ? 'Showing the last results received. ' : ''}Retrying every few seconds. Check that the worker is running with RESULTS_DIR and DASHBOARD_ADDR set.
              </p>
            </div>
          </div>
        </div>}

        {results === null ? (state === 'offline' ? null : <LoadingState />)
          : selected === null ? <EmptyState />
            : <>
              <section id="overview" aria-label="Overview" className="flex scroll-mt-20 flex-col gap-4 md:gap-6">
                <SectionCards summary={summary} previous={ordered[ordered.length - 2] ?? null} sentToHub={sentToHub} now={now}
                  onViewBusiest={showInViewer} />
                <div className="grid gap-4 px-4 md:gap-6 lg:px-6 @5xl/main:grid-cols-[minmax(0,1fr)_22rem]">
                  <div className="flex min-w-0 flex-col gap-4">
                    <OccupancyChart records={ordered} selectedId={selected.runId} onSelect={select} />
                    <InsightStats summary={summary} ordered={ordered} />
                  </div>
                  <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:flex @5xl/main:flex-col">
                    {latest && <LatestFrame record={latest} now={now} onOpen={showInViewer} />}
                    <CrowdDonut results={list} />
                  </div>
                </div>
              </section>

              <section id="viewer" tabIndex={-1} aria-label="Clip viewer" className="scroll-mt-20 px-4 outline-none lg:px-6">
                <Viewer records={ordered} index={index} isLatest={isLatest} onSelect={select}
                  onLatest={() => setPinned(null)} onExpand={() => setDrawer(selected)} />
              </section>

              <section id="recordings" aria-labelledby="recordings-title" className="flex scroll-mt-20 flex-col gap-3">
                <SectionTitle id="recordings-title" title="Recordings" description="Every clip the worker analysed. Open a row for its peak frame and details." />
                <RecordingsTable results={list} newRuns={newRuns} selectedId={selected.runId} onOpen={setDrawer} onShowInViewer={showInViewer} />
              </section>
            </>}
      </div>
    </SidebarInset>

    <RecordingDrawer record={drawer} onClose={() => setDrawer(null)} onCloseAutoFocus={onDrawerCloseFocus} onShowInViewer={showInViewer} />
  </SidebarProvider>
}
