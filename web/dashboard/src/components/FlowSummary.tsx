import { ArrowRight, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { offset, people, recordedAt, recordedLabel, relativeTime } from '@/format'
import type { Summary } from '@/summary'
import type { ResultRecord } from '@/types'

function Step({ label, value, unit, percent, caption, highlight = false, action }: {
  label: string
  value: string
  unit?: string
  percent?: number
  caption: string
  highlight?: boolean
  action?: React.ReactNode
}) {
  return <div className={cn('flex min-w-0 flex-1 flex-col gap-2 rounded-xl p-4',
    highlight && 'bg-primary/[0.06] ring-1 ring-primary/15 dark:bg-primary/10')}>
    <div className="flex min-h-7 items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      {action}
    </div>
    <p className="flex items-baseline gap-1.5">
      <span className={cn('tabular text-3xl font-semibold tracking-tight', highlight && 'text-primary')}>{value}</span>
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      {percent !== undefined && <span className="tabular text-sm text-muted-foreground">{percent}%</span>}
    </p>
    <p className="truncate text-sm text-muted-foreground" title={caption}>{caption}</p>
  </div>
}

function Arrow() {
  return <ArrowRight className="hidden size-4 shrink-0 self-center text-muted-foreground/60 xl:block" aria-hidden="true" />
}

/** The pipeline at a glance: every recording, those with people, the busiest one, and what reached Hub. */
export function FlowSummary({ summary, sentToHub, now, onViewBusiest }: {
  summary: Summary
  sentToHub: number
  now: Date
  onViewBusiest: (record: ResultRecord) => void
}) {
  const { total, withPeople, busiest, latest, sharePercent } = summary
  const empty = total - withPeople
  const hubPercent = total ? Math.round((sentToHub / total) * 100) : 0
  return <Card className="gap-0 p-3 py-3" aria-label="Pipeline summary">
    <div className="grid grid-cols-2 gap-1 xl:flex xl:items-stretch">
      <Step label="Analysed" value={String(total)} unit={total === 1 ? 'recording' : 'recordings'}
        caption={latest ? `Latest recorded ${relativeTime(recordedAt(latest), now)}` : 'Waiting for the first recording'} />
      <Arrow />
      <Step label="With people" value={String(withPeople)} percent={sharePercent}
        caption={empty ? `${empty} empty ${empty === 1 ? 'recording' : 'recordings'}` : 'Every recording had people'} />
      <Arrow />
      <Step label="Busiest moment" highlight value={busiest ? String(busiest.peakCount) : '0'}
        unit={busiest && busiest.peakCount === 1 ? 'person' : 'people'}
        caption={busiest ? `${recordedLabel(busiest)} · at ${offset(busiest.peakAtSeconds)}` : 'No people detected yet'}
        action={busiest && <Button size="sm" variant="outline" className="bg-background" onClick={() => onViewBusiest(busiest)}
          aria-label={`View the frame with ${people(busiest.peakCount)}`}>
          View frame <ChevronRight data-icon="inline-end" aria-hidden="true" />
        </Button>} />
      <Arrow />
      <Step label="Sent to Hub" value={String(sentToHub)} percent={hubPercent}
        caption={sentToHub === total ? 'Every result accepted by Hub' : `${total - sentToHub} local test ${total - sentToHub === 1 ? 'run' : 'runs'}`} />
    </div>
    <div className="mx-4 mt-3 mb-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full" role="img"
      aria-label={`${withPeople} of ${total} recordings had people in view`}>
      {withPeople > 0 && <span className="rounded-full bg-primary" style={{ flexGrow: withPeople }} />}
      {empty > 0 && <span className="rounded-full bg-bar" style={{ flexGrow: empty }} />}
      {total === 0 && <span className="flex-1 rounded-full bg-bar" />}
    </div>
  </Card>
}
