import { useState } from 'react'
import { useElementWidth } from '../hooks'
import { clockTime, offset, people, recordedAt, recordedLabel, visibleSpan } from '../format'
import { niceScale } from '../summary'
import type { ResultRecord } from '../types'

const HEIGHT = 260
const MARGIN = { top: 18, right: 8, bottom: 28, left: 32 }
const TOOLTIP_WIDTH = 200

/** Bar path with a 4px rounded data end and a square foot on the baseline. */
function barPath(x: number, width: number, top: number, base: number): string {
  const radius = Math.min(4, width / 2, base - top)
  return `M${x},${base} V${top + radius} Q${x},${top} ${x + radius},${top} ` +
    `H${x + width - radius} Q${x + width},${top} ${x + width},${top + radius} V${base} Z`
}

/** Peak people per recording, oldest to newest. Expects chronological data. */
export function OccupancyChart({ records }: { records: ResultRecord[] }) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const peak = Math.max(0, ...records.map(record => record.peakCount))
  const scale = niceScale(peak)
  const y = (value: number) => MARGIN.top + plotHeight - (value / scale.max) * plotHeight
  const slot = records.length ? plotWidth / records.length : 0
  // A 2px surface gap between neighbouring bars, capped so few bars stay slim.
  const barWidth = Math.max(3, Math.min(28, slot - 2))
  const peakIndex = records.findIndex(record => record.peakCount === peak && peak > 0)
  const ticks = Array.from({ length: scale.max / scale.step + 1 }, (_, index) => index * scale.step)
  const activeRecord = active === null ? null : records[active]

  return <div className="occupancy-chart" ref={containerRef}>
    {width > 0 && <svg width={width} height={HEIGHT} role="img"
      aria-label={`Bar chart of the peak number of people in ${records.length} recordings`}>
      {ticks.map(tick => <g key={tick}>
        <line className="occupancy-chart__grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
        <text className="occupancy-chart__axis" x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text>
      </g>)}
      {records.map((record, index) => {
        const centre = MARGIN.left + slot * index + slot / 2
        const x = centre - barWidth / 2
        const base = y(0)
        return <g key={record.runId}>
          <rect className="occupancy-chart__hit" x={MARGIN.left + slot * index} y={MARGIN.top} width={slot} height={plotHeight}
            tabIndex={0} aria-label={`${recordedLabel(record)}: ${people(record.peakCount)}`}
            onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(index)} onBlur={() => setActive(null)} />
          {record.peakCount > 0
            ? <path className={`occupancy-chart__bar ${active === index ? 'is-active' : ''}`}
              d={barPath(x, barWidth, y(record.peakCount), base)} />
            : <rect className="occupancy-chart__stub" x={x} y={base - 2} width={barWidth} height={2} />}
          {index === peakIndex && <text className="occupancy-chart__label" x={centre} y={y(record.peakCount) - 6}
            textAnchor="middle">{record.peakCount}</text>}
        </g>
      })}
      {records.length > 0 && <>
        <text className="occupancy-chart__axis" x={MARGIN.left} y={HEIGHT - 8}>{clockTime(recordedAt(records[0]))}</text>
        {records.length > 1 && <text className="occupancy-chart__axis" x={width - MARGIN.right} y={HEIGHT - 8} textAnchor="end">
          {clockTime(recordedAt(records[records.length - 1]))}</text>}
      </>}
    </svg>}
    {activeRecord && active !== null && <div className="occupancy-chart__tooltip" role="tooltip" style={{
      left: Math.min(Math.max(MARGIN.left + slot * active + slot / 2 - TOOLTIP_WIDTH / 2, 0), Math.max(0, width - TOOLTIP_WIDTH)),
      top: Math.max(0, y(activeRecord.peakCount) - 88),
      width: TOOLTIP_WIDTH,
    }}>
      <strong>{people(activeRecord.peakCount)}</strong>
      <span>{recordedLabel(activeRecord)}</span>
      <span>{activeRecord.peakCount > 0
        ? `Peak at ${offset(activeRecord.peakAtSeconds)} · visible ${visibleSpan(activeRecord)}`
        : 'Nobody in view'}</span>
    </div>}
  </div>
}
