import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Snapshot, StatusDot } from '@/components/shared'
import { deliveryLabel, hubRecordingUrl, offset, people, recordedLabel, visibleSpan } from '@/format'
import type { ResultRecord } from '@/types'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-0.5">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="tabular text-sm font-medium">{children}</dd>
  </div>
}

/** The peak frame with every counted person boxed, plus what was sent to Hub. */
export function RecordingDialog({ record, onClose }: { record: ResultRecord | null; onClose: () => void }) {
  return <Dialog open={record !== null} onOpenChange={open => { if (!open) onClose() }}>
    {record && <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{people(record.peakCount)} at the busiest moment</DialogTitle>
        <DialogDescription>
          Recording from {recordedLabel(record)}. {record.peakCount > 0
            ? `Boxes mark each person counted ${offset(record.peakAtSeconds)} into the clip.`
            : 'No person scored above the confidence threshold in any sampled frame.'}
        </DialogDescription>
      </DialogHeader>
      <div className="overflow-hidden rounded-lg border">
        <Snapshot record={record} alt={`Peak frame with ${people(record.peakCount)} boxed`} />
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Fact label="Peak">{people(record.peakCount)}</Fact>
        <Fact label="Peak at">{record.peakCount > 0 ? offset(record.peakAtSeconds) : '–'}</Fact>
        <Fact label="People visible">{record.peakCount > 0 ? visibleSpan(record) : '–'}</Fact>
        <Fact label="Best confidence">{Math.round(record.maxConfidence * 100)}%</Fact>
        <Fact label="Frames analysed">{record.framesAnalyzed}</Fact>
        <Fact label="Status">
          <StatusDot tone={record.delivery === 'submitted' ? 'success' : 'muted'}>{deliveryLabel(record.delivery)}</StatusDot>
        </Fact>
        <div className="col-span-2 space-y-0.5">
          <dt className="text-xs text-muted-foreground">Run ID</dt>
          <dd className="truncate font-mono text-sm" title={record.runId}>{record.runId}</dd>
        </div>
      </dl>
      <DialogFooter>
        <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
        <Button asChild>
          <a href={hubRecordingUrl(record)} target="_blank" rel="noopener noreferrer">
            Open in Hub <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          </a>
        </Button>
      </DialogFooter>
    </DialogContent>}
  </Dialog>
}
