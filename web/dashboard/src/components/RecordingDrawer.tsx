import { ArrowUpRight, MonitorPlay } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Separator } from '@/components/ui/separator'
import { ExternalLink, Snapshot, StatusDot } from '@/components/shared'
import { useIsMobile } from '@/hooks/use-mobile'
import { deliveryLabel, hubRecordingUrl, offset, people, recordedLabel, visibleSpan } from '@/format'
import type { ResultRecord } from '@/types'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-0.5">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-sm font-medium">{children}</dd>
  </div>
}

/** One recording's peak frame and facts, as the dashboard-01 row drawer: right on desktop, bottom on phones. */
export function RecordingDrawer({ record, onClose, onCloseAutoFocus, onShowInViewer }: {
  record: ResultRecord | null
  onClose: () => void
  /** Lets the page send focus somewhere other than the row that opened the drawer. */
  onCloseAutoFocus: (event: Event) => void
  onShowInViewer: (record: ResultRecord) => void
}) {
  const isMobile = useIsMobile()
  return <Drawer open={record !== null} onOpenChange={open => { if (!open) onClose() }} direction={isMobile ? 'bottom' : 'right'}>
    <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
      {record && <>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{people(record.peakCount)} at the busiest moment</DrawerTitle>
          <DrawerDescription>
            {recordedLabel(record)}. {record.peakCount > 0
              ? `Boxes mark each person counted ${offset(record.peakAtSeconds)} into the clip.`
              : 'No person scored above the confidence threshold in any sampled frame.'}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          <div className="overflow-hidden rounded-lg border">
            <Snapshot record={record} alt={`Peak frame with ${people(record.peakCount)} boxed`} />
          </div>
          <Separator />
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Peak">{people(record.peakCount)}</Fact>
            <Fact label="Busiest at"><span className="font-mono">{record.peakCount > 0 ? offset(record.peakAtSeconds) : '–'}</span></Fact>
            <Fact label="People in view"><span className="font-mono">{record.peakCount > 0 ? visibleSpan(record) : '–'}</span></Fact>
            <Fact label="Best confidence"><span className="font-mono">{Math.round(record.maxConfidence * 100)}%</span></Fact>
            <Fact label="Frames analysed"><span className="font-mono">{record.framesAnalyzed}</span></Fact>
            <Fact label="Status">
              <StatusDot tone={record.delivery === 'submitted' ? 'success' : 'muted'}>{deliveryLabel(record.delivery)}</StatusDot>
            </Fact>
            <div className="col-span-2 space-y-0.5">
              <dt className="text-xs text-muted-foreground">Run ID</dt>
              <dd className="truncate font-mono text-sm" title={record.runId}>{record.runId}</dd>
            </div>
            <div className="col-span-2 space-y-0.5">
              <dt className="text-xs text-muted-foreground">Media key</dt>
              <dd className="font-mono text-xs break-all text-muted-foreground">{record.mediaKey}</dd>
            </div>
          </dl>
        </div>
        <DrawerFooter>
          <Button onClick={() => onShowInViewer(record)}>
            <MonitorPlay data-icon="inline-start" aria-hidden="true" />Show in viewer
          </Button>
          <Button asChild variant="outline">
            <ExternalLink href={hubRecordingUrl(record)}>
              Open in Hub <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
            </ExternalLink>
          </Button>
          <DrawerClose asChild><Button variant="ghost">Close</Button></DrawerClose>
        </DrawerFooter>
      </>}
    </DrawerContent>
  </Drawer>
}
