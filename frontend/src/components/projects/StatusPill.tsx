import type { ProjectStatus } from '../../types'

const CONFIG: Record<
  ProjectStatus,
  { label: string; cls: string; pulse?: boolean }
> = {
  created: { label: 'Queued', cls: 'text-sky-300 bg-sky-400/10 ring-sky-400/25', pulse: true },
  ingesting: {
    label: 'Finding clips',
    cls: 'text-violet-300 bg-violet-400/10 ring-violet-400/25',
    pulse: true,
  },
  ready: { label: 'Ready', cls: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/25' },
  failed: { label: 'Failed', cls: 'text-red-300 bg-red-400/10 ring-red-400/25' },
  stopping: {
    label: 'Stopping…',
    cls: 'text-amber-300 bg-amber-400/10 ring-amber-400/25',
    pulse: true,
  },
  cancelled: { label: 'Cancelled', cls: 'text-neutral-300 bg-white/[0.06] ring-white/15' },
}

export function StatusPill({ status }: { status: ProjectStatus }) {
  const { label, cls, pulse } = CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-full text-[11px] font-medium ring-1 backdrop-blur-sm ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  )
}
