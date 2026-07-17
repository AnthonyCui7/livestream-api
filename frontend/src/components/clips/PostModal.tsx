import { useEffect, useState } from 'react'
import { Check, Flame, X } from 'lucide-react'
import type { Clip, SocialPlatform } from '../../types'
import { viralityScore, viralityTone } from '../../lib/format'
import { colorFor } from '../../lib/placeholder'
import { platformMeta } from './platformIcons'
import { ClipThumbnail } from './ClipThumbnail'

interface Props {
  open: boolean
  clip: Clip
  platform: SocialPlatform
  onClose: () => void
  onPost: (platform: SocialPlatform, caption: string) => Promise<void>
}

/**
 * Post-a-clip-to-social modal, in the spirit of narrative's SocialMediaModal:
 * a per-platform sheet with the clip preview and a caption. In demo the post
 * is simulated (see services/postClip → lib/demo). Wire OAuth + real upload
 * when the router exposes /api/clips/:id/post.
 */
export function PostModal({ open, clip, platform, onClose, onPost }: Props) {
  const meta = platformMeta(platform)
  const [caption, setCaption] = useState('')
  const [phase, setPhase] = useState<'edit' | 'posting' | 'done'>('edit')

  useEffect(() => {
    if (!open) return
    setCaption(clip.title)
    setPhase('edit')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, clip.title, onClose])

  if (!open) return null

  const score = viralityScore(clip.score)
  const tone = viralityTone(score)
  const alreadyPosted = clip.postedPlatforms?.includes(platform)

  const submit = async () => {
    if (phase !== 'edit') return
    setPhase('posting')
    try {
      await onPost(platform, caption.trim())
      setPhase('done')
      setTimeout(onClose, 900)
    } catch {
      setPhase('edit')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#111113] ring-1 ring-white/[0.08] rounded-[12px] w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="flex items-center gap-2 text-white text-[15px] font-semibold">
            <span className="grid place-items-center w-6 h-6 rounded-[6px] bg-white/[0.06]" style={{ color: meta.color }}>
              <meta.Icon size={14} />
            </span>
            Post to {meta.label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 grid place-items-center rounded-[6px] text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex gap-4">
          {/* Clip preview */}
          <div
            className="relative w-24 shrink-0 aspect-[9/16] rounded-[8px] overflow-hidden ring-1 ring-white/[0.06]"
            style={{ backgroundColor: colorFor(clip.id) }}
          >
            <ClipThumbnail clip={clip} />
            <div className={`absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full ring-1 ${tone.bg} ${tone.ring} ${tone.text}`}>
              <Flame size={10} />
              <span className="text-[10px] font-semibold tabular-nums leading-none">{score}</span>
            </div>
          </div>

          {/* Caption */}
          <div className="flex-1 min-w-0">
            <label className="block text-neutral-400 text-[12px] mb-1.5">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              disabled={phase !== 'edit'}
              className="w-full px-3 py-2 bg-white/[0.04] text-white text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-violet-500/40 placeholder-neutral-600 resize-none transition-colors disabled:opacity-60"
              placeholder="Write a caption…"
            />
            {alreadyPosted && phase === 'edit' && (
              <p className="mt-1.5 text-[11px] text-neutral-500">Already posted to {meta.label} — posting again.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.06]">
          {/* HARDCODED: demo notice — real posting needs OAuth + the router API */}
          <span className="text-[11px] text-neutral-600">Demo — no real upload</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-[13px] text-neutral-300 hover:text-white rounded-[7px] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={phase !== 'edit' || caption.trim().length === 0}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-[7px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {phase === 'done' ? (
                <>
                  <Check size={15} /> Posted
                </>
              ) : phase === 'posting' ? (
                'Posting…'
              ) : (
                `Post to ${meta.label}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
