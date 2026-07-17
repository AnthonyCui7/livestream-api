import { useEffect, useRef, useState } from 'react'
import { Film, Link2, Twitch, Upload, X, Youtube } from 'lucide-react'
import type { StreamPlatform } from '../../types'
import type { CreateProjectInput } from '../../services/projects'

interface Props {
  open: boolean
  onCancel: () => void
  onCreate: (input: CreateProjectInput) => Promise<void>
}

type Tab = 'upload' | 'stream'

/** Detect the streaming platform from a pasted URL. Returns null if unknown. */
function detectPlatform(url: string): StreamPlatform | null {
  const u = url.toLowerCase()
  if (u.includes('twitch.tv')) return 'twitch'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  return null
}

function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  const gb = bytes / 1e9
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`
}

export function CreateProjectModal({ open, onCancel, onCreate }: Props) {
  const [tab, setTab] = useState<Tab>('upload')
  const [name, setName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [streamUrl, setStreamUrl] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // Reset the form only when the modal transitions open. Keyed on `open`
  // alone — a parent re-render (new callback identity, a background data
  // load, etc.) must never wipe the user's in-progress input.
  useEffect(() => {
    if (!open) return
    setTab('upload')
    setName('')
    setFiles([])
    setStreamUrl('')
    setBusy(false)
    const t = setTimeout(() => nameRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  // Escape-to-close. Separate effect so re-binding the listener when
  // `onCancel`'s identity changes never touches form state.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const platform = detectPlatform(streamUrl)
  const streamValid = streamUrl.trim().length > 0 && platform !== null
  const canSubmit =
    name.trim().length > 0 && (tab === 'upload' ? files.length > 0 : streamValid) && !busy

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const vids = Array.from(list).filter((f) => f.type.startsWith('video/') || f.type === '')
    setFiles((prev) => [...prev, ...vids])
    // Default the project name to the first file if the user hasn't typed one.
    setName((prev) => prev || vids[0]?.name.replace(/\.[^.]+$/, '') || prev)
  }

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      const input: CreateProjectInput =
        tab === 'upload'
          ? {
              name: name.trim(),
              sourceType: 'vod',
              // DEMO: we don't actually upload — only the names/sizes are kept.
              sourceFiles: files.map((f) => ({ name: f.name, sizeBytes: f.size })),
            }
          : {
              name: name.trim(),
              sourceType: 'stream',
              streamUrl: streamUrl.trim(),
              streamPlatform: platform ?? undefined,
            }
      await onCreate(input)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-[#111113] ring-1 ring-white/[0.08] rounded-[12px] w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-white text-[15px] font-semibold">New project</h2>
          <button
            type="button"
            onClick={onCancel}
            className="w-7 h-7 grid place-items-center rounded-[6px] text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-neutral-400 text-[12px] mb-1.5">Project name</label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Podcast Ep. 143"
              className="w-full px-3 py-2.5 bg-white/[0.04] text-white text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-violet-500/40 placeholder-neutral-600 transition-colors"
            />
          </div>

          {/* Source tabs */}
          <div>
            <label className="block text-neutral-400 text-[12px] mb-1.5">Source</label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-white/[0.03] rounded-[8px]">
              <TabButton active={tab === 'upload'} onClick={() => setTab('upload')} icon={<Upload size={14} />}>
                Upload videos
              </TabButton>
              <TabButton active={tab === 'stream'} onClick={() => setTab('stream')} icon={<Link2 size={14} />}>
                Stream link
              </TabButton>
            </div>
          </div>

          {/* Upload panel */}
          {tab === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  addFiles(e.dataTransfer.files)
                }}
                className={`w-full rounded-[9px] border border-dashed py-8 grid place-items-center gap-1.5 transition-colors ${
                  dragOver
                    ? 'border-violet-400/60 bg-violet-500/[0.06]'
                    : 'border-white/[0.10] hover:border-white/20 bg-white/[0.02]'
                }`}
              >
                <Upload size={20} className="text-neutral-400" />
                <span className="text-neutral-300 text-[12.5px] font-medium">
                  Drop videos here or click to browse
                </span>
                <span className="text-neutral-600 text-[11px]">MP4, MOV, MKV — one or many</span>
              </button>

              {files.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 px-2.5 py-2 bg-white/[0.03] rounded-[7px]"
                    >
                      <Film size={14} className="text-neutral-500 shrink-0" />
                      <span className="text-neutral-200 text-[12px] truncate flex-1">{f.name}</span>
                      <span className="text-neutral-500 text-[11px] tabular-nums shrink-0">
                        {formatBytes(f.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="text-neutral-500 hover:text-white shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Stream panel */}
          {tab === 'stream' && (
            <div>
              <div className="relative">
                <input
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=…  or  twitch.tv/…"
                  className="w-full pl-9 pr-3 py-2.5 bg-white/[0.04] text-white text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-violet-500/40 placeholder-neutral-600 transition-colors"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                  {platform === 'twitch' ? (
                    <Twitch size={15} className="text-[#a970ff]" />
                  ) : platform === 'youtube' ? (
                    <Youtube size={16} className="text-[#ff4d4d]" />
                  ) : (
                    <Link2 size={15} />
                  )}
                </span>
              </div>
              <p className="mt-2 text-[11.5px] text-neutral-500">
                {streamUrl.trim().length === 0
                  ? 'Paste a YouTube or Twitch link — a VOD or a live stream.'
                  : platform
                    ? `Detected ${platform === 'youtube' ? 'YouTube' : 'Twitch'}. We’ll pull the stream and start clipping.`
                    : 'Unrecognized link — only YouTube and Twitch are supported.'}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 px-4 text-[13px] text-neutral-300 hover:text-white rounded-[7px] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="h-9 px-4 text-[13px] font-semibold text-white bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-[7px] hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 h-9 rounded-[6px] text-[12.5px] font-medium transition-colors ${
        active ? 'bg-white/[0.09] text-white' : 'text-neutral-400 hover:text-neutral-200'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}
