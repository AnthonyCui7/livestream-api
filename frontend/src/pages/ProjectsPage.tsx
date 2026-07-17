import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Sparkles } from 'lucide-react'
import type { Project } from '../types'
import {
  listProjects,
  createProject as apiCreate,
  deleteProject as apiDelete,
  type CreateProjectInput,
} from '../services/projects'
import { ProjectCard } from '../components/projects/ProjectCard'
import { CreateProjectModal } from '../components/projects/CreateProjectModal'
import { Skeleton } from '../components/ui/Skeleton'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const navigate = useNavigate()

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects())
    } catch (err) {
      console.error('[ProjectsPage] failed to load projects', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = useCallback(
    async (input: CreateProjectInput) => {
      const project = await apiCreate(input)
      setModalOpen(false)
      // Jump straight into the new project to watch clips filter in.
      navigate(`/projects/${project.id}`)
    },
    [navigate],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      // Optimistic removal.
      setProjects((prev) => prev.filter((p) => p.id !== id))
      try {
        await apiDelete(id)
      } catch (err) {
        console.error('[ProjectsPage] delete failed, refreshing', err)
        void refresh()
      }
    },
    [refresh],
  )

  const openModal = useCallback(() => setModalOpen(true), [])
  const closeModal = useCallback(() => setModalOpen(false), [])

  const isEmpty = useMemo(() => !loading && projects.length === 0, [loading, projects])

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-white text-[22px] font-semibold tracking-tight">Projects</h1>
          <p className="text-neutral-500 text-[13px] mt-0.5">
            Upload a video or drop a stream link — clips come back with virality scores.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[13px] font-semibold rounded-[8px] hover:opacity-95 transition-opacity"
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
        <EmptyState onCreate={openModal} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onDelete={() => handleDelete(p.id)} />
          ))}
        </div>
      )}

      <CreateProjectModal
        open={modalOpen}
        onCancel={closeModal}
        onCreate={handleCreate}
      />
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <span className="grid place-items-center w-12 h-12 rounded-[12px] bg-white/[0.04] ring-1 ring-white/[0.06] mb-4">
        <Sparkles size={22} className="text-violet-300" />
      </span>
      <div className="text-neutral-200 text-[15px] font-medium mb-1">No projects yet</div>
      <p className="text-neutral-500 text-[12.5px] max-w-xs mb-5">
        Create your first project to start turning long videos and streams into short, shareable
        clips.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[13px] font-semibold rounded-[8px] hover:opacity-95 transition-opacity"
      >
        <Plus size={15} />
        New project
      </button>
    </div>
  )
}
