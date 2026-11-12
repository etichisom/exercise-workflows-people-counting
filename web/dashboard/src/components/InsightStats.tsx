import { Activity, ChartColumn, Clock, Minus, Percent, TrendingDown, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { axisTime, offset, people, recordedAt } from '@/format'
import { clipSeconds, occupancyTrend } from '@/summary'
import type { Summary } from '@/summary'
import type { ResultRecord } from '@/types'

function Stat({ icon: Icon, label, value, detail }: {
  icon: typeof Clock
  label: string
  value: React.ReactNode
  detail: string
}) {
  return <Card size="sm" className="flex-row items-center gap-3 px-3">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50" aria-hidden="true">
      <Icon className="size-4" />
    </span>
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-base font-semibold tabular-nums">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  </Card>
}

const trendIcons = { increasing: TrendingUp, decreasing: TrendingDown, steady: Minus }
const trendLabels = { increasing: 'Increasing', decreasing: 'Decreasing', steady: 'Steady' }

/** Four derived figures under the chart: average, busiest period, how often people were in view, direction. */
export function InsightStats({ summary, ordered }: { summary: Summary; ordered: ResultRecord[] }) {
  const { busiest, averagePeak, sharePercent, withPeople, total } = summary
  const trend = occupancyTrend(ordered)
  const busiestStart = busiest ? recordedAt(busiest) : null

  return <div className="@container/stats">
    <div className="grid grid-cols-1 gap-4 @sm/stats:grid-cols-2 @3xl/stats:grid-cols-4">
    <Stat icon={Clock} label="Avg. occupancy"
      value={<>{averagePeak} <span className="text-sm font-normal text-muted-foreground">people</span></>}
      detail="Mean peak, clips with people" />
    <Stat icon={ChartColumn} label="Busiest period"
      value={busiestStart ? <span className="font-mono">{axisTime(busiestStart)}</span> : '–'}
      detail={busiest ? `${people(busiest.peakCount)} · ${offset(clipSeconds(busiest))} clip` : 'No people yet'} />
    <Stat icon={Percent} label="Occupancy rate" value={`${sharePercent}%`} detail={`${withPeople} of ${total} clips had people`} />
    <Stat icon={trend ? trendIcons[trend] : Activity} label="Trend" value={trend ? trendLabels[trend] : 'Not enough clips'}
      detail="Latest vs. earlier clips" />
    </div>
  </div>
}
