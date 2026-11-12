import { useEffect, useRef } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Maximize2, Minus, Radio, TrendingDown, TrendingUp, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ExternalLink, StatusDot } from '@/components/shared'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/hooks'
import {
  axisTime, cameraName, comparePeak, deliveryLabel, hubRecordingUrl, offset, people, recordedAt, recordedLabel, snapshotUrl, visibleSpan,
} from '@/format'
import { clipSeconds, crowdLevel, crowdLevels } from '@/summary'
import type { ResultRecord } from '@/types'

/**
 * The clip as a track: the shaded span is when people were in view and the
 * marker is the busiest moment, the frame shown above.
 */
function PresenceTrack({ record }: { record: ResultRecord }) {
  const length = clipSeconds(record)
  const hasPeople = record.peakCount > 0
  const start = (record.firstSeenSeconds / length) * 100
  const end = Math.min(100, ((record.lastSeenSeconds + (record.sampleSeconds || 0)) / length) * 100)
  const peak = Math.min(100, (record.peakAtSeconds / length) * 100)
  return <div className="space-y-2">
    <div className="relative h-2 rounded-full bg-muted" role="img"
      aria-label={hasPeople
        ? `People in view ${visibleSpan(record)} of a ${offset(length)} clip, busiest at ${offset(record.peakAtSeconds)}`
        : `Nobody in view during the ${offset(length)} clip`}>
      {hasPeople && <>
        <span className="absolute inset-y-0 rounded-full bg-foreground/20" style={{ left: `${start}%`, width: `${Math.max(1.5, end - start)}%` }} />
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow-sm"
          style={{ left: `${peak}%` }} />
      </>}
    </div>
    <div className="flex items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
      <span>0:00</span>
      <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-sans">
        {hasPeople
          ? <>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-foreground/20" aria-hidden="true" />In view <span className="font-mono">{visibleSpan(record)}</span></span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" aria-hidden="true" />Peak <span className="font-mono">{offset(record.peakAtSeconds)}</span></span>
          </>
          : 'Nobody in view'}
      </span>
      <span>{offset(length)}</span>
    </div>
  </div>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 py-2.5">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
  </div>
}

/** Every clip of the session as thumbnails; arrow keys step through them. */
function ClipStrip({ records, selectedId, onSelect }: {
  records: ResultRecord[]
  selectedId: string
  onSelect: (record: ResultRecord) => void
}) {
  const strip = useRef<HTMLDivElement>(null)

  // Keep the selected thumbnail in view without moving the page.
  useEffect(() => {
    const container = strip.current
    const item = container?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!container || !item) return
    const left = item.offsetLeft - 8
    const right = item.offsetLeft + item.offsetWidth + 8
    if (left < container.scrollLeft) container.scrollLeft = left
    else if (right > container.scrollLeft + container.clientWidth) container.scrollLeft = right - container.clientWidth
  }, [selectedId, records.length])

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = records.findIndex(record => record.runId === selectedId)
    const next = event.key === 'ArrowLeft' ? index - 1 : event.key === 'ArrowRight' ? index + 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? records.length - 1 : -1
    if (next < 0 || next >= records.length || next === index) return
    event.preventDefault()
    onSelect(records[next])
    strip.current?.querySelectorAll<HTMLElement>('button[data-clip]')[next]?.focus()
  }

  return <div ref={strip} onKeyDown={onKeyDown} role="group" aria-label="Clips in this session, oldest to newest"
    className="-mx-1 flex w-full gap-3 overflow-x-auto px-1 py-1">
    {records.map(record => {
      const selected = record.runId === selectedId
      return <button key={record.runId} type="button" data-clip aria-pressed={selected} onClick={() => onSelect(record)}
        aria-label={`${recordedLabel(record)}: ${people(record.peakCount)}`}
        className="group flex w-32 shrink-0 flex-col gap-1.5 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className={cn('relative block aspect-video w-full overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10 transition',
          selected ? 'ring-2 ring-primary' : 'opacity-70 group-hover:opacity-100')}>
          {record.hasSnapshot
            ? <img src={snapshotUrl(record)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
            : <span className="flex size-full items-center justify-center text-muted-foreground"><UserX className="size-4" aria-hidden="true" /></span>}
          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 font-mono text-[11px] leading-5 text-white" aria-hidden="true">
            {record.peakCount}
          </span>
        </span>
        <span className={cn('font-mono text-xs', selected ? 'font-medium text-foreground' : 'text-muted-foreground')} aria-hidden="true">
          {axisTime(recordedAt(record))}
        </span>
      </button>
    })}
  </div>
}

/**
 * The selected clip in one card: header with clip navigation, the busiest
 * frame and its presence track beside the count and facts, and every clip of
 * the session as thumbnails. Follows the newest clip until one is picked.
 */
export function Viewer({ records, index, isLatest, onSelect, onLatest, onExpand }: {
  /** Oldest first. */
  records: ResultRecord[]
  index: number
  isLatest: boolean
  onSelect: (record: ResultRecord) => void
  onLatest: () => void
  onExpand: () => void
}) {
  const record = records[index]
  const previous = records[index - 1] ?? null
  const count = useCountUp(record.peakCount)
  const level = crowdLevels.find(entry => entry.level === crowdLevel(record.peakCount))
  const previousPeak = previous ? previous.peakCount : null
  const Trend = previousPeak === null || previousPeak === record.peakCount ? Minus
    : record.peakCount > previousPeak ? TrendingUp : TrendingDown
  const confidence = Math.round(record.maxConfidence * 100)
  const hasPeople = record.peakCount > 0

  return <Card className="@container/viewer">
    <CardHeader>
      <CardTitle className="flex flex-wrap items-center gap-2">
        Clip viewer
        <Badge variant="outline" className="font-normal">
          {isLatest ? <StatusDot tone="success" pulse>Latest clip</StatusDot> : <StatusDot tone="warning">Reviewing an older clip</StatusDot>}
        </Badge>
      </CardTitle>
      <CardDescription>
        {recordedLabel(record)} · {cameraName(record.mediaKey)} · clip {index + 1} of {records.length}
      </CardDescription>
      <CardAction className="flex items-center gap-2">
        {!isLatest && <Button variant="outline" size="sm" onClick={onLatest}>
          <Radio data-icon="inline-start" aria-hidden="true" />Latest
        </Button>}
        <div className="flex items-center">
          <Button variant="outline" size="icon-sm" className="rounded-r-none" onClick={() => onSelect(records[index - 1])}
            disabled={index <= 0} aria-label="Previous clip">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon-sm" className="-ml-px rounded-l-none" onClick={() => onSelect(records[index + 1])}
            disabled={index >= records.length - 1} aria-label="Next clip">
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </CardAction>
    </CardHeader>

    <CardContent className="grid gap-6 @3xl/viewer:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="space-y-4">
        <div className={cn('group/frame relative aspect-video overflow-hidden rounded-lg ring-1 ring-foreground/10', record.hasSnapshot ? 'bg-black' : 'bg-muted/60')}>
          {record.hasSnapshot
            ? <img key={record.runId} src={snapshotUrl(record)} alt={`Busiest frame with ${people(record.peakCount)} boxed`}
              decoding="async" className="absolute inset-0 size-full animate-frame-in object-contain" />
            : <div key={record.runId} className="scene-grid absolute inset-0 flex animate-frame-in flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground" aria-hidden="true">
                <UserX className="size-5" />
              </span>
              <p className="font-medium">{hasPeople ? 'No frame saved for this clip' : 'No people in view'}</p>
              {!hasPeople && <p className="max-w-xs text-sm text-muted-foreground">
                {record.framesAnalyzed} frames checked; the strongest person score was {confidence}%, below the detection threshold.
              </p>}
            </div>}
          {record.hasSnapshot && <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="icon-sm" onClick={onExpand} aria-label="Open this frame with details"
                className="absolute top-3 right-3 bg-black/60 text-white opacity-0 backdrop-blur transition-opacity group-hover/frame:opacity-100 hover:bg-black/80 focus-visible:opacity-100">
                <Maximize2 aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Details</TooltipContent>
          </Tooltip>}
        </div>
        <PresenceTrack record={record} />
      </div>

      <div className="flex flex-col">
        <p className="text-sm text-muted-foreground">Peak occupancy</p>
        <div className="mt-1 flex items-end gap-3" aria-live="polite">
          <span className={cn('text-6xl leading-none font-semibold tracking-tight tabular-nums', !hasPeople && 'text-muted-foreground')}
            aria-hidden="true">{count}</span>
          <span className="sr-only">{people(record.peakCount)} at once</span>
          <span className="pb-1 text-sm text-muted-foreground" aria-hidden="true">{record.peakCount === 1 ? 'person' : 'people'} at once</span>
          {level && <Badge variant="secondary" className="mb-1 ml-auto">{level.label}</Badge>}
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Trend className="size-4" aria-hidden="true" />{comparePeak(record.peakCount, previousPeak)}
        </p>

        <Separator className="my-4" />

        <dl className="divide-y text-sm">
          <Row label="Busiest at">{hasPeople ? <span className="font-mono">{offset(record.peakAtSeconds)}</span> : <span className="font-normal text-muted-foreground">Not detected</span>}</Row>
          <Row label="People in view">{hasPeople ? <span className="font-mono">{visibleSpan(record)}</span> : <span className="font-normal text-muted-foreground">Never</span>}</Row>
          <Row label="Best confidence">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${confidence}%` }} />
              </span>
              <span className="font-mono">{confidence}%</span>
            </span>
          </Row>
          <Row label="Frames analysed"><span className="font-mono">{record.framesAnalyzed}</span></Row>
          <Row label="Status">
            <StatusDot tone={record.delivery === 'submitted' ? 'success' : 'muted'} className="justify-end">{deliveryLabel(record.delivery)}</StatusDot>
          </Row>
          <Row label="Run"><span className="font-mono" title={record.runId}>{record.runId.slice(-8)}</span></Row>
        </dl>

        <Button asChild variant="outline" className="mt-4 w-full">
          <ExternalLink href={hubRecordingUrl(record)}>
            Open recording in Hub <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          </ExternalLink>
        </Button>
      </div>
    </CardContent>

    {records.length > 1 && <CardFooter className="flex-col items-start gap-2">
      <p className="text-xs font-medium text-muted-foreground">This session · {records.length} clips</p>
      <ClipStrip records={records} selectedId={record.runId} onSelect={onSelect} />
    </CardFooter>}
  </Card>
}
