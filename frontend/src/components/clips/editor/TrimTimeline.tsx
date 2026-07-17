import { useRef } from 'react'
import type { Caption } from '../../../types'
import { formatDuration } from '../../../lib/format'
import { CAPTION_MIN_DURATION } from '../../../lib/captions'
import { useFilmstrip } from './useFilmstrip'

/** Shortest allowed trimmed clip. */
export const TRIM_MIN_DURATION = 0.3

interface Trim {
  start: number
  end: number
}

interface Props {
  src: string
  duration: number
  currentTime: number
  trim: Trim
  captions: Caption[]
  selectedCaptionId: string | null
  onSeek: (t: number) => void
  onTrimChange: (trim: Trim) => void
  onTrimGestureStart: () => void
  onSelectCaption: (id: string) => void
  onCaptionRangeChange: (id: string, start: number, end: number) => void
  onCaptionGestureStart: () => void
}

/**
 * The scrub + trim surface. One coordinate space (`bodyRef`) is shared by the
 * ruler, filmstrip, trim handles, caption lane and playhead, so a pointer x
 * maps to the same time everywhere: `t = (x - left) / width * duration`, and
 * placement is its exact inverse (`x% = t / duration`). Drags are rAF-coalesced
 * and clamp-on-commit (constraint == commit), following narrative's timeline.
 */
export function TrimTimeline({
  src,
  duration,
  currentTime,
  trim,
  captions,
  selectedCaptionId,
  onSeek,
  onTrimChange,
  onTrimGestureStart,
  onSelectCaption,
  onCaptionRangeChange,
  onCaptionGestureStart,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const { thumbs, blocked } = useFilmstrip(src)

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0)

  const clientXToTime = (clientX: number): number => {
    const rect = bodyRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || duration <= 0) return 0
    const frac = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(duration, frac * duration))
  }

  // rAF-coalesced document drag. `onFrame` receives the latest clientX at most
  // once per animation frame; `onFirst` fires once (undo snapshot).
  const beginDrag = (onFrame: (clientX: number) => void, onFirst?: () => void) => {
    let started = false
    let pendingX: number | null = null
    let frame = 0
    const flush = () => {
      frame = 0
      if (pendingX === null) return
      const x = pendingX
      pendingX = null
      onFrame(x)
    }
    const move = (ev: PointerEvent) => {
      if (!started) {
        started = true
        onFirst?.()
      }
      pendingX = ev.clientX
      if (!frame) frame = requestAnimationFrame(flush)
    }
    const up = () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  // --- scrub: click / drag anywhere on the track that isn't a handle/caption
  const onScrubPointerDown = (e: React.PointerEvent) => {
    onSeek(clientXToTime(e.clientX))
    beginDrag((clientX) => onSeek(clientXToTime(clientX)))
  }

  // --- trim handles (opposite edge is fixed for the whole gesture)
  const onTrimHandleDown = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const fixedEnd = trim.end
    const fixedStart = trim.start
    beginDrag(
      (clientX) => {
        const t = clientXToTime(clientX)
        if (which === 'start') {
          const start = Math.min(fixedEnd - TRIM_MIN_DURATION, Math.max(0, t))
          onTrimChange({ start, end: fixedEnd })
          onSeek(start)
        } else {
          const end = Math.max(fixedStart + TRIM_MIN_DURATION, Math.min(duration, t))
          onTrimChange({ start: fixedStart, end })
          onSeek(end)
        }
      },
      onTrimGestureStart
    )
  }

  // --- caption blocks: move body / resize either edge
  const onCaptionDown =
    (cap: Caption, mode: 'move' | 'start' | 'end') => (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      onSelectCaption(cap.id)
      const rect = bodyRef.current?.getBoundingClientRect()
      const width = rect?.width ?? 1
      const startClientX = e.clientX
      const origStart = cap.startSeconds
      const origEnd = cap.endSeconds
      beginDrag(
        (clientX) => {
          const dt = duration > 0 ? ((clientX - startClientX) / width) * duration : 0
          let s = origStart
          let en = origEnd
          if (mode === 'move') {
            const len = origEnd - origStart
            s = Math.max(0, Math.min(duration - len, origStart + dt))
            en = s + len
          } else if (mode === 'start') {
            s = Math.min(origEnd - CAPTION_MIN_DURATION, Math.max(0, origStart + dt))
          } else {
            en = Math.max(origStart + CAPTION_MIN_DURATION, Math.min(duration, origEnd + dt))
          }
          onCaptionRangeChange(cap.id, s, en)
        },
        onCaptionGestureStart
      )
    }

  const ticks = tickTimes(duration)

  return (
    <div className="select-none" style={{ touchAction: 'none' }}>
      <div ref={bodyRef} className="relative">
        {/* Ruler */}
        <div className="relative h-4 mb-1">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute top-0 bottom-0 flex items-center"
              style={{ left: `${pct(t)}%`, transform: 'translateX(-50%)' }}
            >
              <span className="text-[9.5px] tabular-nums text-neutral-500 leading-none whitespace-nowrap">
                {formatDuration(t)}
              </span>
            </div>
          ))}
        </div>

        {/* Filmstrip track (scrub surface). Handles live OUTSIDE the clipped
            visuals so the 0% / 100% edges stay fully grabbable. */}
        <div
          className="relative h-14 rounded-[6px] ring-1 ring-white/[0.06] cursor-pointer"
          onPointerDown={onScrubPointerDown}
        >
          {/* clipped visuals: thumbnails + dim + kept-range */}
          <div className="absolute inset-0 rounded-[6px] overflow-hidden bg-neutral-900">
            <div className="absolute inset-0 flex">
              {thumbs.length > 0
                ? thumbs.map((u, i) => (
                    <img
                      key={i}
                      src={u}
                      alt=""
                      draggable={false}
                      className="h-full flex-1 object-cover pointer-events-none min-w-0"
                    />
                  ))
                : !blocked && <div className="flex-1 animate-pulse bg-white/[0.03]" />}
            </div>

            {/* dim the trimmed-out regions */}
            <div
              className="absolute inset-y-0 left-0 bg-black/60 pointer-events-none"
              style={{ width: `${pct(trim.start)}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-black/60 pointer-events-none"
              style={{ left: `${pct(trim.end)}%` }}
            />

            {/* kept-range outline */}
            <div
              className="absolute inset-y-0 ring-2 ring-inset ring-violet-500/80 pointer-events-none rounded-[2px]"
              style={{ left: `${pct(trim.start)}%`, width: `${pct(trim.end - trim.start)}%` }}
            />
          </div>

          {/* trim handles (unclipped) */}
          <TrimHandle side="start" left={pct(trim.start)} onPointerDown={onTrimHandleDown('start')} />
          <TrimHandle side="end" left={pct(trim.end)} onPointerDown={onTrimHandleDown('end')} />
        </div>

        {/* Caption lane */}
        <div className="relative h-6 mt-1">
          {captions.length === 0 ? (
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-[10px] text-neutral-600">No captions yet</span>
            </div>
          ) : (
            captions.map((cap) => {
              const selected = cap.id === selectedCaptionId
              return (
                <div
                  key={cap.id}
                  onPointerDown={onCaptionDown(cap, 'move')}
                  className={`absolute top-0 bottom-0 rounded-[4px] flex items-center px-1 overflow-hidden cursor-grab active:cursor-grabbing ${
                    selected
                      ? 'bg-violet-500/30 ring-1 ring-violet-400/70'
                      : 'bg-white/[0.08] ring-1 ring-white/10 hover:bg-white/[0.12]'
                  }`}
                  style={{ left: `${pct(cap.startSeconds)}%`, width: `${pct(cap.endSeconds - cap.startSeconds)}%` }}
                  title={cap.text}
                >
                  {/* resize edges */}
                  <span
                    onPointerDown={onCaptionDown(cap, 'start')}
                    className="absolute left-0 inset-y-0 w-1.5 cursor-ew-resize"
                  />
                  <span className="text-[10px] text-neutral-200 truncate leading-none pointer-events-none">
                    {cap.text || 'Caption'}
                  </span>
                  <span
                    onPointerDown={onCaptionDown(cap, 'end')}
                    className="absolute right-0 inset-y-0 w-1.5 cursor-ew-resize"
                  />
                </div>
              )
            })
          )}
        </div>

        {/* Playhead — spans filmstrip + caption lane (below the ruler) */}
        <div
          className="absolute pointer-events-none"
          style={{ left: `${pct(currentTime)}%`, top: 20, bottom: 0, transform: 'translateX(-50%)' }}
        >
          <div className="w-px h-full bg-white/90 shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-white shadow-sm" />
        </div>
      </div>

      {blocked && (
        <p className="mt-1.5 text-[10.5px] text-neutral-600">
          Preview frames unavailable for this source — scrubbing and trimming still work.
        </p>
      )}
    </div>
  )
}

function TrimHandle({
  side,
  left,
  onPointerDown,
}: {
  side: 'start' | 'end'
  left: number
  onPointerDown: (e: React.PointerEvent) => void
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute top-0 bottom-0 w-5 flex items-center justify-center cursor-ew-resize group z-10"
      style={{ left: `${left}%`, transform: 'translateX(-50%)', touchAction: 'none' }}
      aria-label={side === 'start' ? 'Trim start' : 'Trim end'}
    >
      <div className="w-1.5 h-9 rounded-full bg-violet-400 group-hover:bg-violet-300 shadow ring-1 ring-black/30" />
    </div>
  )
}

/** ~6 evenly-spaced, "nice" tick times across the duration (excluding 0/end
 *  crowding). */
function tickTimes(duration: number): number[] {
  if (!isFinite(duration) || duration <= 0) return [0]
  const target = duration / 6
  const nice = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s >= target) ?? 600
  const out: number[] = []
  for (let t = 0; t < duration - nice * 0.4; t += nice) out.push(t)
  out.push(Math.round(duration))
  return out
}
