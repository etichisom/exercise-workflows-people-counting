import { ArrowUpRight, ChevronLeft, ChevronRight, Maximize2, Minus, Radio, TrendingDown, TrendingUp, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ExternalLink, StatusDot } from '@/components/shared'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/hooks'
import {
  cameraName, comparePeak, deliveryLabel, hubRecordingUrl, offset, people, recordedLabel, snapshotUrl, visibleSpan,
} from '@/format'
import { clipSeconds, crowdLevel, crowdLevels } from '@/summary'
import type { ResultRecord } from '@/types'

/**
 * The clip as a scrubber: the lit span is when people were in view, and the
 * playhead sits on the frame shown above, the busiest moment.
 */
function ClipScrubber({ record }: { record: ResultRecord }) {
  const length = clipSeconds(record)
  const hasPeople = record.peakCount > 0
  const start = (record.firstSeenSeconds / length) * 100
  const end = Math.min(100, ((record.lastSeenSeconds + (record.sampleSeconds || 0)) / length) * 100)
  const peak = Math.min(100, (record.peakAtSeconds / length) * 100)
  return <div className="flex items-center gap-3 font-mono text-xs text-white/75">
    <span>0:00</span>
    <div className="relative h-1.5 flex-1 rounded-full bg-white/20" role="img"
      aria-label={hasPeople
        ? `People in view ${visibleSpan(record)} of a ${offset(length)} clip, busiest at ${offset(record.peakAtSeconds)}`
        : `Nobody in view during the ${offset(length)} clip`}>
      {hasPeople && <>
        <span className="absolute inset-y-0 rounded-full bg-white/75" style={{ left: `${start}%`, width: `${Math.max(1.5, end - start)}%` }} />
        <span className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${peak}%` }}>
          <span className="size-3.5 rounded-full border-2 border-white bg-black shadow-[0_0_0_4px_rgb(255_255_255/0.3)]" />
        </span>
        <span className={cn('absolute bottom-4 rounded-md bg-white px-1.5 py-0.5 font-medium whitespace-nowrap text-black',
          peak < 12 ? 'left-0' : peak > 88 ? 'right-0' : '-translate-x-1/2')}
          style={peak < 12 || peak > 88 ? undefined : { left: `${peak}%` }} aria-hidden="true">
          Peak {offset(record.peakAtSeconds)}
        </span>
      </>}
    </div>
    <span>{offset(length)}</span>
  </div>
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-sm font-medium">{children}</dd>
  </div>
}

/**
 * The selected clip: its busiest frame as a monitor with a scrubber, beside
 * the count and the facts behind it. Follows the newest clip until the
 * operator picks an older one.
 */
export function Viewer({ record, previous, position, total, isLatest, onPrevious, onNext, onLatest, onExpand }: {
  record: ResultRecord
  previous: ResultRecord | null
  /** 1-based position in the session, oldest first. */
  position: number
  total: number
  isLatest: boolean
  onPrevious: () => void
  onNext: () => void
  onLatest: () => void
  onExpand: () => void
}) {
  const count = useCountUp(record.peakCount)
  const level = crowdLevels.find(entry => entry.level === crowdLevel(record.peakCount))
  const previousPeak = previous ? previous.peakCount : null
  const Trend = previousPeak === null || previousPeak === record.peakCount ? Minus
    : record.peakCount > previousPeak ? TrendingUp : TrendingDown
  const confidence = Math.round(record.maxConfidence * 100)

  return <Card className="gap-0 p-0 py-0 lg:grid lg:grid-cols-[minmax(0,1.9fr)_minmax(18rem,1fr)]">
    <div className="relative isolate aspect-video overflow-hidden bg-black text-white lg:aspect-auto lg:min-h-[26rem]">
      {record.hasSnapshot
        ? <img key={record.runId} src={snapshotUrl(record)} alt={`Busiest frame with ${people(record.peakCount)} boxed`}
          decoding="async" className="absolute inset-0 size-full animate-frame-in object-contain" />
        : <div key={record.runId} className="scene-grid absolute inset-0 flex animate-frame-in flex-col items-center justify-center gap-2 bg-neutral-950 px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/10" aria-hidden="true">
            <UserX className="size-5" />
          </span>
          <p className="text-base font-medium">{record.peakCount > 0 ? 'No frame saved for this clip' : 'No people in view'}</p>
          {record.peakCount === 0 && <p className="max-w-xs text-sm text-white/65">
            {record.framesAnalyzed} frames checked. The strongest person score was {confidence}%, below the detection threshold.
          </p>}
        </div>}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4 pb-10">
        <span className="inline-flex h-7 items-center gap-2 rounded-full bg-black/55 px-3 text-xs font-medium whitespace-nowrap backdrop-blur">
          {isLatest
            ? <StatusDot tone="success" pulse>Latest clip</StatusDot>
            : <StatusDot tone="warning">Reviewing clip {position} of {total}</StatusDot>}
        </span>
        <span className="text-right font-mono text-xs leading-5 text-white/85">
          <span className="block">{recordedLabel(record)}</span>
          <span className="hidden text-white/60 sm:block">{cameraName(record.mediaKey)}</span>
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12">
        <ClipScrubber record={record} />
      </div>

      {record.hasSnapshot && <Button variant="secondary" size="icon-sm" onClick={onExpand}
        className="absolute top-12 right-4 bg-black/55 sm:top-16 text-white backdrop-blur hover:bg-black/75" aria-label="Enlarge this frame">
        <Maximize2 aria-hidden="true" />
      </Button>}
    </div>

    <div className="flex flex-col gap-6 p-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Peak occupancy</p>
          {level && <span className="inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium">
            {level.label}<span className="ml-1.5 font-normal text-muted-foreground">{level.range}</span>
          </span>}
        </div>
        <p className="mt-3 flex items-baseline gap-3" aria-live="polite">
          <span className={cn('tabular text-8xl leading-none font-semibold tracking-tighter', record.peakCount > 0 ? 'text-foreground' : 'text-muted-foreground')}
            aria-hidden="true">{count}</span>
          <span className="sr-only">{people(record.peakCount)} at once</span>
          <span className="text-sm text-muted-foreground" aria-hidden="true">{record.peakCount === 1 ? 'person' : 'people'}<br />at once</span>
        </p>
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Trend className="size-4" aria-hidden="true" />
          {comparePeak(record.peakCount, previousPeak)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-5">
        <Fact label="Busiest at"><span className="font-mono">{record.peakCount > 0 ? offset(record.peakAtSeconds) : '–'}</span></Fact>
        <Fact label="People in view"><span className="font-mono">{record.peakCount > 0 ? visibleSpan(record) : '–'}</span></Fact>
        <Fact label="Best confidence">
          <span className="flex items-center gap-2">
            <span className="font-mono">{confidence}%</span>
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${confidence}%` }} />
            </span>
          </span>
        </Fact>
        <Fact label="Frames analysed"><span className="font-mono">{record.framesAnalyzed}</span></Fact>
        <Fact label="Status">
          <StatusDot tone={record.delivery === 'submitted' ? 'success' : 'muted'}>{deliveryLabel(record.delivery)}</StatusDot>
        </Fact>
        <Fact label="Run"><span className="block truncate font-mono" title={record.runId}>{record.runId.slice(-8)}</span></Fact>
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={onPrevious} disabled={position <= 1} aria-label="Previous clip">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="tabular w-14 text-center font-mono text-xs text-muted-foreground">{position} / {total}</span>
          <Button variant="outline" size="icon" onClick={onNext} disabled={position >= total} aria-label="Next clip">
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        {!isLatest && <Button variant="outline" onClick={onLatest}>
          <Radio data-icon="inline-start" aria-hidden="true" />Latest
        </Button>}
        <Button asChild className="ml-auto">
          <ExternalLink href={hubRecordingUrl(record)}>
            Open in Hub <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          </ExternalLink>
        </Button>
      </div>
    </div>
  </Card>
}
