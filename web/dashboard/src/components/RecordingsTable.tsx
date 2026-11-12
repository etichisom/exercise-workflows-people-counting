import { useMemo, useState } from 'react'
import {
  columnVisibilityFeature, createColumnHelper, createPaginatedRowModel, createSortedRowModel, FlexRender,
  rowPaginationFeature, rowSortingFeature, tableFeatures, useTable,
  type ColumnVisibilityState, type SortingState,
} from '@tanstack/react-table'
import {
  ArrowDown, ArrowUp, Play, ArrowUpDown, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Columns3, Copy, EllipsisVertical, MonitorPlay, PanelRight, Search, User, UserX, Users, UsersRound, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExternalLink, Snapshot, StatusDot } from '@/components/shared'
import { cn } from '@/lib/utils'
import { deliveryLabel, hubRecordingUrl, offset, people, recordedLabel, visibleSpan } from '@/format'
import { clipSeconds, crowdLevel, crowdLevels, filterRecordings, tabCounts } from '@/summary'
import type { CrowdLevel, RecordingTab } from '@/summary'
import type { ResultRecord } from '@/types'

const features = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
})

const columnHelper = createColumnHelper<typeof features, ResultRecord>()

const tabs: { value: RecordingTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'people', label: 'With people' },
  { value: 'empty', label: 'Empty' },
  { value: 'hub', label: 'Sent to Hub' },
]

const crowdIcons: Record<CrowdLevel, typeof User> = { empty: UserX, quiet: User, busy: Users, crowded: UsersRound }

/** Busier clips get heavier badges, in the theme's own neutrals. */
const crowdBadge: Record<CrowdLevel, { variant: 'default' | 'secondary' | 'outline'; className: string }> = {
  crowded: { variant: 'default', className: '' },
  busy: { variant: 'secondary', className: 'ring-1 ring-foreground/15' },
  quiet: { variant: 'outline', className: '' },
  empty: { variant: 'outline', className: 'border-dashed text-muted-foreground' },
}

/** When people were in view across the clip, with a dot at the peak. */
function PresenceBar({ record }: { record: ResultRecord }) {
  if (record.peakCount === 0) return <span className="text-muted-foreground">Nobody in view</span>
  const length = clipSeconds(record)
  const start = (record.firstSeenSeconds / length) * 100
  const end = Math.min(100, ((record.lastSeenSeconds + (record.sampleSeconds || 0)) / length) * 100)
  const peak = Math.min(100, (record.peakAtSeconds / length) * 100)
  return <div className="w-40 space-y-1.5">
    <div className="relative h-1.5 rounded-full bg-muted" role="img"
      aria-label={`People visible ${visibleSpan(record)}, peak at ${offset(record.peakAtSeconds)}`}>
      <span className="absolute inset-y-0 rounded-full bg-foreground/45" style={{ left: `${start}%`, width: `${Math.max(2, end - start)}%` }} />
      <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary" style={{ left: `${peak}%` }} />
    </div>
    <p className="font-mono text-xs text-muted-foreground">{visibleSpan(record)} · peak {offset(record.peakAtSeconds)}</p>
  </div>
}

function SortHeader({ label, sorted, onToggle, align = 'left' }: {
  label: string; sorted: false | 'asc' | 'desc'; onToggle: () => void; align?: 'left' | 'right'
}) {
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown
  return <Button variant="ghost" size="sm" onClick={onToggle}
    className={cn('h-7 gap-1 px-1.5 font-medium text-foreground', align === 'right' ? '-mr-1.5 ml-auto flex' : '-ml-1.5')}>
    {label}<Icon className={cn('size-3.5', !sorted && 'text-muted-foreground')} aria-hidden="true" />
  </Button>
}

/**
 * The dashboard-01 data table for recordings: view tabs, search and crowd
 * filter, column picker, sortable columns, a row menu and pagination. Every
 * row opens its drawer.
 */
export function RecordingsTable({ results, newRuns, selectedId, onOpen, onShowInViewer }: {
  results: ResultRecord[]
  newRuns: Set<string>
  /** The clip currently loaded in the viewer. */
  selectedId: string
  onOpen: (record: ResultRecord) => void
  onShowInViewer: (record: ResultRecord) => void
}) {
  const [tab, setTab] = useState<RecordingTab>('all')
  const [query, setQuery] = useState('')
  const [crowd, setCrowd] = useState<CrowdLevel | 'any'>('any')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const counts = useMemo(() => tabCounts(results), [results])
  const data = useMemo(() => filterRecordings(results, { tab, query, crowd }, recordedLabel), [results, tab, query, crowd])
  const filtering = query.trim() !== '' || crowd !== 'any'
  const firstPage = () => setPagination(current => ({ ...current, pageIndex: 0 }))

  const columns = useMemo(() => columnHelper.columns([
    columnHelper.display({
      id: 'play',
      header: () => <span className="sr-only">Show in viewer</span>,
      cell: ({ row }) => <Button variant="outline" size="icon-sm" className="rounded-full"
        onClick={event => { event.stopPropagation(); onShowInViewer(row.original) }}
        aria-label={`Show the ${recordedLabel(row.original)} recording in the viewer`}>
        <Play className="size-3 fill-current" aria-hidden="true" />
      </Button>,
      enableHiding: false,
    }),
    columnHelper.accessor('recordingStart', {
      id: 'recording',
      header: ({ column }) => <SortHeader label="Recording" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === 'asc')} />,
      cell: ({ row }) => <div className="flex items-center gap-3">
        <div className="w-16 shrink-0 overflow-hidden rounded-md border">
          <Snapshot record={row.original} alt="" className="[&_span]:hidden [&_svg]:size-4" />
        </div>
        <div className="min-w-0">
          <button type="button" onClick={event => { event.stopPropagation(); onOpen(row.original) }}
            className="rounded-sm text-left font-medium hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            {recordedLabel(row.original)}
          </button>
          <p className="text-xs text-muted-foreground">Run <span className="font-mono">{row.original.runId.slice(-8)}</span> · {row.original.framesAnalyzed} frames</p>
        </div>
      </div>,
      enableHiding: false,
    }),
    columnHelper.accessor('peakCount', {
      id: 'peak',
      header: ({ column }) => <SortHeader label="Peak" align="right" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === 'asc')} />,
      cell: ({ row }) => <div className="text-right">
        <span className="font-mono text-base font-semibold tabular-nums">{row.original.peakCount}</span>
        <span className="sr-only"> {row.original.peakCount === 1 ? 'person' : 'people'}</span>
      </div>,
    }),
    columnHelper.accessor(record => crowdLevel(record.peakCount), {
      id: 'crowd',
      header: 'Crowd',
      cell: ({ row }) => {
        const level = crowdLevel(row.original.peakCount)
        const Icon = crowdIcons[level]
        return <Badge variant={crowdBadge[level].variant} className={cn('px-1.5', crowdBadge[level].className)}>
          <Icon aria-hidden="true" />{crowdLevels.find(entry => entry.level === level)?.label}
        </Badge>
      },
    }),
    columnHelper.accessor('firstSeenSeconds', {
      id: 'presence',
      header: 'Presence in clip',
      cell: ({ row }) => <PresenceBar record={row.original} />,
      enableSorting: false,
    }),
    columnHelper.accessor('maxConfidence', {
      id: 'confidence',
      header: ({ column }) => <SortHeader label="Confidence" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === 'asc')} />,
      cell: ({ row }) => {
        const percent = Math.round(row.original.maxConfidence * 100)
        return <div className="flex items-center gap-3">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-foreground/60" style={{ width: `${percent}%` }} />
          </div>
          <span className="w-9 text-right font-mono tabular-nums">{percent}%</span>
        </div>
      },
    }),
    columnHelper.accessor('delivery', {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <Badge variant="outline" className="px-1.5 text-muted-foreground">
        <StatusDot tone={row.original.delivery === 'submitted' ? 'success' : 'muted'}>{deliveryLabel(row.original.delivery)}</StatusDot>
      </Badge>,
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
            onClick={event => event.stopPropagation()} aria-label={`Actions for the ${recordedLabel(row.original)} recording`}>
            <EllipsisVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={event => event.stopPropagation()}>
          <DropdownMenuItem onSelect={() => onOpen(row.original)}><PanelRight aria-hidden="true" />Details</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onShowInViewer(row.original)}><MonitorPlay aria-hidden="true" />Show in viewer</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void navigator.clipboard?.writeText(row.original.runId) }}><Copy aria-hidden="true" />Copy run ID</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <ExternalLink href={hubRecordingUrl(row.original)}><ArrowUpRight aria-hidden="true" />Open in Hub</ExternalLink>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
      enableHiding: false,
    }),
  ]), [onOpen, onShowInViewer])

  const table = useTable({
    features,
    data,
    columns,
    state: { sorting, columnVisibility, pagination },
    getRowId: row => row.runId,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
  })

  const rows = table.getRowModel().rows
  const columnCount = table.getVisibleLeafColumns().length

  return <Tabs value={tab} onValueChange={value => { setTab(value as RecordingTab); firstPage() }} className="w-full flex-col justify-start gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
      <Label htmlFor="view-selector" className="sr-only">View</Label>
      <Select value={tab} onValueChange={value => { setTab(value as RecordingTab); firstPage() }}>
        <SelectTrigger className="flex w-fit @4xl/main:hidden" size="sm" id="view-selector"><SelectValue /></SelectTrigger>
        <SelectContent>
          {tabs.map(item => <SelectItem key={item.value} value={item.value}>{item.label} · {counts[item.value]}</SelectItem>)}
        </SelectContent>
      </Select>
      <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex"
        aria-label="Filter recordings">
        {tabs.map(item => <TabsTrigger key={item.value} value={item.value}>
          {item.label} {counts[item.value] > 0 && <Badge variant="secondary" className="tabular-nums">{counts[item.value]}</Badge>}
        </TabsTrigger>)}
      </TabsList>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={event => { setQuery(event.target.value); firstPage() }} type="search"
            placeholder="Search time or run ID" aria-label="Search recordings" className="h-8 pl-8" />
        </div>
        <Select value={crowd} onValueChange={value => { setCrowd(value as CrowdLevel | 'any'); firstPage() }}>
          <SelectTrigger size="sm" className="w-36" aria-label="Filter by crowd size"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any crowd size</SelectItem>
            {crowdLevels.map(level => <SelectItem key={level.level} value={level.level}>{level.label} · {level.range}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtering && <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setCrowd('any'); firstPage() }}>
          <X data-icon="inline-start" aria-hidden="true" />Clear
        </Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 data-icon="inline-start" aria-hidden="true" />
              <span className="hidden lg:inline">Columns</span>
              <ChevronDown data-icon="inline-end" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {table.getAllColumns().filter(column => column.getCanHide()).map(column =>
              <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={value => column.toggleVisibility(!!value)}>
                {{ peak: 'Peak', crowd: 'Crowd', presence: 'Presence in clip', confidence: 'Confidence', status: 'Status' }[column.id] ?? column.id}
              </DropdownMenuCheckboxItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map(group => <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map(header => <TableHead key={header.id} colSpan={header.colSpan}
                className={cn(header.column.id === 'play' && 'w-12 pl-4', header.column.id === 'actions' && 'w-12 pr-4')}>
                {header.isPlaceholder ? null : <FlexRender header={header} />}
              </TableHead>)}
            </TableRow>)}
          </TableHeader>
          <TableBody>
            {rows.length
              ? rows.map(row => <TableRow key={row.id} onClick={() => onOpen(row.original)}
                data-state={row.original.runId === selectedId ? 'selected' : undefined}
                className={cn('cursor-pointer', newRuns.has(row.original.runId) && 'animate-in fade-in-0 bg-primary/[0.04]')}>
                {row.getVisibleCells().map(cell => <TableCell key={cell.id}
                  className={cn('py-3', cell.column.id === 'play' && 'pl-4', cell.column.id === 'actions' && 'pr-4')}>
                  <FlexRender cell={cell} />
                </TableCell>)}
              </TableRow>)
              : <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="size-5 text-muted-foreground" aria-hidden="true" />
                    <p className="font-medium">No recordings match</p>
                    <p className="text-sm text-muted-foreground">Try another view, search or crowd size.</p>
                  </div>
                </TableCell>
              </TableRow>}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-4 px-1">
        <p className="hidden flex-1 text-sm text-muted-foreground lg:block" aria-live="polite">
          {data.length} {data.length === 1 ? 'recording' : 'recordings'}
          {data.length > 0 && ` · ${people(data.reduce((max, record) => Math.max(max, record.peakCount), 0))} at the busiest`}
        </p>
        <div className="flex w-full items-center gap-8 lg:w-fit">
          <div className="hidden items-center gap-2 lg:flex">
            <Label htmlFor="rows-per-page" className="text-sm font-medium">Rows per page</Label>
            <Select value={`${pagination.pageSize}`} onValueChange={value => table.setPageSize(Number(value))}>
              <SelectTrigger size="sm" className="w-20" id="rows-per-page"><SelectValue /></SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 50].map(size => <SelectItem key={size} value={`${size}`}>{size}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="flex w-fit items-center justify-center text-sm font-medium tabular-nums">
            Page {pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </p>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Button variant="outline" size="icon" className="hidden size-8 lg:flex" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} aria-label="Go to first page">
              <ChevronsLeft aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Go to previous page">
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Go to next page">
              <ChevronRight aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" className="hidden size-8 lg:flex" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()} aria-label="Go to last page">
              <ChevronsRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Tabs>
}
