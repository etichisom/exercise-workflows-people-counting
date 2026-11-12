import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { axisTime, people, recordedAt, recordedLabel } from '@/format'
import { niceScale } from '@/summary'
import type { ResultRecord } from '@/types'

const chartConfig = {
  peak: { label: 'Peak people', color: 'var(--primary)' },
} satisfies ChartConfig

const ranges = [
  { value: 'all', label: 'All clips', count: Infinity },
  { value: '20', label: 'Last 20', count: 20 },
  { value: '10', label: 'Last 10', count: 10 },
] as const

type Range = (typeof ranges)[number]['value']

/**
 * Peak people per clip as the dashboard-01 interactive area chart. The
 * selected clip carries a ring; clicking a point loads that clip.
 */
export function OccupancyChart({ records, selectedId, onSelect }: {
  /** Oldest first. */
  records: ResultRecord[]
  selectedId: string
  onSelect: (record: ResultRecord) => void
}) {
  const [range, setRange] = useState<Range>('all')
  const count = ranges.find(entry => entry.value === range)?.count ?? Infinity
  const visible = records.slice(Math.max(0, records.length - count))
  const data = visible.map(record => ({ runId: record.runId, time: axisTime(recordedAt(record)), label: recordedLabel(record), peak: record.peakCount }))
  const scale = niceScale(Math.max(0, ...visible.map(record => record.peakCount)))
  const selectedIndex = visible.findIndex(record => record.runId === selectedId)
  const busiest = visible.reduce<ResultRecord | null>((best, record) => (!best || record.peakCount >= best.peakCount ? record : best), null)
  const pick = (value: string) => { if (value) setRange(value as Range) }

  return <Card className="@container/card">
    <CardHeader>
      <CardTitle>Occupancy over time</CardTitle>
      <CardDescription>
        <span className="hidden @[540px]/card:block">
          Most people visible at once in each clip, oldest to newest{busiest ? `. Busiest: ${people(busiest.peakCount)}.` : '.'}
        </span>
        <span className="@[540px]/card:hidden">Oldest to newest</span>
      </CardDescription>
      <CardAction>
        <ToggleGroup type="single" value={range} onValueChange={pick} variant="outline"
          className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex" aria-label="Clips to show">
          {ranges.map(entry => <ToggleGroupItem key={entry.value} value={entry.value}>{entry.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <Select value={range} onValueChange={pick}>
          <SelectTrigger size="sm" className="flex w-32 @[767px]/card:hidden" aria-label="Clips to show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {ranges.map(entry => <SelectItem key={entry.value} value={entry.value} className="rounded-lg">{entry.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardAction>
    </CardHeader>
    <CardContent className="px-2 pt-2 sm:px-6">
      <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full"
        aria-label={`Area chart of peak people in ${visible.length} clips${busiest ? `; the busiest had ${people(busiest.peakCount)}` : ''}.`}>
        <AreaChart data={data} margin={{ top: 12, left: 0, right: 12 }} className="cursor-pointer"
          onClick={state => {
            const index = Number(state?.activeTooltipIndex)
            if (Number.isInteger(index) && visible[index]) onSelect(visible[index])
          }}>
          <defs>
            <linearGradient id="fillPeak" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-peak)" stopOpacity={0.5} />
              <stop offset="95%" stopColor="var(--color-peak)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} className="font-mono" />
          <YAxis width={28} allowDecimals={false} domain={[0, scale.max]} tickLine={false} axisLine={false} tickMargin={4} />
          <ChartTooltip cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '4 4' }}
            content={<ChartTooltipContent indicator="dot"
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''} />} />
          <Area dataKey="peak" type="linear" fill="url(#fillPeak)" stroke="var(--color-peak)" strokeWidth={2}
            isAnimationActive={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
            dot={({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) => index === selectedIndex && cx !== undefined && cy !== undefined
              ? <g key="selected">
                <circle cx={cx} cy={cy} r={10} fill="var(--color-peak)" opacity={0.18} />
                <circle cx={cx} cy={cy} r={5} fill="var(--color-peak)" stroke="var(--card)" strokeWidth={2} />
              </g>
              : cx !== undefined && cy !== undefined
                ? <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill="var(--card)" stroke="var(--color-peak)" strokeWidth={2} />
                : <g key={`dot-${index}`} />} />
        </AreaChart>
      </ChartContainer>
    </CardContent>
  </Card>
}
