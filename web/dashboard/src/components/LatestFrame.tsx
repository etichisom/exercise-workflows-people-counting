import { Maximize2, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusDot } from '@/components/shared'
import { axisTime, people, recordedAt, relativeTime, snapshotUrl } from '@/format'
import type { ResultRecord } from '@/types'

/**
 * The newest clip's busiest frame as a small monitor. The worker receives
 * recordings, not a stream, so this is the latest frame rather than live video.
 */
export function LatestFrame({ record, now, onOpen }: { record: ResultRecord; now: Date; onOpen: (record: ResultRecord) => void }) {
  return <Card size="sm">
    <CardHeader>
      <CardTitle><StatusDot tone="success" pulse>Latest frame</StatusDot></CardTitle>
      <CardDescription>Clip at {axisTime(recordedAt(record))}, {relativeTime(recordedAt(record), now)}</CardDescription>
      <CardAction>
        <Button variant="ghost" size="icon-sm" onClick={() => onOpen(record)} aria-label="Show the latest clip in the viewer">
          <Maximize2 aria-hidden="true" />
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent>
      <button type="button" onClick={() => onOpen(record)} aria-label={`Latest clip, ${people(record.peakCount)}. Show it in the viewer.`}
        className={`group relative block aspect-video w-full overflow-hidden rounded-lg ${record.hasSnapshot ? 'bg-black' : 'bg-muted/60'} ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}>
        {record.hasSnapshot
          ? <img src={snapshotUrl(record)} alt="" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
          : <span className="scene-grid flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <UserX className="size-5" aria-hidden="true" />
            <span className="text-xs">No people in view</span>
          </span>}
        <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium text-white backdrop-blur" aria-hidden="true">
          {people(record.peakCount)}
        </span>
      </button>
    </CardContent>
  </Card>
}
