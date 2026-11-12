import { ImageOff, UserX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { snapshotUrl } from '@/format'
import type { ResultRecord } from '@/types'

export const HUB_URL = 'https://app.kerberos.io'

/** The peak frame with counted people boxed, or a clear placeholder. */
export function Snapshot({ record, className, alt }: { record: ResultRecord; className?: string; alt: string }) {
  if (!record.hasSnapshot) {
    const Icon = record.peakCount > 0 ? ImageOff : UserX
    return <div className={cn('flex aspect-video flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground', className)}>
      <Icon className="size-5" aria-hidden="true" />
      <span className="text-xs">{record.peakCount > 0 ? 'No snapshot' : 'No people in view'}</span>
    </div>
  }
  return <img src={snapshotUrl(record)} alt={alt} loading="lazy" decoding="async"
    className={cn('aspect-video w-full bg-muted object-cover', className)} />
}

export type Tone = 'success' | 'primary' | 'muted' | 'warning' | 'destructive'

const toneClass: Record<Tone, string> = {
  success: 'bg-success',
  primary: 'bg-primary',
  muted: 'bg-muted-foreground/50',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
}

/** A status label that never relies on colour alone: dot plus text. */
export function StatusDot({ tone, children, pulse = false, className }: {
  tone: Tone; children: React.ReactNode; pulse?: boolean; className?: string
}) {
  return <span className={cn('inline-flex items-center gap-2', className)}>
    <span className="relative flex size-2" aria-hidden="true">
      {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', toneClass[tone])} />}
      <span className={cn('relative inline-flex size-2 rounded-full', toneClass[tone])} />
    </span>
    {children}
  </span>
}
