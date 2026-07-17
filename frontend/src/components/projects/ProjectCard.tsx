import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal, Twitch, Upload, Youtube } from 'lucide-react'
import type { Project } from '../../types'
import { formatRelative } from '../../lib/format'
import { gradientFor } from '../../lib/placeholder'
import { StatusPill } from './StatusPill'

interface Props {
  project: Project
  onDelete: () => void
}

export function ProjectCard({ project, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  return (
    <div className="group relative bg-white/[0.03] hover:bg-white/[0.055] rounded-[10px] overflow-hidden ring-1 ring-white/[0.05] transition-colors">
      <Link to={`/projects/${project.id}`} className="block">
        <div
          className="aspect-video grid place-items-center"
          style={project.thumbnailUrl ? undefined : { backgroundImage: gradientFor(project.id) }}
        >
          {project.thumbnailUrl ? (
            <img src={project.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <SourceGlyph project={project} />
          )}
          <div className="absolute top-2 left-2">
            <StatusPill status={project.status} />
          </div>
        </div>

        <div className="px-3.5 py-3">
          <h3 className="text-white text-[13.5px] font-medium truncate">{project.name}</h3>
          <div className="mt-1 flex items-center gap-1.5 text-neutral-500 text-[11.5px]">
            <SourceLabel project={project} />
            <span className="text-neutral-700">·</span>
            <span className="tabular-nums">
              {project.clipCount} {project.clipCount === 1 ? 'clip' : 'clips'}
            </span>
            <span className="text-neutral-700">·</span>
            <span className="tabular-nums">{formatRelative(project.updatedAt)}</span>
          </div>
        </div>
      </Link>

      <div className="absolute top-2 right-2" ref={menuRef}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            setMenuOpen((v) => !v)
          }}
          className="w-7 h-7 grid place-items-center rounded-[6px] bg-black/45 text-neutral-300 hover:text-white opacity-0 group-hover:opacity-100 transition"
          title="More"
        >
          <MoreHorizontal size={15} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-[#131316] ring-1 ring-white/[0.08] rounded-[6px] shadow-lg overflow-hidden min-w-[130px] z-10">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                setMenuOpen(false)
                onDelete()
              }}
              className="w-full text-left px-3 py-2 text-[12px] text-red-300/90 hover:bg-white/[0.04] transition-colors"
            >
              Delete project
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SourceGlyph({ project }: { project: Project }) {
  const cls = 'text-white/85'
  if (project.sourceType === 'stream') {
    return project.streamPlatform === 'twitch' ? (
      <Twitch size={30} className={cls} />
    ) : (
      <Youtube size={32} className={cls} />
    )
  }
  return <Upload size={28} className={cls} />
}

function SourceLabel({ project }: { project: Project }) {
  if (project.sourceType === 'stream') {
    return <span className="capitalize">{project.streamPlatform ?? 'stream'}</span>
  }
  const n = project.sourceFiles?.length ?? 0
  return <span>{n > 1 ? `${n} uploads` : 'Upload'}</span>
}
