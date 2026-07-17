import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Clip } from '../../types'
import { CAPTION_REFERENCE_WIDTH } from '../../lib/captions'
import { getCropPref } from '../../lib/cropPref'
import { CaptionOverlayLayer } from './editor/CaptionOverlayLayer'

/**
 * Minimal clip player, same modal pattern as PostModal: the play button on a
 * rendered clip opens its video (`clips.video_url`) in a 9:16 frame. When the
 * clip has saved edits it plays the trimmed window and paints the captions on
 * top (display-only), so a reviewer sees exactly what the editor produced.
 */
export function ClipPlayerModal({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [width, setWidth] = useState(0)

  const captions = clip.edits?.captions ?? []
  const trimStart = clip.edits?.trimStart ?? 0
  const trimEnd = clip.edits?.trimEnd
  // Local reframe preference (the card's frontend-only toggle) wins over the
  // server-saved edit; both default to the full 16:9 frame.
  const crop = getCropPref(clip.id) ?? clip.edits?.crop ?? null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0))
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  if (!clip.videoUrl) return null

  const scale = width > 0 ? width / CAPTION_REFERENCE_WIDTH : 0.3

  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        // Size the dialog to the frame: landscape clips get real width,
        // vertical clips stay a tall column (height is the limit there).
        className={`bg-[#171717] ring-1 ring-white/[0.08] rounded-[12px] w-full overflow-hidden ${
          crop === 'center' ? 'max-w-md' : 'max-w-3xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-[#F5F5F3] text-[15px] font-semibold truncate">{clip.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-7 h-7 grid place-items-center rounded-[6px] text-neutral-400 hover:text-[#F5F5F3] hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div
          ref={boxRef}
          className={`relative w-full max-h-[78vh] overflow-hidden bg-black ${
            crop === 'center' ? 'aspect-[9/16]' : 'aspect-video'
          }`}
        >
          <video
            src={clip.videoUrl}
            controls
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full bg-black object-cover"
            onLoadedMetadata={(e) => {
              if (trimStart > 0) e.currentTarget.currentTime = trimStart
            }}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime
              if (trimEnd != null && t >= trimEnd) {
                e.currentTarget.pause()
                e.currentTarget.currentTime = trimEnd
              }
              setCurrentTime(t)
            }}
          />
          {captions.length > 0 && (
            <CaptionOverlayLayer captions={captions} currentTime={currentTime} scale={scale} />
          )}
        </div>
      </div>
    </div>
  )
}
