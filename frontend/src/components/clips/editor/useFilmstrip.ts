import { useEffect, useState } from 'react'

/**
 * Result of decoding a filmstrip for the trim timeline. `thumbs` fills in
 * progressively as frames decode; `blocked` means the source video is
 * cross-origin without CORS headers, so the canvas is tainted and no
 * thumbnails are possible — the timeline degrades to a plain track (scrubbing
 * and trimming still work, only the preview frames are missing).
 */
export interface Filmstrip {
  thumbs: string[]
  ready: boolean
  blocked: boolean
}

/**
 * Decode `count` evenly-spaced poster frames from a video URL by seeking an
 * offscreen <video> and snapshotting each frame to a canvas. This is the
 * plain-`<video>` filmstrip from narrative's playground (the mature editor uses
 * mediabunny's CanvasSink; overkill for one short clip). Each slot samples the
 * midpoint of its time range — `((i + 0.5) / count) * duration`.
 */
export function useFilmstrip(src: string | null | undefined, count = 16): Filmstrip {
  const [state, setState] = useState<Filmstrip>({ thumbs: [], ready: false, blocked: false })

  useEffect(() => {
    if (!src) {
      setState({ thumbs: [], ready: true, blocked: false })
      return
    }
    let dead = false
    setState({ thumbs: [], ready: false, blocked: false })

    const video = document.createElement('video')
    video.src = src
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'auto'
    video.playsInline = true

    const canvas = document.createElement('canvas')

    const seekTo = (t: number) =>
      new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked)
        video.currentTime = t
      })

    const run = async () => {
      const duration = video.duration
      if (!isFinite(duration) || duration <= 0) {
        if (!dead) setState({ thumbs: [], ready: true, blocked: false })
        return
      }
      const w = 120
      const aspect = video.videoWidth > 0 ? video.videoHeight / video.videoWidth : 16 / 9
      const h = Math.max(1, Math.round(w * aspect))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        if (!dead) setState({ thumbs: [], ready: true, blocked: false })
        return
      }
      const out: string[] = []
      for (let i = 0; i < count; i++) {
        if (dead) return
        const t = Math.min(((i + 0.5) / count) * duration, Math.max(0, duration - 0.05))
        try {
          await seekTo(t)
          if (dead) return
          ctx.drawImage(video, 0, 0, w, h)
          out.push(canvas.toDataURL('image/jpeg', 0.5))
        } catch {
          // SecurityError: tainted canvas (cross-origin video, no CORS headers).
          if (!dead) setState({ thumbs: [], ready: true, blocked: true })
          return
        }
        if (!dead) setState({ thumbs: [...out], ready: out.length === count, blocked: false })
      }
    }

    const onMeta = () => void run()
    const onError = () => {
      if (!dead) setState({ thumbs: [], ready: true, blocked: true })
    }
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('error', onError)

    return () => {
      dead = true
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('error', onError)
      video.removeAttribute('src')
      video.load()
    }
  }, [src, count])

  return state
}
