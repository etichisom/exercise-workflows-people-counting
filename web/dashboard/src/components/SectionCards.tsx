import { ChevronRight, CircleCheck, Film, FlaskConical, Minus, Send, Trophy, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useCountUp } from '@/hooks'
import { cn } from '@/lib/utils'
import { axisTime, comparePeak, offset, people, recordedAt, relativeTime } from '@/format'
import { crowdLevel, crowdLevels } from '@/summary'
import type { Summary } from '@/summary'
import type { ResultRecord } from '@/types'

function Value({ value, unit }: { value: number; unit?: string }) {
  const shown = useCountUp(value)
  return <CardTitle className="flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
    {shown}
    {unit && <span className={cn('text-sm font-normal tracking-normal text-muted-foreground', unit === '%' && '-ml-1')}>{unit}</span>}
  </CardTitle>
}

function Heading({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return <CardDescription className="flex items-center gap-2">
    <span className="flex size-7 items-center justify-center rounded-md border bg-background text-foreground" aria-hidden="true">
      <Icon className="size-3.5" />
    </span>
    {children}
  </CardDescription>
}

function levelLabel(peak: number): string {
  return crowdLevels.find(entry => entry.level === crowdLevel(peak))?.label ?? ''
}

/** Four session totals in the dashboard-01 card pattern: value, trend badge, two-line footer. */
export function SectionCards({ summary, previous, sentToHub, now, onViewBusiest }: {
  summary: Summary
  /** The clip before the newest one, for the trend. */
  previous: ResultRecord | null
  sentToHub: number
  now: Date
  onViewBusiest: (record: ResultRecord) => void
}) {
  const { total, withPeople, busiest, latest, sharePercent } = summary
  const latestPeak = latest?.peakCount ?? 0
  const change = previous ? latestPeak - previous.peakCount : 0
  const Trend = !previous || change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown
  const local = total - sentToHub

  return <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
    <Card className="@container/card ring-foreground/20">
      <CardHeader>
        <Heading icon={Users}>Latest clip</Heading>
        <Value value={latestPeak} unit={latestPeak === 1 ? 'person' : 'people'} />
        <CardAction>
          <Badge variant="outline"><Trend aria-hidden="true" />{change > 0 ? `+${change}` : change}</Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">{comparePeak(latestPeak, previous?.peakCount ?? null)}</div>
        <div className="text-muted-foreground">{latest ? `Recorded ${relativeTime(recordedAt(latest), now)}` : 'Waiting for a clip'}</div>
      </CardFooter>
    </Card>

    <Card className="@container/card">
      <CardHeader>
        <Heading icon={Trophy}>Busiest moment</Heading>
        <Value value={busiest?.peakCount ?? 0} unit={busiest?.peakCount === 1 ? 'person' : 'people'} />
        {busiest && <CardAction>
          <Badge variant="outline"><Users aria-hidden="true" />{levelLabel(busiest.peakCount)}</Badge>
        </CardAction>}
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        {busiest
          ? <button type="button" onClick={() => onViewBusiest(busiest)}
            aria-label={`Show the clip with ${people(busiest.peakCount)} in the viewer`}
            className="-mx-1 flex items-center gap-1 rounded-sm px-1 font-medium hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            Show in viewer <ChevronRight className="size-4" aria-hidden="true" />
          </button>
          : <div className="font-medium">No people detected yet</div>}
        <div className="text-muted-foreground">
          {busiest ? `Clip at ${axisTime(recordedAt(busiest))}, ${offset(busiest.peakAtSeconds)} in` : 'Across every clip so far'}
        </div>
      </CardFooter>
    </Card>

    <Card className="@container/card">
      <CardHeader>
        <Heading icon={Film}>Clips with people</Heading>
        <Value value={sharePercent} unit="%" />
        <CardAction>
          <Badge variant="outline">{withPeople} of {total}</Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="font-medium">
          {total - withPeople === 0 ? 'Every clip had people' : `${total - withPeople} empty ${total - withPeople === 1 ? 'clip' : 'clips'}`}
        </div>
        <div className="text-muted-foreground">Of {total} {total === 1 ? 'clip' : 'clips'} analysed by YOLO</div>
      </CardFooter>
    </Card>

    <Card className="@container/card">
      <CardHeader>
        <Heading icon={Send}>Delivered to Hub</Heading>
        <Value value={sentToHub} unit={`of ${total}`} />
        <CardAction>
          {local === 0
            ? <Badge variant="outline"><CircleCheck className="text-success" aria-hidden="true" />All accepted</Badge>
            : <Badge variant="outline"><FlaskConical aria-hidden="true" />{local} local</Badge>}
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="font-medium">{local === 0 ? 'Markers and descriptions written' : `${local} local test ${local === 1 ? 'run' : 'runs'}`}</div>
        <div className="text-muted-foreground">Callbacks accepted by the workflow run</div>
      </CardFooter>
    </Card>
  </div>
}
