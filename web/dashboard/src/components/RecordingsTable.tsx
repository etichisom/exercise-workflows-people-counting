import { useMemo, useState } from 'react'
import { ArrowUpRight, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ExternalLink, Snapshot, StatusDot } from '@/components/shared'
import { cn } from '@/lib/utils'
import { deliveryLabel, hubRecordingUrl, offset, people, recordedLabel, visibleSpan } from '@/format'
import { clipSeconds, crowdLevels, filterRecordings, tabCounts } from '@/summary'
import type { CrowdLevel, RecordingTab } from '@/summary'
import type { ResultRecord } from '@/types'

const PAGE_SIZE = 10

const tabs: { value: RecordingTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'people', label: 'With people' },
  { value: 'empty', label: 'Empty' },
  { value: 'hub', label: 'Sent to Hub' },
]

/** When people were in view across the clip, with a tick at the peak. */
function PresenceBar({ record }: { record: ResultRecord }) {
  if (record.peakCount === 0) return <span className="text-sm text-muted-foreground">Nobody in view</span>
  const length = clipSeconds(record)
  const start = (record.firstSeenSeconds / length) * 100
  const end = Math.min(100, ((record.lastSeenSeconds + (record.sampleSeconds || 0)) / length) * 100)
  const peak = Math.min(100, (record.peakAtSeconds / length) * 100)
  return <div className="w-40 space-y-1.5">
    <div className="relative h-1.5 rounded-full bg-muted" role="img"
      aria-label={`People visible ${visibleSpan(record)}, peak at ${offset(record.peakAtSeconds)}`}>
      <span className="absolute inset-y-0 rounded-full bg-primary/70" style={{ left: `${start}%`, width: `${Math.max(2, end - start)}%` }} />
      <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${peak}%` }} />
    </div>
    <p className="tabular text-xs text-muted-foreground">{visibleSpan(record)} · peak {offset(record.peakAtSeconds)}</p>
  </div>
}

function ConfidenceBar({ value }: { value: number }) {
  const percent = Math.round(value * 100)
  return <div className="flex items-center gap-3">
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className="h-full rounded-full bg-foreground/60" style={{ width: `${percent}%` }} />
    </div>
    <span className="tabular w-9 text-right text-sm">{percent}%</span>
  </div>
}

export function RecordingsTable({ results, newRuns, onOpen }: {
  results: ResultRecord[]
  newRuns: Set<string>
  onOpen: (record: ResultRecord) => void
}) {
  const [tab, setTab] = useState<RecordingTab>('all')
  const [query, setQuery] = useState('')
  const [crowd, setCrowd] = useState<CrowdLevel | 'any'>('any')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const counts = useMemo(() => tabCounts(results), [results])
  const filtered = useMemo(() => filterRecordings(results, { tab, query, crowd }, recordedLabel), [results, tab, query, crowd])
  const shown = filtered.slice(0, visible)
  const filtering = query.trim() !== '' || crowd !== 'any'
  const resetPage = () => setVisible(PAGE_SIZE)

  return <Card className="gap-0 overflow-hidden py-0">
    <div className="flex flex-col gap-3 border-b px-4 pt-3 lg:flex-row lg:items-end lg:justify-between">
      <Tabs value={tab} onValueChange={value => { setTab(value as RecordingTab); resetPage() }}>
        <TabsList variant="line" className="h-11 gap-2 overflow-x-auto" aria-label="Filter recordings">
          {tabs.map(item => <TabsTrigger key={item.value} value={item.value} className="gap-2 px-2">
            {item.label}
            <span className="tabular rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{counts[item.value]}</span>
          </TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={event => { setQuery(event.target.value); resetPage() }}
            placeholder="Search time or run ID" aria-label="Search recordings" className="pl-8" type="search" />
        </div>
        <Select value={crowd} onValueChange={value => { setCrowd(value as CrowdLevel | 'any'); resetPage() }}>
          <SelectTrigger className="w-40" aria-label="Filter by crowd size"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any crowd size</SelectItem>
            {crowdLevels.map(level => <SelectItem key={level.level} value={level.level}>{level.label} · {level.range}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtering && <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setCrowd('any'); resetPage() }}>
          <X data-icon="inline-start" aria-hidden="true" />Clear
        </Button>}
      </div>
    </div>

    {filtered.length === 0
      ? <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
        <Search className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">No recordings match</p>
        <p className="text-sm text-muted-foreground">Try another tab, search or crowd size.</p>
      </div>
      : <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4">Recording</TableHead>
            <TableHead className="text-right">Peak</TableHead>
            <TableHead>Presence in clip</TableHead>
            <TableHead>Best confidence</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map(record => <TableRow key={record.runId} onClick={() => onOpen(record)}
            className={cn('cursor-pointer', newRuns.has(record.runId) && 'animate-in fade-in-0 bg-primary/[0.04]')}>
            <TableCell className="py-3 pl-4">
              <div className="flex items-center gap-3">
                <div className="w-16 shrink-0 overflow-hidden rounded-md border">
                  <Snapshot record={record} alt="" className="[&_span]:hidden [&_svg]:size-4" />
                </div>
                <div className="min-w-0">
                  <button type="button" onClick={event => { event.stopPropagation(); onOpen(record) }}
                    className="rounded-sm text-left font-medium hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                    {recordedLabel(record)}
                  </button>
                  <p className="text-xs text-muted-foreground">Run <span className="font-mono">{record.runId.slice(-8)}</span> · {record.framesAnalyzed} frames</p>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right">
              <span className="tabular text-base font-semibold">{record.peakCount}</span>
              <span className="sr-only"> {record.peakCount === 1 ? 'person' : 'people'}</span>
            </TableCell>
            <TableCell><PresenceBar record={record} /></TableCell>
            <TableCell><ConfidenceBar value={record.maxConfidence} /></TableCell>
            <TableCell>
              <StatusDot tone={record.delivery === 'submitted' ? 'success' : 'muted'}>{deliveryLabel(record.delivery)}</StatusDot>
            </TableCell>
            <TableCell className="pr-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" asChild onClick={event => event.stopPropagation()}>
                    <ExternalLink href={hubRecordingUrl(record)}
                      aria-label={`Open the ${recordedLabel(record)} recording in Hub (opens in a new tab)`}>
                      <ArrowUpRight aria-hidden="true" />
                    </ExternalLink>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in Hub</TooltipContent>
              </Tooltip>
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table>}

    <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span className="tabular" aria-live="polite">Showing {shown.length} of {filtered.length} {filtered.length === 1 ? 'recording' : 'recordings'}</span>
      {filtered.length > shown.length && <Button variant="outline" size="sm" onClick={() => setVisible(count => count + PAGE_SIZE)}>
        Show {Math.min(PAGE_SIZE, filtered.length - shown.length)} more
      </Button>}
      {filtered.length <= shown.length && filtered.length > 0 && <span>{people(filtered.reduce((max, r) => Math.max(max, r.peakCount), 0))} at the busiest</span>}
    </div>
  </Card>
}
