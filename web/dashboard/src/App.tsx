import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Camera, ChevronRight, Moon, Sun, TriangleAlert, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AppSidebar } from '@/components/AppSidebar'
import { CrowdBreakdown } from '@/components/CrowdBreakdown'
import { FlowSummary } from '@/components/FlowSummary'
import { PeakChart } from '@/components/PeakChart'
import { RecordingDialog } from '@/components/RecordingDialog'
import { RecordingsTable } from '@/components/RecordingsTable'
import { ExternalLink, HUB_URL, StatusDot } from '@/components/shared'
import { useNow, useResults, useTheme } from '@/hooks'
import { recordedAt, relativeTime } from '@/format'
import { chronological, summarize } from '@/summary'
import type { ConnectionState, ResultRecord } from '@/types'

const dateRange = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function LiveStatus({ state, updatedAt, now }: { state: ConnectionState; updatedAt: Date | null; now: Date }) {
  return <span className="hidden h-8 items-center rounded-full border bg-background px-3 text-sm text-muted-foreground sm:inline-flex" role="status">
    {state === 'offline'
      ? <StatusDot tone="destructive">Worker unreachable</StatusDot>
      : state === 'connecting' || !updatedAt
        ? <StatusDot tone="warning">Connecting…</StatusDot>
        : <StatusDot tone="success" pulse>Live · {relativeTime(updatedAt, now)}</StatusDot>}
  </span>
}

function LoadingState() {
  return <div className="space-y-6" aria-busy="true" aria-label="Loading results">
    <Skeleton className="h-36 rounded-xl" />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <Skeleton className="h-80 rounded-xl" /><Skeleton className="h-80 rounded-xl" />
    </div>
    <Skeleton className="h-96 rounded-xl" />
  </div>
}

function EmptyState() {
  return <Card className="items-center gap-3 px-6 py-16 text-center">
    <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
      <Video className="size-5" />
    </span>
    <h2 className="text-lg font-semibold">No recordings processed yet</h2>
    <p className="max-w-md text-sm text-muted-foreground">
      When the Agent records a clip and Hub forwards it, the worker counts the people in it and the result appears here within a few seconds.
    </p>
  </Card>
}

export function App() {
  const [theme, toggleTheme] = useTheme()
  const { results, state, updatedAt } = useResults()
  const now = useNow()
  const [selected, setSelected] = useState<ResultRecord | null>(null)

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

  const range = ordered.length
    ? `${ordered.length} ${ordered.length === 1 ? 'recording' : 'recordings'} from ${dateRange.format(recordedAt(ordered[0]))} to ${dateRange.format(recordedAt(ordered[ordered.length - 1]))}`
    : 'Live results from the people counting workflow stage'

  return <div className="flex min-h-svh">
    <a href="#main" className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-3 focus:ring-ring/50">
      Skip to content
    </a>
    <AppSidebar total={summary.total} state={state} updatedAt={updatedAt} now={now} theme={theme} onToggleTheme={toggleTheme} />

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6 lg:px-10">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-500 text-white lg:hidden" aria-hidden="true">
          <Camera className="size-4" />
        </div>
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex items-center gap-1.5 text-sm">
            <li className="hidden text-muted-foreground sm:block">Augment Vision</li>
            <li className="hidden text-muted-foreground/60 sm:block" aria-hidden="true"><ChevronRight className="size-3.5" /></li>
            <li className="truncate font-medium" aria-current="page">Shop occupancy</li>
          </ol>
        </nav>
        <LiveStatus state={state} updatedAt={updatedAt} now={now} />
        <Button variant="outline" size="icon" className="lg:hidden" onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </Button>
        <Button asChild>
          <ExternalLink href={`${HUB_URL}/media`}>
            Open Hub <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          </ExternalLink>
        </Button>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-10">
        <section id="overview" aria-labelledby="page-title" className="scroll-mt-24 space-y-1">
          <h1 id="page-title" className="text-3xl font-semibold tracking-tight">Shop occupancy</h1>
          <p className="text-muted-foreground">{range}</p>
        </section>

        {state === 'offline' && <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Can’t reach the worker</p>
            <p className="text-muted-foreground">
              {results ? 'Showing the last results received. ' : ''}Retrying every few seconds. Check that the worker is running with RESULTS_DIR and DASHBOARD_ADDR set.
            </p>
          </div>
        </div>}

        {results === null ? (state === 'offline' ? null : <LoadingState />)
          : summary.total === 0 ? <EmptyState />
            : <>
              <FlowSummary summary={summary} sentToHub={sentToHub} now={now} onViewBusiest={setSelected} />
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                <PeakChart records={ordered} />
                <CrowdBreakdown results={list} />
              </div>
              <section id="recordings" aria-labelledby="recordings-title" className="scroll-mt-24 space-y-3">
                <h2 id="recordings-title" className="sr-only">Recordings</h2>
                <RecordingsTable results={list} newRuns={newRuns} onOpen={setSelected} />
              </section>
            </>}
      </main>
    </div>

    <RecordingDialog record={selected} onClose={() => setSelected(null)} />
  </div>
}
