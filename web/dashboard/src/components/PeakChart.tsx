import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useElementWidth } from '@/hooks'
import { axisTime, offset, people, recordedAt, recordedLabel, visibleSpan } from '@/format'
import type { ResultRecord } from '@/types'

const HEIGHT = 220
const PAD = { top: 34, bottom: 30, x: 8 }
const TOOLTIP_WIDTH = 210

/** Rounded data end, square foot on the baseline. */
function barPath(x: number, width: number, top: number, base: number): string {
  const radius = Math.min(6, width / 2, base - top)
  return `M${x},${base} V${top + radius} Q${x},${top} ${x + radius},${top} ` +
    `H${x + width - radius} Q${x + width},${top} ${x + width},${top + radius} V${base} Z`
}

/** Shows at most ~8 time labels so they never collide, always including the newest. */
function labelEvery(count: number, width: number): number {
  const fit = Math.max(1, Math.floor(width / 76))
  return Math.max(1, Math.ceil(count / fit))
}

/**
 * Peak people per recording, oldest to newest. Bars are muted except the most
 * recent recording; the busiest one carries a direct label, every bar has a
 * tooltip, and the recordings table below is the full data view.
 */
export function PeakChart({ records }: { records: ResultRecord[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const peak = Math.max(1, ...records.map(record => record.peakCount))
  const y = (value: number) => PAD.top + plotHeight - (value / peak) * plotHeight
  const slot = records.length ? (width - PAD.x * 2) / records.length : 0
  const barWidth = Math.max(4, Math.min(48, slot * 0.62))
  const latestIndex = records.length - 1
  // The tallest bar; the most recent wins a tie so the label sits on fresh data.
  const peakIndex = records.reduce((best, record, index) => (record.peakCount >= records[best].peakCount ? index : best), 0)
  const every = labelEvery(records.length, width)
  const activeRecord = active === null ? null : records[active]
  const base = y(0)

  return <Card className="h-full">
    <CardHeader>
      <CardTitle>Peak people per recording</CardTitle>
      <CardDescription>Most people visible at once in each clip, oldest to newest</CardDescription>
    </CardHeader>
    <CardContent>
      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && <svg width={width} height={HEIGHT} role="img" className="overflow-visible"
          aria-label={`Bar chart: peak people in ${records.length} recordings. The busiest had ${people(records[peakIndex]?.peakCount ?? 0)}.`}>
          <line x1={PAD.x} x2={width - PAD.x} y1={base} y2={base} className="stroke-border" />
          {records.map((record, index) => {
            const centre = PAD.x + slot * index + slot / 2
            const x = centre - barWidth / 2
            const isLatest = index === latestIndex
            const showLabel = (latestIndex - index) % every === 0
            return <g key={record.runId}>
              <rect x={PAD.x + slot * index} y={PAD.top - 24} width={slot} height={plotHeight + 24} fill="transparent"
                className="cursor-pointer outline-none focus-visible:stroke-ring focus-visible:stroke-2" tabIndex={0}
                aria-label={`${recordedLabel(record)}: ${people(record.peakCount)}`}
                onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(index)} onBlur={() => setActive(null)} />
              {record.peakCount > 0
                ? <path d={barPath(x, barWidth, y(record.peakCount), base)}
                  className={cn('pointer-events-none transition-[fill,opacity]', isLatest ? 'fill-bar-highlight' : 'fill-bar',
                    active !== null && active !== index && 'opacity-60')} />
                : <rect x={x} y={base - 3} width={barWidth} height={3} rx={1.5}
                  className={cn('pointer-events-none', isLatest ? 'fill-bar-highlight' : 'fill-bar')} />}
              {isLatest && <text x={centre} y={y(record.peakCount) - 8} textAnchor="middle"
                className="pointer-events-none fill-primary text-xs font-semibold">{record.peakCount}</text>}
              {index === peakIndex && !isLatest && record.peakCount > 0 && <text x={centre} y={y(record.peakCount) - 8} textAnchor="middle"
                className="pointer-events-none fill-muted-foreground text-xs">
                <tspan className="fill-foreground font-semibold">{record.peakCount}</tspan> at {axisTime(recordedAt(record))}
              </text>}
              {showLabel && <text x={centre} y={HEIGHT - 8} textAnchor="middle"
                className={cn('pointer-events-none text-xs', isLatest ? 'fill-foreground font-medium' : 'fill-muted-foreground')}>
                {axisTime(recordedAt(record))}
              </text>}
            </g>
          })}
        </svg>}
        {activeRecord && active !== null && <div role="tooltip"
          className="pointer-events-none absolute z-10 grid gap-0.5 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
          style={{
            width: TOOLTIP_WIDTH,
            left: Math.min(Math.max(PAD.x + slot * active + slot / 2 - TOOLTIP_WIDTH / 2, 0), Math.max(0, width - TOOLTIP_WIDTH)),
            top: Math.max(0, y(activeRecord.peakCount) - 86),
          }}>
          <span className="text-sm font-semibold">{people(activeRecord.peakCount)}</span>
          <span className="text-muted-foreground">{recordedLabel(activeRecord)}</span>
          <span className="text-muted-foreground">{activeRecord.peakCount > 0
            ? `Peak at ${offset(activeRecord.peakAtSeconds)} · visible ${visibleSpan(activeRecord)}`
            : 'Nobody in view'}</span>
        </div>}
      </div>
    </CardContent>
  </Card>
}
