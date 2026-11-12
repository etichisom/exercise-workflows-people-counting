import type { ResultRecord } from './types'

export type Summary = {
  total: number
  withPeople: number
  /** Share of recordings with at least one person, 0-100. */
  sharePercent: number
  /** Mean peak over recordings with people, one decimal. */
  averagePeak: number
  /** The recording with the highest peak; the most recent one wins a tie. */
  busiest: ResultRecord | null
  latest: ResultRecord | null
}

/** Results arrive newest first from the API. */
export function summarize(results: ResultRecord[]): Summary {
  const withPeople = results.filter(record => record.peakCount > 0)
  const busiest = withPeople.reduce<ResultRecord | null>(
    (best, record) => (best === null || record.peakCount > best.peakCount ? record : best), null)
  const averagePeak = withPeople.length === 0 ? 0
    : Math.round((withPeople.reduce((sum, record) => sum + record.peakCount, 0) / withPeople.length) * 10) / 10
  return {
    total: results.length,
    withPeople: withPeople.length,
    sharePercent: results.length === 0 ? 0 : Math.round((withPeople.length / results.length) * 100),
    averagePeak,
    busiest,
    latest: results[0] ?? null,
  }
}

/** Chart order: oldest on the left, newest on the right. */
export function chronological(results: ResultRecord[]): ResultRecord[] {
  return [...results].sort((a, b) => a.recordingStart - b.recordingStart)
}

/** A y-axis with whole-person ticks that always leaves headroom above 4. */
export function niceScale(maxValue: number): { max: number; step: number } {
  const top = Math.max(4, Math.ceil(maxValue))
  const step = top <= 6 ? 1 : top <= 12 ? 2 : top <= 30 ? 5 : 10
  return { max: Math.ceil(top / step) * step, step }
}

export type CrowdLevel = 'empty' | 'quiet' | 'busy' | 'crowded'

export const crowdLevels: { level: CrowdLevel; label: string; range: string }[] = [
  { level: 'empty', label: 'Empty', range: '0 people' },
  { level: 'quiet', label: 'Quiet', range: '1–2 people' },
  { level: 'busy', label: 'Busy', range: '3–5 people' },
  { level: 'crowded', label: 'Crowded', range: '6+ people' },
]

export function crowdLevel(peak: number): CrowdLevel {
  if (peak <= 0) return 'empty'
  if (peak <= 2) return 'quiet'
  if (peak <= 5) return 'busy'
  return 'crowded'
}

export function crowdBreakdown(results: ResultRecord[]): { level: CrowdLevel; label: string; range: string; count: number; percent: number }[] {
  return crowdLevels.map(entry => {
    const count = results.filter(record => crowdLevel(record.peakCount) === entry.level).length
    return { ...entry, count, percent: results.length ? Math.round((count / results.length) * 100) : 0 }
  })
}

/** Approximate clip length from the sampled frames; never shorter than the visible span. */
export function clipSeconds(record: ResultRecord): number {
  const sampled = record.framesAnalyzed * (record.sampleSeconds || 1)
  return Math.max(sampled, record.lastSeenSeconds + (record.sampleSeconds || 0), 1)
}

export type RecordingTab = 'all' | 'people' | 'empty' | 'hub'

export function matchesTab(record: ResultRecord, tab: RecordingTab): boolean {
  switch (tab) {
    case 'people': return record.peakCount > 0
    case 'empty': return record.peakCount === 0
    case 'hub': return record.delivery === 'submitted'
    default: return true
  }
}

export function tabCounts(results: ResultRecord[]): Record<RecordingTab, number> {
  return {
    all: results.length,
    people: results.filter(record => matchesTab(record, 'people')).length,
    empty: results.filter(record => matchesTab(record, 'empty')).length,
    hub: results.filter(record => matchesTab(record, 'hub')).length,
  }
}

export type RecordingFilter = { tab: RecordingTab; query: string; crowd: CrowdLevel | 'any' }

/** Filters by tab, crowd size and a free-text query over run ID, file and time label. */
export function filterRecordings(results: ResultRecord[], filter: RecordingFilter, label: (record: ResultRecord) => string): ResultRecord[] {
  const query = filter.query.trim().toLowerCase()
  return results.filter(record =>
    matchesTab(record, filter.tab) &&
    (filter.crowd === 'any' || crowdLevel(record.peakCount) === filter.crowd) &&
    (query === '' || [record.runId, record.mediaKey, label(record)].some(value => value.toLowerCase().includes(query))))
}

/** A cheap identity for a result list, used to skip identical re-renders. */
export function signature(results: ResultRecord[]): string {
  return results.map(record => `${record.runId}@${record.processedAt}`).join('|')
}

export type Trend = 'increasing' | 'decreasing' | 'steady'

/**
 * Whether the newest clip is busier than the clips before it: its peak
 * against their mean, with half a person of slack so noise reads as steady.
 * Null until there are two clips. Expects oldest first.
 */
export function occupancyTrend(ordered: ResultRecord[]): Trend | null {
  if (ordered.length < 2) return null
  const earlier = ordered.slice(0, -1)
  const mean = earlier.reduce((sum, record) => sum + record.peakCount, 0) / earlier.length
  const difference = ordered[ordered.length - 1].peakCount - mean
  return difference > 0.5 ? 'increasing' : difference < -0.5 ? 'decreasing' : 'steady'
}
