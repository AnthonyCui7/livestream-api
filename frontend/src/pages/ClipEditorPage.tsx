import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import type { Clip } from '../types'
import { getClip } from '../services/projects'
import { ClipEditor } from '../components/clips/editor/ClipEditor'

/**
 * Route wrapper for the full-screen clip editor (`/projects/:id/clips/:clipId/
 * edit`). Mounted outside <Layout> for a full-bleed surface, mirroring how
 * narrative mounts its editor. The clip is normally handed over via navigation
 * state (zero extra fetch); on a hard refresh that state is gone, so we fall
 * back to fetching the clip by id.
 */
export default function ClipEditorPage() {
  const { id = '', clipId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const handoff = (location.state as { clip?: Clip } | null)?.clip

  const [clip, setClip] = useState<Clip | null>(
    handoff && handoff.id === clipId ? handoff : null
  )
  const [loading, setLoading] = useState(!clip)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (clip) return
    let alive = true
    setLoading(true)
    setError(false)
    getClip(clipId)
      .then((c) => {
        if (!alive) return
        if (c) setClip(c)
        else setError(true)
        setLoading(false)
      })
      .catch((err) => {
        console.error('[ClipEditorPage] failed to load clip', err)
        if (!alive) return
        setError(true)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [clip, clipId])

  const close = () => navigate(`/projects/${id}`)

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0A0A0A] grid place-items-center">
        <Loader2 size={22} className="text-[#22E55F] animate-spin" />
      </div>
    )
  }

  if (error || !clip) {
    return (
      <div className="fixed inset-0 bg-[#0A0A0A] grid place-items-center text-center px-6">
        <div>
          <p className="text-neutral-400 text-[14px]">This clip could not be loaded.</p>
          <Link
            to={`/projects/${id}`}
            className="text-[#22E55F] text-[13px] hover:underline mt-2 inline-block"
          >
            Back to project
          </Link>
        </div>
      </div>
    )
  }

  if (!clip.videoUrl) {
    return (
      <div className="fixed inset-0 bg-[#0A0A0A] grid place-items-center text-center px-6">
        <div>
          <p className="text-neutral-400 text-[14px]">
            This clip has no rendered video yet, so there's nothing to edit.
          </p>
          <Link
            to={`/projects/${id}`}
            className="text-[#22E55F] text-[13px] hover:underline mt-2 inline-block"
          >
            Back to project
          </Link>
        </div>
      </div>
    )
  }

  return <ClipEditor clip={clip} onClose={close} />
}
