import { OpenNewWindow, UserXmark } from 'iconoir-react'
import { HubBadge, HubStatus } from '../vendor/hub-widgets'
import { deliveryLabel, hubRecordingUrl, offset, people, recordedLabel, snapshotUrl, visibleSpan } from '../format'
import type { ResultRecord } from '../types'

export function Snapshot({ record, alt }: { record: ResultRecord; alt: string }) {
  if (!record.hasSnapshot) {
    return <div className="snapshot snapshot--empty">
      <UserXmark width={28} height={28} aria-hidden="true" />
      <span>{record.peakCount > 0 ? 'No snapshot' : 'No people detected'}</span>
    </div>
  }
  return <img className="snapshot" src={snapshotUrl(record)} alt={alt} loading="lazy" decoding="async" />
}

export function HubLink({ record, children }: { record: ResultRecord; children: string }) {
  return <a className="hub-link" href={hubRecordingUrl(record)} target="_blank" rel="noopener noreferrer"
    aria-label={`${children}: recording from ${recordedLabel(record)}`}>
    {children}<OpenNewWindow width={14} height={14} aria-hidden="true" />
  </a>
}

export function RecordingCard({ record, isNew }: { record: ResultRecord; isNew: boolean }) {
  const detail = record.peakCount > 0
    ? `Peak at ${offset(record.peakAtSeconds)} · visible ${visibleSpan(record)}`
    : `${record.framesAnalyzed} frames checked, nobody in view`
  return <article className={`recording-card ${isNew ? 'is-new' : ''}`}>
    <div className="recording-card__media">
      <Snapshot record={record} alt={`Peak frame with ${people(record.peakCount)} boxed`} />
      <span className="recording-card__badge">
        <HubBadge title="Peak people" count={record.peakCount} tone={record.peakCount > 0 ? 'info' : 'neutral'} />
      </span>
    </div>
    <div className="recording-card__body">
      <h3>{recordedLabel(record)}</h3>
      <p>{detail}</p>
    </div>
    <footer className="recording-card__footer">
      <HubStatus tone={record.delivery === 'submitted' ? 'success' : 'neutral'}>{deliveryLabel(record.delivery)}</HubStatus>
      <HubLink record={record}>Hub</HubLink>
    </footer>
  </article>
}
