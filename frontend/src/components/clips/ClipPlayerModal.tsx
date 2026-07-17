import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { Clip } from '../../types'

/**
 * Minimal clip player, same modal pattern as PostModal: the play button on a
 * rendered clip opens its video (`clips.video_url`) in a 9:16 frame.
 */
export function ClipPlayerModal({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!clip.videoUrl) return null

  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111113] ring-1 ring-white/[0.08] rounded-[12px] w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-white text-[15px] font-semibold truncate">{clip.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-7 h-7 grid place-items-center rounded-[6px] text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <video
          src={clip.videoUrl}
          controls
          autoPlay
          playsInline
          className="w-full aspect-[9/16] max-h-[70vh] object-contain bg-black"
        />
      </div>
    </div>
  )
}
