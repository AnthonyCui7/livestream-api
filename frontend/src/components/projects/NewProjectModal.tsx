import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radio, Twitch, Video, X, Youtube } from 'lucide-react'
import type { Project, StreamPlatform } from '../../types'
import { createProject } from '../../services/projects'
import { DEMO_YOUTUBE_PROJECT_ID } from '../../lib/config'
import { showToast } from '../../lib/toast'

interface Props {
  open: boolean
  onClose: () => void
  /** Fired after a successful create (the modal also navigates to the project). */
  onCreated?: (project: Project) => void
}

// Mirrors the router's URL validation: https only, Twitch/YouTube hosts only.
const ALLOWED_HOSTS = new Set([
  'twitch.tv',
  'www.twitch.tv',
  'm.twitch.tv',
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
])

// Mirrors the router's shell-injection guard — the URL ends up inside a
// double-quoted bash string in the worker's user-data, so these are rejected.
// `&` is allowed (literal inside double quotes, common in YouTube URLs).
const DANGEROUS_CHARS = /["'\\$`;|<> ]/

/**
 * Canonicalize pasted YouTube watch links: keep only the video id, dropping
 * tracking/playlist params (`&pp=…`, `&list=…`, `?si=…`) that users copy
 * along with the URL. Non-YouTube and unparseable URLs pass through as-is.
 */
function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if ((host === 'youtube.com' || host.endsWith('.youtube.com')) && parsed.pathname === '/watch') {
      const v = parsed.searchParams.get('v')
      if (v) return `${parsed.origin}/watch?v=${v}`
    }
    if (host === 'youtu.be') {
      return `${parsed.origin}${parsed.pathname}`
    }
  } catch {
    // Not a parseable URL — validation will surface the error.
  }
  return url
}

/** Platform badge detection while typing — lenient on host, unlike validation. */
function detectPlatform(url: string): StreamPlatform | null {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) return 'twitch'
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) {
      return 'youtube'
    }
  } catch {
    // Not a parseable URL (yet).
  }
  return null
}

/** Friendly client-side mirror of the router's rules; null = valid. */
function validateUrl(url: string): string | null {
  if (DANGEROUS_CHARS.test(url)) {
    return 'The URL contains characters that aren’t allowed (quotes, spaces or shell symbols).'
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'Enter a full URL, e.g. https://twitch.tv/yourchannel'
  }
  if (parsed.protocol !== 'https:') return 'Only https:// links are supported.'
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return 'Only Twitch and YouTube links are supported.'
  }
  return null
}

/** The name the router would derive when none is given — shown as placeholder. */
function defaultName(url: string): string {
  const platform = detectPlatform(url)
  if (platform === 'twitch') {
    try {
      const channel = new URL(url).pathname.split('/').filter(Boolean)[0]
      if (channel && channel !== 'videos') return `Twitch: ${channel}`
    } catch {
      // fall through
    }
    return 'Twitch video'
  }
  if (platform === 'youtube') return 'YouTube video'
  return 'New project'
}

/**
 * Create-a-project sheet: source type, stream/video URL and an optional name.
 * Submits to the router (POST /api/projects), which launches the clip worker,
 * then navigates to the new project.
 */
export function NewProjectModal({ open, onClose, onCreated }: Props) {
  const navigate = useNavigate()

  const [sourceType, setSourceType] = useState<'livestream' | 'video'>('livestream')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // While the create request is in flight the modal isn't dismissible
  // (Escape / backdrop / X) — closing mid-create risks a duplicate submit and
  // a surprise navigation after unmount.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, loading])

  if (!open) return null

  const trimmedUrl = cleanUrl(url.trim())
  const platform = detectPlatform(trimmedUrl)
  const urlError = trimmedUrl ? validateUrl(trimmedUrl) : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const invalid = validateUrl(trimmedUrl)
    if (invalid) {
      setError(invalid)
      return
    }
    // YouTube blocks datacenter egress IPs, so a real YouTube job would fail
    // in the worker. Route every YouTube submission to the seeded showcase
    // project instead — no worker, instant results.
    if (platform === 'youtube') {
      showToast('YouTube demo — opening the showcase project')
      onClose()
      navigate(`/projects/${DEMO_YOUTUBE_PROJECT_ID}`)
      return
    }
    setError('')
    setLoading(true)
    try {
      const project = await createProject({
        name: name.trim() || undefined,
        sourceUrl: trimmedUrl,
        sourceType,
      })
      showToast('Project created — spinning up the clip worker…')
      onCreated?.(project)
      navigate(`/projects/${project.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
      onClick={() => {
        if (!loading) onClose()
      }}
    >
      <div
        className="bg-[#171717] ring-1 ring-white/[0.08] rounded-[12px] w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-[#F5F5F3] text-[15px] font-semibold">New project</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 grid place-items-center rounded-[6px] text-neutral-400 hover:text-[#F5F5F3] hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-neutral-400 disabled:hover:bg-transparent"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-500/10 ring-1 ring-red-500/20 rounded-[7px]">
              <p className="text-red-300 text-[12px]">{error}</p>
            </div>
          )}

          {/* Source type */}
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-white/[0.03] rounded-[8px]">
            <SegmentButton
              active={sourceType === 'livestream'}
              onClick={() => setSourceType('livestream')}
            >
              <Radio size={14} />
              Livestream
            </SegmentButton>
            <SegmentButton active={sourceType === 'video'} onClick={() => setSourceType('video')}>
              <Video size={14} />
              Video
            </SegmentButton>
          </div>

          {/* Source URL */}
          <div>
            <label className="block text-neutral-400 text-[12px] mb-1.5">
              {sourceType === 'livestream' ? 'Stream URL' : 'Video URL'}
            </label>
            <div className="relative">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder={
                  sourceType === 'livestream'
                    ? 'https://twitch.tv/yourchannel'
                    : 'https://youtube.com/watch?v=…'
                }
                className="w-full px-3.5 py-2.5 pr-24 bg-white/[0.04] text-[#F5F5F3] text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-[#22E55F]/40 placeholder-neutral-600 transition-colors"
              />
              {platform && (
                <span
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10.5px] font-medium ring-1 ${
                    platform === 'twitch'
                      ? 'text-[#22E55F] bg-[#22E55F]/10 ring-[#22E55F]/25'
                      : 'text-red-300 bg-red-400/10 ring-red-400/25'
                  }`}
                >
                  {platform === 'twitch' ? <Twitch size={11} /> : <Youtube size={12} />}
                  {platform === 'twitch' ? 'Twitch' : 'YouTube'}
                </span>
              )}
            </div>
            {urlError && <p className="mt-1.5 text-[11px] text-red-300/90">{urlError}</p>}
          </div>

          {/* Optional name */}
          <div>
            <label className="block text-neutral-400 text-[12px] mb-1.5">
              Name <span className="text-neutral-600">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultName(trimmedUrl)}
              className="w-full px-3.5 py-2.5 bg-white/[0.04] text-[#F5F5F3] text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-[#22E55F]/40 placeholder-neutral-600 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-[#22E55F] hover:bg-[#35f16d] text-[#0A0A0A] text-[13.5px] font-semibold rounded-[9px] transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating project…' : 'Create project'}
          </button>
        </form>
      </div>
    </div>
  )
}

function SegmentButton({
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
      className={`h-9 inline-flex items-center justify-center gap-1.5 rounded-[6px] text-[12.5px] font-medium transition-colors ${
        active
          ? 'bg-[#22E55F]/15 text-[#22E55F] ring-1 ring-[#22E55F]/25'
          : 'text-neutral-400 hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  )
}
