import { Label, Pie, PieChart } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { crowdBreakdown } from '@/summary'
import type { CrowdLevel } from '@/summary'
import type { ResultRecord } from '@/types'

/** Neutral shades from the theme's foreground: busier reads darker (lighter in dark mode). */
const shades: Record<CrowdLevel, string> = {
  crowded: 'var(--foreground)',
  busy: 'color-mix(in oklch, var(--foreground) 62%, var(--card))',
  quiet: 'color-mix(in oklch, var(--foreground) 32%, var(--card))',
  empty: 'color-mix(in oklch, var(--foreground) 12%, var(--card))',
}

const chartConfig = {
  crowded: { label: 'Crowded', color: shades.crowded },
  busy: { label: 'Busy', color: shades.busy },
  quiet: { label: 'Quiet', color: shades.quiet },
  empty: { label: 'Empty', color: shades.empty },
} satisfies ChartConfig

/** Recordings grouped by their busiest moment, as a donut with the total in the middle. */
export function CrowdDonut({ results }: { results: ResultRecord[] }) {
  const rows = crowdBreakdown(results)
  const data = rows.filter(row => row.count > 0).map(row => ({ level: row.level, count: row.count, fill: shades[row.level] }))

  return <Card size="sm" className="@container/card flex-1">
    <CardHeader>
      <CardTitle>Crowd size</CardTitle>
      <CardDescription>Clips grouped by their busiest moment</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col items-center gap-4 @sm/card:flex-row">
      <ChartContainer config={chartConfig} className="aspect-square h-36 shrink-0"
        aria-label={rows.map(row => `${row.label}: ${row.count}`).join(', ')}>
        <PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="level" hideLabel />} />
          <Pie data={data} isAnimationActive={false} dataKey="count" nameKey="level" innerRadius={44} outerRadius={64} strokeWidth={3} stroke="var(--card)" paddingAngle={data.length > 1 ? 2 : 0}>
            <Label content={({ viewBox }) => viewBox && 'cx' in viewBox && 'cy' in viewBox
              ? <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">{results.length}</tspan>
                <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">clips</tspan>
              </text>
              : null} />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="w-full space-y-2 text-sm">
        {rows.map(row => <li key={row.level} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10" style={{ background: shades[row.level] }} aria-hidden="true" />
          <span className="font-medium">{row.label}</span>
          <span className="text-xs text-muted-foreground">{row.range}</span>
          <span className="ml-auto tabular-nums">{row.count}</span>
          <span className="w-9 text-right text-muted-foreground tabular-nums">{row.percent}%</span>
        </li>)}
      </ul>
    </CardContent>
  </Card>
}
