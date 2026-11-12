import { useEffect, useMemo, useRef, useState } from 'react'
import { HalfMoon, SunLight } from 'iconoir-react'
import {
  HubBlock, HubButton, HubInfobox, HubKpi, HubMultiToggle, HubPlaceholder, HubStatus, HubTable, HubTheme,
} from './vendor/hub-widgets'
import type { HubTableColumn } from './vendor/hub-widgets'
import { OccupancyChart } from './components/OccupancyChart'
import { HubLink, RecordingCard, Snapshot } from './components/RecordingCard'
import { useNow, useResults, useTheme } from './hooks'
import { offset, people, recordedAt, recordedLabel, relativeTime } from './format'
import { chronological, summarize } from './summary'
import type { ConnectionState, ResultRecord } from './types'

type TableRow = ResultRecord & { id: string }

const tableColumns: HubTableColumn<TableRow>[] = [
  { key: 'recordingStart', label: 'Recorded', render: row => recordedLabel(row) },
  { key: 'peakCount', label: 'Peak people', align: 'end', emphasis: true },
  { key: 'peakAtSeconds', label: 'Peak at', align: 'end', render: row => row.peakCount > 0 ? offset(row.peakAtSeconds) : '–' },
  { key: 'framesAnalyzed', label: 'Frames', align: 'end' },
]

function ConnectionStatus({ state, updatedAt, now }: { state: ConnectionState; updatedAt: Date | null; now: Date }) {
  if (state === 'offline') return <HubStatus tone="alert">Worker unreachable · retrying</HubStatus>
  if (state === 'connecting' || !updatedAt) return <HubStatus tone="updating">Connecting…</HubStatus>
  return <HubStatus tone="success">Live · updated {relativeTime(updatedAt, now)}</HubStatus>
}

export function App() {
  const [theme, toggleTheme] = useTheme()
  const { results, state, updatedAt } = useResults()
  const now = useNow()
  const [view, setView] = useState('chart')
  const seenRuns = useRef<Set<string> | null>(null)

  const summary = useMemo(() => summarize(results ?? []), [results])
  const ordered = useMemo(() => chronological(results ?? []), [results])
  const rows = useMemo<TableRow[]>(() => (results ?? []).map(record => ({ ...record, id: record.runId })), [results])

  // Highlight recordings that arrive after the first load. Rendering only
  // reads the previous set; the effect records what has been shown.
  const previous = seenRuns.current
  const newRuns = new Set(previous && results ? results.filter(record => !previous.has(record.runId)).map(record => record.runId) : [])
  useEffect(() => {
    if (results) seenRuns.current = new Set(results.map(record => record.runId))
  }, [results])

  const loading = results === null
  const busiest = summary.busiest

  return <HubTheme theme={theme}>
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Augment Vision · people counting stage</p>
          <h1>Shop occupancy</h1>
          <p className="page-subtitle">
            How many people the YOLO workflow stage counted in each recording, at the busiest moment of the clip.
          </p>
        </div>
        <div className="page-actions">
          <ConnectionStatus state={state} updatedAt={updatedAt} now={now} />
          <HubButton variant="outlined" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            icon={theme === 'dark' ? <SunLight /> : <HalfMoon />} />
        </div>
      </header>

      {state === 'offline' && results === null && <HubInfobox tone="error">
        Cannot reach the worker. Start it with RESULTS_DIR and DASHBOARD_ADDR set, or run it with -dashboard.
      </HubInfobox>}

      <section className="kpi-grid" aria-label="Summary">
        <HubKpi loading={loading} value={summary.total} footer="Recordings analysed" />
        <HubKpi loading={loading} value={busiest?.peakCount ?? 0} unit="people" footer="Busiest moment" />
        <HubKpi loading={loading} value={summary.averagePeak} unit="people" footer="Average peak" />
        <HubKpi loading={loading} value={summary.sharePercent} unit="%" footer="Recordings with people" />
      </section>

      {!loading && summary.total === 0 && <HubPlaceholder title="No recordings processed yet"
        description="Each recording the worker processes appears here automatically. Start the worker with RESULTS_DIR set." />}

      {!loading && summary.total > 0 && <>
        <div className="main-grid">
          <HubBlock title="Peak people per recording"
            headerActions={<HubMultiToggle label="Chart view" value={view} onChange={setView}
              options={[{ value: 'chart', text: 'Chart' }, { value: 'table', text: 'Table' }]} />}
            footer={<span>Oldest → newest. Counts are people visible at the same time, not unique visitors.</span>}>
            {view === 'chart'
              ? <div className="block-padding"><OccupancyChart records={ordered} /></div>
              : <HubTable label="Peak people per recording" columns={tableColumns} rows={rows} pageSize={8} />}
          </HubBlock>

          <HubBlock title="Busiest moment" headerActions={busiest ? <HubLink record={busiest}>Open in Hub</HubLink> : undefined}>
            <div className="block-padding busiest">
              {busiest ? <>
                <Snapshot record={busiest} alt={`Peak frame with ${people(busiest.peakCount)} boxed`} />
                <p><strong>{people(busiest.peakCount)}</strong> visible at once, {offset(busiest.peakAtSeconds)} into the
                  recording from {recordedLabel(busiest)}. Boxes show each person counted.</p>
              </> : <p>No people detected yet.</p>}
            </div>
          </HubBlock>
        </div>

        <section aria-labelledby="recordings-title">
          <div className="section-header">
            <h2 id="recordings-title">Recent recordings</h2>
            <span>{summary.total} processed{summary.latest ? ` · latest ${relativeTime(recordedAt(summary.latest), now)}` : ''}</span>
          </div>
          <div className="recording-grid">
            {results.map(record => <RecordingCard key={record.runId} record={record} isNew={newRuns.has(record.runId)} />)}
          </div>
        </section>
      </>}
    </div>
  </HubTheme>
}
