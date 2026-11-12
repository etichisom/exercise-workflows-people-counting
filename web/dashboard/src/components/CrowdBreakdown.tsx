import { User, UserX, Users, UsersRound } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { crowdBreakdown } from '@/summary'
import type { CrowdLevel } from '@/summary'
import type { ResultRecord } from '@/types'

const icons: Record<CrowdLevel, typeof User> = { empty: UserX, quiet: User, busy: Users, crowded: UsersRound }

/** Share of recordings per crowd size, as in a "by source" breakdown. */
export function CrowdBreakdown({ results }: { results: ResultRecord[] }) {
  const rows = crowdBreakdown(results)
  return <Card className="h-full">
    <CardHeader>
      <CardTitle>By crowd size</CardTitle>
      <CardDescription>Recordings grouped by their busiest moment</CardDescription>
    </CardHeader>
    <CardContent>
      <ul className="space-y-4">
        {rows.map(row => {
          const Icon = icons[row.level]
          return <li key={row.level} className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground" aria-hidden="true">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-medium">{row.label}</span>
                <span className="text-xs text-muted-foreground">{row.range}</span>
                <span className="tabular ml-auto font-medium">{row.count}</span>
                <span className="tabular w-10 text-right text-muted-foreground">{row.percent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img"
                aria-label={`${row.label}: ${row.count} recordings, ${row.percent}%`}>
                <div className="h-full rounded-full bg-primary/70 transition-[width] duration-500" style={{ width: `${row.percent}%` }} />
              </div>
            </div>
          </li>
        })}
      </ul>
    </CardContent>
  </Card>
}
