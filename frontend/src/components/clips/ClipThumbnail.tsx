import { useEffect, useRef, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import type { Clip } from '../../types'

/**
 * The visual fill of a clip tile, with a three-step fallback:
 *   1. `posterUrl` (DB `clips.metadata.thumbnail_url`) — a real thumbnail;
 *      if it fails to load we fall through to step 2
 *   2. the rendered mp4's first frame, via an inert `<video>` — existing
 *      clips predate thumbnails, so this is a common path; mounted lazily so
 *      a large grid doesn't open a media stream per tile on page load
 *   3. a neutral icon on the solid `colorFor()` tile the parent paints
 * Renders absolutely-positioned layers — the parent supplies the aspect
 * ratio, rounding, background color and any overlays.
 */
export function ClipThumbnail({ clip, crop }: { clip: Clip; crop?: 'center' | null }) {
  const [posterFailed, setPosterFailed] = useState(false)
  // Center-crop fills the vertical tile (cropping the 16:9 sides); otherwise
  // the full frame letterboxes inside it. `crop` prop overrides the saved edit
  // so toggles can preview optimistically.
  const effectiveCrop = crop !== undefined ? crop : (clip.edits?.crop ?? null)
  const fit = effectiveCrop === 'center' ? 'object-cover' : 'object-contain'

  if (clip.posterUrl && !posterFailed) {
    return (
      <img
        src={clip.posterUrl}
        alt=""
        loading="lazy"
        onError={() => setPosterFailed(true)}
        className={`absolute inset-0 w-full h-full ${fit}`}
      />
    )
  }

  if (clip.videoUrl) {
    return <LazyVideoFrame videoUrl={clip.videoUrl} fit={fit} />
  }

  // Nothing renderable yet (clip still detecting/rendering) — a quiet icon
  // on the parent's solid color so the layout never jumps.
  return (
    <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
      <Clapperboard size={20} className="text-[#F5F5F3]/30" />
    </div>
  )
}

/**
 * Pseudo-thumbnail from the mp4's first frame. The `<video>` mounts only once
 * the tile nears the viewport: browsers cap live media elements per page, and
 * even preload="metadata" costs a ranged fetch per tile — so offscreen tiles
 * stay as the parent's solid color until scrolled close.
 */
function LazyVideoFrame({ videoUrl, fit }: { videoUrl: string; fit: string }) {
  const tileRef = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(false)

  useEffect(() => {
    const node = tileRef.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={tileRef} aria-hidden="true" className="absolute inset-0">
      {nearViewport && (
        // The `#t=0.1` media fragment nudges browsers (Safari especially) to
        // actually paint a frame under preload="metadata". Purely decorative —
        // muted, no controls, invisible to pointer and a11y.
        <video
          src={`${videoUrl}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          className={`absolute inset-0 w-full h-full ${fit} pointer-events-none`}
        />
      )}
    </div>
  )
}
