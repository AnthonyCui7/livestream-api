import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Crop, Loader2, Pause, Play, Redo2, Undo2 } from 'lucide-react'
import type { Caption, Clip, CaptionStyle, ClipEdits } from '../../../types'
import { formatDuration } from '../../../lib/format'
import { colorFor } from '../../../lib/placeholder'
import { createCaption } from '../../../lib/captions'
import { saveClipEdits } from '../../../services/projects'
import { showToast } from '../../../lib/toast'
import { EditorPreview } from './EditorPreview'
import { TrimTimeline } from './TrimTimeline'
import { CaptionInspector } from './CaptionInspector'
import { useEditorKeyboard } from './useEditorKeyboard'

interface Trim {
  start: number
  end: number
}

interface Snapshot {
  trim: Trim
  captions: Caption[]
  title: string
  crop: 'center' | null
}

/**
 * Full-screen clip editor: trim the clip's length and overlay timed captions,
 * then save. Follows narrative's editor structure (preview + caption overlay
 * sibling layer, a scrub/trim timeline, an inspector, a ref-based undo stack)
 * collapsed to a single clip + caption list. The clip's own rendered video is
 * the working media; time 0 is its start. Edits persist as `ClipEdits` and are
 * merged back onto the clip on read (see services/saveClipEdits).
 */
export function ClipEditor({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  const videoUrl = clip.videoUrl ?? ''

  // ── edit state ────────────────────────────────────────────────────────────
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [trim, setTrim] = useState<Trim>({ start: 0, end: 0 })
  const [captions, setCaptions] = useState<Caption[]>(() =>
    (clip.edits?.captions ?? []).map((c) => ({ ...c, style: { ...c.style } }))
  )
  const [title, setTitle] = useState(clip.title)
  const [crop, setCrop] = useState<'center' | null>(clip.edits?.crop ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)

  // Refs mirror committed state so imperative handlers / rAF / snapshots read
  // the current values without re-subscribing.
  const trimRef = useRef(trim)
  trimRef.current = trim
  const captionsRef = useRef(captions)
  captionsRef.current = captions
  const titleRef = useRef(title)
  titleRef.current = title
  const cropRef = useRef(crop)
  cropRef.current = crop

  // ── undo / redo (ref stacks + a version counter to recompute can-undo/redo)
  const historyRef = useRef<Snapshot[]>([])
  const redoRef = useRef<Snapshot[]>([])
  const [histVersion, setHistVersion] = useState(0)

  const pushSnapshot = useCallback(() => {
    const snap: Snapshot = {
      trim: trimRef.current,
      captions: captionsRef.current,
      title: titleRef.current,
      crop: cropRef.current,
    }
    const top = historyRef.current[historyRef.current.length - 1]
    if (top && JSON.stringify(top) === JSON.stringify(snap)) return
    historyRef.current.push(snap)
    redoRef.current = []
    setHistVersion((v) => v + 1)
  }, [])

  const restore = useCallback((snap: Snapshot) => {
    setTrim(snap.trim)
    setCaptions(snap.captions)
    setTitle(snap.title)
    setCrop(snap.crop)
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return
    const prev = historyRef.current.pop()!
    redoRef.current.push({
      trim: trimRef.current,
      captions: captionsRef.current,
      title: titleRef.current,
      crop: cropRef.current,
    })
    restore(prev)
    setHistVersion((v) => v + 1)
  }, [restore])

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return
    const next = redoRef.current.pop()!
    historyRef.current.push({
      trim: trimRef.current,
      captions: captionsRef.current,
      title: titleRef.current,
      crop: cropRef.current,
    })
    restore(next)
    setHistVersion((v) => v + 1)
  }, [restore])

  void histVersion // read so can-undo/redo recompute on change
  const canUndo = historyRef.current.length > 0
  const canRedo = redoRef.current.length > 0

  // ── mutation helpers (no snapshot — callers snapshot at gesture start) ──────
  const applyTrim = useCallback((t: Trim) => {
    setTrim(t)
    setDirty(true)
  }, [])
  const patchCaption = useCallback((id: string, patch: Partial<Caption>) => {
    setCaptions((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    setDirty(true)
  }, [])
  const patchCaptionStyle = useCallback((id: string, patch: Partial<CaptionStyle>) => {
    setCaptions((cs) => cs.map((c) => (c.id === id ? { ...c, style: { ...c.style, ...patch } } : c)))
    setDirty(true)
  }, [])
  const setTitleValue = useCallback((t: string) => {
    setTitle(t)
    setDirty(true)
  }, [])
  const toggleCrop = useCallback(() => {
    pushSnapshot()
    setCrop((c) => (c === 'center' ? null : 'center'))
    setDirty(true)
  }, [pushSnapshot])

  // ── playback ────────────────────────────────────────────────────────────
  const seek = useCallback((t: number) => {
    const v = videoRef.current
    const clamped = Math.max(0, Math.min(v?.duration || t, t))
    if (v) v.currentTime = clamped
    setCurrentTime(clamped)
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      const { start, end } = trimRef.current
      if (v.currentTime >= end - 0.02 || v.currentTime < start) v.currentTime = start
      void v.play()
    } else {
      v.pause()
    }
  }, [])

  const step = useCallback(
    (delta: number) => {
      const v = videoRef.current
      if (v && !v.paused) v.pause()
      seek((videoRef.current?.currentTime ?? currentTime) + delta)
    },
    [seek, currentTime]
  )

  // Keep `playing` synced with the element; clamp playback to the trim window.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      const v = videoRef.current
      if (v) {
        if (v.currentTime >= trimRef.current.end) {
          v.currentTime = trimRef.current.end
          v.pause()
          setCurrentTime(trimRef.current.end)
          return
        }
        setCurrentTime(v.currentTime)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // ── metadata: initialize trim window (once) from saved edits or full clip ──
  const onLoadedMetadata = useCallback(
    (dur: number) => {
      const safe = isFinite(dur) && dur > 0 ? dur : 0
      setDuration(safe)
      const start = Math.max(0, Math.min(clip.edits?.trimStart ?? 0, safe))
      const end = Math.max(start, Math.min(clip.edits?.trimEnd ?? safe, safe))
      setTrim({ start, end })
      const v = videoRef.current
      if (v) v.currentTime = start
      setCurrentTime(start)
    },
    [clip.edits]
  )

  // ── caption actions ───────────────────────────────────────────────────────
  const addCaption = useCallback(() => {
    pushSnapshot()
    const cap = createCaption(currentTime, duration || 1)
    setCaptions((cs) => [...cs, cap])
    setSelectedId(cap.id)
    setDirty(true)
  }, [pushSnapshot, currentTime, duration])

  const deleteCaption = useCallback(
    (id: string) => {
      pushSnapshot()
      setCaptions((cs) => cs.filter((c) => c.id !== id))
      setSelectedId((cur) => (cur === id ? null : cur))
      setDirty(true)
    },
    [pushSnapshot]
  )

  // Selecting from the list moves the playhead into the caption so it's visible.
  const selectFromList = useCallback(
    (id: string) => {
      setSelectedId(id)
      const cap = captionsRef.current.find((c) => c.id === id)
      if (cap && (currentTime < cap.startSeconds || currentTime >= cap.endSeconds)) {
        seek(Math.min(cap.startSeconds + 0.05, cap.endSeconds - 0.01))
      }
    },
    [currentTime, seek]
  )

  // ── save ──────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (saving) return
    setSaving(true)
    const t = trimRef.current
    const edits: ClipEdits = {
      title: titleRef.current,
      trimStart: t.start > 0.05 ? round(t.start) : undefined,
      trimEnd: duration > 0 && t.end < duration - 0.05 ? round(t.end) : undefined,
      captions: captionsRef.current.map((c) => ({ ...c, style: { ...c.style } })),
      crop: cropRef.current ?? undefined,
      updatedAt: new Date().toISOString(),
    }
    try {
      await saveClipEdits(clip.id, edits)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      showToast('Clip saved')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save the clip')
    } finally {
      setSaving(false)
    }
  }, [clip.id, duration, saving])

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved edits to this clip?')) return
    onClose()
  }, [dirty, onClose])

  useEditorKeyboard({
    onTogglePlay: togglePlay,
    onSave: () => void save(),
    onUndo: undo,
    onRedo: redo,
    onDeleteSelected: () => selectedId && deleteCaption(selectedId),
    onStep: step,
  })

  // Escape closes (with a discard guard). Kept separate from the shortcut hook
  // so it works regardless of focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  const trimmedLength = useMemo(() => Math.max(0, trim.end - trim.start), [trim])
  const bgColor = colorFor(clip.id)

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0b] flex flex-col text-white">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/[0.06]">
        <button
          type="button"
          onClick={requestClose}
          className="inline-flex items-center gap-1.5 h-8 pl-2 pr-3 text-[13px] text-neutral-300 hover:text-white hover:bg-white/[0.06] rounded-[7px] transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="w-px h-5 bg-white/[0.08]" />
        <input
          value={title}
          onFocus={pushSnapshot}
          onChange={(e) => setTitleValue(e.target.value)}
          className="min-w-0 flex-1 max-w-md bg-transparent text-[14px] font-medium text-white outline-none rounded-[6px] px-2 py-1 focus:bg-white/[0.04] transition-colors"
          placeholder="Clip title"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleCrop}
            aria-pressed={crop === 'center'}
            title={crop === 'center' ? 'Center crop on — show full frame' : 'Center crop to 9:16'}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-medium rounded-[7px] transition-colors ${
              crop === 'center'
                ? 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Crop size={14} /> Center crop
          </button>
          <div className="w-px h-5 bg-white/[0.08]" />
          <IconBtn label="Undo" onClick={undo} disabled={!canUndo}>
            <Undo2 size={16} />
          </IconBtn>
          <IconBtn label="Redo" onClick={redo} disabled={!canRedo}>
            <Redo2 size={16} />
          </IconBtn>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (!dirty && !saved)}
            className="ml-1 inline-flex items-center gap-1.5 h-9 px-4 text-[13px] font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-[8px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Saving…
              </>
            ) : saved ? (
              <>
                <Check size={15} /> Saved
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col">
          {videoUrl ? (
            <EditorPreview
              videoRef={videoRef}
              src={videoUrl}
              bgColor={bgColor}
              crop={crop === 'center'}
              captions={captions}
              currentTime={currentTime}
              playing={playing}
              selectedCaptionId={selectedId}
              onSelectCaption={setSelectedId}
              onMoveCaption={(id, x, y) => patchCaption(id, { x, y })}
              onCaptionGestureStart={pushSnapshot}
              onEditCaptionText={(id, text) => patchCaption(id, { text })}
              onLoadedMetadata={onLoadedMetadata}
              onTogglePlay={togglePlay}
              onBackgroundClick={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex-1 grid place-items-center text-neutral-500 text-[13px]">
              This clip has no rendered video to edit.
            </div>
          )}

          {/* Transport */}
          <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={togglePlay}
              className="grid place-items-center w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white transition-colors"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={16} className="fill-current" /> : <Play size={16} className="ml-0.5 fill-current" />}
            </button>
            <span className="text-[12.5px] tabular-nums text-neutral-300">
              {formatDuration(currentTime)}
              <span className="text-neutral-600"> / {formatDuration(duration)}</span>
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-neutral-400">
              <span className="text-neutral-600">Clip length</span>
              <span className="tabular-nums text-neutral-200 px-2 py-0.5 rounded-full bg-white/[0.05]">
                {formatDuration(trimmedLength)}
              </span>
            </span>
          </div>

          {/* Timeline */}
          <div className="shrink-0 px-4 pb-4 pt-2">
            {videoUrl && duration > 0 && (
              <TrimTimeline
                src={videoUrl}
                duration={duration}
                currentTime={currentTime}
                trim={trim}
                captions={captions}
                selectedCaptionId={selectedId}
                onSeek={seek}
                onTrimChange={applyTrim}
                onTrimGestureStart={pushSnapshot}
                onSelectCaption={setSelectedId}
                onCaptionRangeChange={(id, s, e) => patchCaption(id, { startSeconds: s, endSeconds: e })}
                onCaptionGestureStart={pushSnapshot}
              />
            )}
          </div>
        </div>

        {/* Caption inspector */}
        <aside className="w-[300px] shrink-0 border-l border-white/[0.06] bg-[#0d0d0f]">
          <CaptionInspector
            captions={captions}
            selectedId={selectedId}
            currentTime={currentTime}
            duration={duration}
            onAdd={addCaption}
            onSelect={selectFromList}
            onDelete={deleteCaption}
            onUpdate={patchCaption}
            onUpdateStyle={patchCaptionStyle}
            onGestureStart={pushSnapshot}
          />
        </aside>
      </div>
    </div>
  )
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid place-items-center w-8 h-8 rounded-[7px] text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
    >
      {children}
    </button>
  )
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
