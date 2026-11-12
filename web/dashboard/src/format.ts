import type { ResultRecord } from './types'

export const HUB_MEDIA_URL = 'https://app.kerberos.io/media?playtime='

export function people(count: number): string {
  return count === 1 ? '1 person' : `${count} people`
}

/** Seconds from the recording start as m:ss, matching the marker description. */
export function offset(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** The span people were visible, including the last sample interval. */
export function visibleSpan(record: ResultRecord): string {
  return `${offset(record.firstSeenSeconds)}–${offset(record.lastSeenSeconds + (record.sampleSeconds || 0))}`
}

export function recordedAt(record: ResultRecord): Date {
  return new Date(record.recordingStart * 1000)
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

export function clockTime(date: Date): string {
  return timeFormat.format(date)
}

const axisFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

/** Compact 24-hour time with seconds for chart axes: clips are often under a minute apart. */
export function axisTime(date: Date): string {
  return axisFormat.format(date)
}

export function recordedLabel(record: ResultRecord): string {
  const date = recordedAt(record)
  return `${dayFormat.format(date)}, ${timeFormat.format(date)}`
}

export function relativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return dayFormat.format(date)
}

export function hubRecordingUrl(record: ResultRecord): string {
  return HUB_MEDIA_URL + encodeURIComponent(String(record.recordingStart))
}

export function snapshotUrl(record: ResultRecord): string {
  return `/snapshots/${encodeURIComponent(record.runId)}.jpg`
}

const deliveryLabels: Record<string, string> = {
  submitted: 'Sent to Hub',
  preview: 'Preview',
  bypass: 'Bypass',
  offline: 'Offline test',
  'callback-missing': 'No callback',
}

export function deliveryLabel(delivery: string): string {
  return deliveryLabels[delivery] ?? delivery
}
