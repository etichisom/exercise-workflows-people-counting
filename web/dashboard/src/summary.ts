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

/** A cheap identity for a result list, used to skip identical re-renders. */
export function signature(results: ResultRecord[]): string {
  return results.map(record => `${record.runId}@${record.processedAt}`).join('|')
}
