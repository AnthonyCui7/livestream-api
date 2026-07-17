import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Square, Twitch, Upload, Youtube } from 'lucide-react'
import type { Clip, Project } from '../types'
import { cancelProject, getProject, subscribeClips } from '../services/projects'
import { StatusPill } from '../components/projects/StatusPill'
import { ClipCard } from '../components/clips/ClipCard'
import { Skeleton } from '../components/ui/Skeleton'
import { showToast } from '../lib/toast'

type Sort = 'virality' | 'recent'

export default function ProjectDetailPage() {
  const { id = '' } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(true)
  // Project is confirmed gone (unknown/invalid id, or deleted elsewhere) —
  // shows the not-found state and stops both polls.
  const [notFound, setNotFound] = useState(false)
  const [sort, setSort] = useState<Sort>('virality')
  const [stopBusy, setStopBusy] = useState(false)

  // Load the project record.
  useEffect(() => {
    let alive = true
    setLoading(true)
    setNotFound(false)
    getProject(id)
      .then((p) => {
        if (!alive) return
        setProject(p)
        if (!p) setNotFound(true)
        setLoading(false)
      })
      .catch((err) => {
        // Invalid uuid in the URL (PostgREST 22P02), network failure, … —
        // land on the not-found state instead of the skeleton forever.
        console.error('[ProjectDetailPage] failed to load project', err)
        if (!alive) return
        setProject(null)
        setNotFound(true)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  // Subscribe to clips as the pipeline produces them (4s polling). Each emit
  // also refreshes the project header, keeping status/count fresh.
  useEffect(() => {
    if (!id || notFound) return
    const unsub = subscribeClips(id, (next) => {
      setClips(next)
      // Keep the header's status/count fresh without an extra request.
      getProject(id)
        .then((p) => {
          if (p) setProject(p)
          else setNotFound(true) // deleted elsewhere — stop polling
        })
        .catch((err) => {
          // Transient failure — keep the last-known project state.
          console.error('[ProjectDetailPage] header refresh failed', err)
        })
    })
    return unsub
  }, [id, notFound])

  // The clip subscription only emits when clips change, so status flips that
  // produce no clips (ingesting→ready, stopping→cancelled) need their own
  // cheap poll while the project is still moving.
  const status = project?.status
  useEffect(() => {
    if (!id || notFound) return
    if (status !== 'created' && status !== 'ingesting' && status !== 'stopping') return
    const interval = setInterval(() => {
      getProject(id)
        .then((p) => {
          if (p) setProject(p)
          else setNotFound(true) // deleted elsewhere — stop polling
        })
        .catch((err) => {
          // Transient failure — keep the last-known project state.
          console.error('[ProjectDetailPage] status poll failed', err)
        })
    }, 4000)
    return () => clearInterval(interval)
  }, [id, status, notFound])

  const sortedClips = useMemo(() => {
    const copy = [...clips]
    if (sort === 'recent') copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    else copy.sort((a, b) => b.score - a.score)
    return copy
  }, [clips, sort])

  const isWorking = project?.status === 'created' || project?.status === 'ingesting'
  const isStopping = project?.status === 'stopping'

  const handleStop = async () => {
    if (!project || stopBusy) return
    // Already 'stopping' means the graceful path was taken — escalate to a
    // force stop (terminate the EC2 instance) in case the worker is dead.
    const force = project.status === 'stopping'
    const message = force
      ? 'Force stop this project? The worker is terminated immediately and the project is marked cancelled.'
      : 'Stop this project? The worker shuts down and no more clips will be found.'
    if (!confirm(message)) return
    setStopBusy(true)
    try {
      const updated = await cancelProject(project.id, force)
      setProject(updated)
      showToast(updated.status === 'stopping' ? 'Stopping the worker…' : 'Project stopped')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to stop the project')
    } finally {
      setStopBusy(false)
    }
  }

  if (loading) return <DetailSkeleton />

  if (notFound || !project) {
    return (
      <div className="text-center py-24">
        <p className="text-neutral-400 text-[14px]">Project not found.</p>
        <Link to="/" className="text-[#22E55F] text-[13px] hover:underline mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-[#F5F5F3] text-[12.5px] mb-4 transition-colors"
      >
        <ArrowLeft size={14} />
        Projects
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[#F5F5F3] text-[20px] font-semibold tracking-tight truncate">
              {project.name}
            </h1>
            <StatusPill status={project.status} />
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-neutral-500 text-[12.5px]">
            <SourceSummary project={project} />
          </div>
        </div>

        {(isWorking || isStopping) && (
          <button
            type="button"
            onClick={() => void handleStop()}
            disabled={stopBusy}
            className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium rounded-[8px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isStopping
                ? 'bg-red-500/10 hover:bg-red-500/20 ring-1 ring-red-500/25 text-red-300'
                : 'bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.08] text-red-300/90'
            }`}
          >
            <Square size={12} className="fill-current" />
            {stopBusy ? 'Stopping…' : isStopping ? 'Force stop' : 'Stop'}
          </button>
        )}
      </div>

      {/* Live progress banner while clips are being found (or the worker winds down). */}
      {(isWorking || isStopping) && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-5 bg-[#22E55F]/10 ring-1 ring-[#22E55F]/20 rounded-[9px]">
          <Loader2 size={15} className="text-[#22E55F] animate-spin" />
          <span className="text-[#22E55F] text-[12.5px]">
            {project.status === 'created'
              ? 'Queued — spinning up the clip worker…'
              : project.status === 'stopping'
                ? 'Stopping — the worker is wrapping up…'
                : 'Analyzing the source and finding the best moments…'}
          </span>
          <span className="ml-auto text-neutral-400 text-[12px] tabular-nums">
            {clips.length} {clips.length === 1 ? 'clip' : 'clips'} so far
          </span>
        </div>
      )}

      {/* Clip gallery header. */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-neutral-300 text-[13px] font-medium">
          Clips <span className="text-neutral-600">·</span>{' '}
          <span className="text-neutral-500 tabular-nums">{clips.length}</span>
        </h2>
        {clips.length > 0 && (
          <div className="flex items-center gap-1 p-0.5 bg-white/[0.03] rounded-[7px]">
            <SortButton active={sort === 'virality'} onClick={() => setSort('virality')}>
              Top
            </SortButton>
            <SortButton active={sort === 'recent'} onClick={() => setSort('recent')}>
              Recent
            </SortButton>
          </div>
        )}
      </div>

      {clips.length === 0 ? (
        <div className="text-center py-16 text-neutral-500 text-[12.5px]">
          {isWorking || isStopping
            ? 'The first clips will appear here any second…'
            : project.status === 'cancelled'
              ? 'Project was cancelled before any clips were found.'
              : 'No clips were found.'}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
          {sortedClips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      )}
    </div>
  )
}

function SourceSummary({ project }: { project: Project }) {
  if (project.sourceType === 'upload') {
    const files = project.sourceFiles ?? []
    return (
      <span className="inline-flex items-center gap-1.5 truncate">
        <Upload size={13} className="shrink-0" />
        <span className="truncate">
          {files.length === 1 ? files[0].name : `${files.length} uploaded videos`}
        </span>
      </span>
    )
  }
  // video / livestream link
  const Icon = project.streamPlatform === 'twitch' ? Twitch : Youtube
  return (
    <span className="inline-flex items-center gap-1.5 truncate">
      <Icon size={14} className="shrink-0" />
      <span className="truncate">{project.sourceUrl}</span>
    </span>
  )
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-6 px-2.5 rounded-[5px] text-[11.5px] font-medium transition-colors ${
        active
          ? 'bg-[#22E55F]/15 text-[#22E55F] ring-1 ring-[#22E55F]/25'
          : 'text-neutral-400 hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  )
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="h-[14px] w-20 mb-5" />
      <Skeleton className="h-[24px] w-64 mb-2" />
      <Skeleton className="h-[13px] w-40 mb-8" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-[8px]" />
        ))}
      </div>
    </div>
  )
}
