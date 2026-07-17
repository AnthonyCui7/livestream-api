import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import type { Project } from '../types'
import { deleteProject, listProjects } from '../services/projects'
import { ProjectCard } from '../components/projects/ProjectCard'
import { NewProjectModal } from '../components/projects/NewProjectModal'
import { Skeleton } from '../components/ui/Skeleton'
import { showToast } from '../lib/toast'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects())
    } catch (err) {
      console.error('[ProjectsPage] failed to load projects', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load once, then keep status pills / clip counts fresh with a lightweight
  // poll — refresh only touches state on success, so no skeleton flash.
  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 10000)
    return () => clearInterval(interval)
  }, [refresh])

  const handleDelete = useCallback(
    async (project: Project) => {
      if (!confirm(`Delete “${project.name}”? Its clips and media are removed for good.`)) return
      try {
        await deleteProject(project.id)
        showToast('Project deleted')
        void refresh()
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to delete the project')
      }
    },
    [refresh],
  )

  const isEmpty = useMemo(() => !loading && projects.length === 0, [loading, projects])

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[#F5F5F3] text-[22px] font-semibold tracking-tight">Projects</h1>
          <p className="text-neutral-500 text-[13px] mt-0.5">
            Upload a video or drop a stream link — clips come back with virality scores.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-[#22E55F] hover:bg-[#35f16d] text-[#0A0A0A] text-[13px] font-semibold rounded-[8px] transition-colors"
        >
          <Plus size={15} />
          New project
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-[10px] overflow-hidden ring-1 ring-white/[0.05]">
              <Skeleton className="aspect-video rounded-none" />
              <div className="px-3.5 py-3 space-y-2">
                <Skeleton className="h-[13px] w-3/5" />
                <Skeleton className="h-[11px] w-2/5" />
              </div>
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onDelete={() => void handleDelete(p)} />
          ))}
        </div>
      )}

      {creating && (
        <NewProjectModal
          open
          onClose={() => setCreating(false)}
          onCreated={() => void refresh()}
        />
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <span className="grid place-items-center w-12 h-12 rounded-[12px] bg-white/[0.04] ring-1 ring-white/[0.06] mb-4">
        <Sparkles size={22} className="text-[#22E55F]" />
      </span>
      <div className="text-neutral-200 text-[15px] font-medium mb-1">No projects yet</div>
      <p className="text-neutral-500 text-[12.5px] max-w-xs mb-5">
        Create your first project to start turning long videos and streams into short, shareable
        clips.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-[#22E55F] hover:bg-[#35f16d] text-[#0A0A0A] text-[13px] font-semibold rounded-[8px] transition-colors"
      >
        <Plus size={15} />
        New project
      </button>
    </div>
  )
}
