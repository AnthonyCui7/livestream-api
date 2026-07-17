import { useEffect, useRef, useState, type RefObject } from 'react'
import { Play } from 'lucide-react'
import type { Caption } from '../../../types'
import { CAPTION_REFERENCE_WIDTH } from '../../../lib/captions'
import { CaptionOverlayLayer } from './CaptionOverlayLayer'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  src: string
  bgColor: string
  /** Center-crop the video to fill the 9:16 frame (else letterbox it). */
  crop?: boolean
  captions: Caption[]
  currentTime: number
  playing: boolean
  selectedCaptionId: string | null
  onSelectCaption: (id: string) => void
  onMoveCaption: (id: string, x: number, y: number) => void
  onCaptionGestureStart: () => void
  onEditCaptionText: (id: string, text: string) => void
  onLoadedMetadata: (duration: number) => void
  onTogglePlay: () => void
  /** Click on empty preview space (deselects captions). */
  onBackgroundClick: () => void
}

/**
 * The editor's preview: a 9:16 <video> with the caption overlay stacked on top
 * (a sibling layer, exactly like narrative — the video component never owns the
 * overlays) and a centered play affordance. Measures its own rendered width to
 * scale captions authored against the 1080px reference frame.
 */
export function EditorPreview({
  videoRef,
  src,
  bgColor,
  crop = false,
  captions,
  currentTime,
  playing,
  selectedCaptionId,
  onSelectCaption,
  onMoveCaption,
  onCaptionGestureStart,
  onEditCaptionText,
  onLoadedMetadata,
  onTogglePlay,
  onBackgroundClick,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setWidth(w)
    })
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const scale = width > 0 ? width / CAPTION_REFERENCE_WIDTH : 0.3

  return (
    <div className="flex-1 min-h-0 grid place-items-center p-4" onPointerDown={onBackgroundClick}>
      <div
        ref={boxRef}
        // Reframe: the preview frame itself flips between 9:16 (center-crop)
        // and the source's 16:9 (full picture).
        className={`relative max-h-full max-w-full rounded-[10px] overflow-hidden ring-1 ring-white/[0.08] shadow-2xl ${
          crop ? 'h-full aspect-[9/16]' : 'w-full aspect-video'
        }`}
        style={{ backgroundColor: bgColor }}
        // Clicks inside the player shouldn't bubble to the deselect handler,
        // except the video surface itself (handled below) toggles playback.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          src={src}
          playsInline
          className="absolute inset-0 w-full h-full bg-black object-cover"
          onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget.duration)}
          onClick={onTogglePlay}
        />

        <CaptionOverlayLayer
          captions={captions}
          currentTime={currentTime}
          scale={scale}
          editable
          selectedId={selectedCaptionId}
          onSelect={onSelectCaption}
          onMove={onMoveCaption}
          onGestureStart={onCaptionGestureStart}
          onEditText={onEditCaptionText}
        />

        {!playing && (
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label="Play"
            className="absolute inset-0 grid place-items-center bg-black/15 hover:bg-black/25 transition-colors"
          >
            <span className="grid place-items-center w-14 h-14 rounded-full bg-[#22E55F] text-[#0A0A0A] shadow-lg">
              <Play size={22} className="ml-0.5 fill-current" />
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
