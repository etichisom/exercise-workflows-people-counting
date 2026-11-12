import { describe, expect, it } from 'vitest'
import { chronological, niceScale, signature, summarize } from './summary'
import { deliveryLabel, hubRecordingUrl, offset, people, relativeTime, snapshotUrl, visibleSpan } from './format'
import type { ResultRecord } from './types'

function record(overrides: Partial<ResultRecord>): ResultRecord {
  return {
    processedAt: '2026-11-12T15:00:00Z', runId: 'run', mediaKey: 'key.mp4', recordingStart: 1000,
    delivery: 'submitted', personDetected: false, peakCount: 0, peakAtSeconds: 0, firstSeenSeconds: 0,
    lastSeenSeconds: 0, sampleSeconds: 1, framesAnalyzed: 30, maxConfidence: 0, hasSnapshot: false,
    ...overrides,
  }
}

describe('summarize', () => {
  it('handles an empty list', () => {
    expect(summarize([])).toEqual({ total: 0, withPeople: 0, sharePercent: 0, averagePeak: 0, busiest: null, latest: null })
  })

  it('computes headline numbers over recordings with people', () => {
    const results = [
      record({ runId: 'c', recordingStart: 3000, peakCount: 0 }),
      record({ runId: 'b', recordingStart: 2000, peakCount: 4 }),
      record({ runId: 'a', recordingStart: 1000, peakCount: 3 }),
    ]
    const summary = summarize(results)
    expect(summary.total).toBe(3)
    expect(summary.withPeople).toBe(2)
    expect(summary.sharePercent).toBe(67)
    expect(summary.averagePeak).toBe(3.5)
    expect(summary.busiest?.runId).toBe('b')
    expect(summary.latest?.runId).toBe('c')
  })

  it('prefers the most recent recording when peaks tie', () => {
    const summary = summarize([
      record({ runId: 'newer', recordingStart: 2000, peakCount: 4 }),
      record({ runId: 'older', recordingStart: 1000, peakCount: 4 }),
    ])
    expect(summary.busiest?.runId).toBe('newer')
  })
})

describe('chronological', () => {
  it('orders oldest first without mutating the input', () => {
    const input = [record({ runId: 'b', recordingStart: 2 }), record({ runId: 'a', recordingStart: 1 })]
    expect(chronological(input).map(r => r.runId)).toEqual(['a', 'b'])
    expect(input[0].runId).toBe('b')
  })
})

describe('niceScale', () => {
  it.each([
    [0, { max: 4, step: 1 }],
    [3, { max: 4, step: 1 }],
    [6, { max: 6, step: 1 }],
    [7, { max: 8, step: 2 }],
    [11, { max: 12, step: 2 }],
    [13, { max: 15, step: 5 }],
    [42, { max: 50, step: 10 }],
  ])('scales a peak of %i to %o', (peak, expected) => {
    expect(niceScale(peak)).toEqual(expected)
  })
})

describe('signature', () => {
  it('changes when a run is reprocessed', () => {
    const first = signature([record({ runId: 'a', processedAt: '1' })])
    expect(signature([record({ runId: 'a', processedAt: '2' })])).not.toBe(first)
    expect(signature([record({ runId: 'a', processedAt: '1' })])).toBe(first)
  })
})

describe('format', () => {
  it('pluralises people', () => {
    expect(people(0)).toBe('0 people')
    expect(people(1)).toBe('1 person')
    expect(people(5)).toBe('5 people')
  })

  it('formats offsets like the Hub marker description', () => {
    expect(offset(0)).toBe('0:00')
    expect(offset(1.99)).toBe('0:01')
    expect(offset(75.9)).toBe('1:15')
    expect(offset(-3)).toBe('0:00')
  })

  it('includes the last sample interval in the visible span', () => {
    expect(visibleSpan(record({ firstSeenSeconds: 2, lastSeenSeconds: 26, sampleSeconds: 1 }))).toBe('0:02–0:27')
  })

  it('describes relative time', () => {
    const now = new Date('2026-11-12T16:00:00Z')
    expect(relativeTime(new Date('2026-11-12T15:59:40Z'), now)).toBe('just now')
    expect(relativeTime(new Date('2026-11-12T15:57:00Z'), now)).toBe('3 min ago')
    expect(relativeTime(new Date('2026-11-12T13:00:00Z'), now)).toBe('3 h ago')
  })

  it('builds safe URLs', () => {
    expect(hubRecordingUrl(record({ recordingStart: 1794494334 }))).toBe('https://app.kerberos.io/media?playtime=1794494334')
    expect(snapshotUrl(record({ runId: 'run/../x' }))).toBe('/snapshots/run%2F..%2Fx.jpg')
  })

  it('labels deliveries', () => {
    expect(deliveryLabel('submitted')).toBe('Sent to Hub')
    expect(deliveryLabel('offline')).toBe('Offline test')
    expect(deliveryLabel('custom')).toBe('custom')
  })
})
