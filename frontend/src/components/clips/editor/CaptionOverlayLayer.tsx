import { useEffect, useRef, useState } from 'react'
import type { Caption } from '../../../types'
import { captionBoxStyle, captionTextStyle, visibleCaptions } from '../../../lib/captions'

interface Props {
  captions: Caption[]
  currentTime: number
  /** Player width ÷ the 1080px caption reference, so font/padding scale down. */
  scale: number
  /** When false the layer is display-only (e.g. the review player). */
  editable?: boolean
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Live during a drag — normalized center coords. */
  onMove?: (id: string, x: number, y: number) => void
  /** Fired once at the start of a move or a text edit (for one undo snapshot). */
  onGestureStart?: () => void
  onEditText?: (id: string, text: string) => void
}

/**
 * The caption layer stacked over the video. Absolutely fills the player;
 * empty space is click-through (`pointer-events-none`), only the chips are
 * interactive. Each visible caption is positioned in normalized center-anchored
 * coords and (when editable) can be dragged to reposition or double-clicked to
 * edit its text inline — the same affordances as narrative's TextOverlayLayer,
 * minus per-aspect transforms and resize handles.
 */
export function CaptionOverlayLayer({
  captions,
  currentTime,
  scale,
  editable = false,
  selectedId = null,
  onSelect,
  onMove,
  onGestureStart,
  onEditText,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editRef = useRef<HTMLDivElement>(null)

  const active = visibleCaptions(captions, currentTime)

  // On entering edit mode, seed the (React-unmanaged) contentEditable with the
  // caption text and select it. React renders no children for this branch, so
  // it won't clobber what the user types.
  useEffect(() => {
    if (!editingId) return
    const el = editRef.current
    const cap = captions.find((c) => c.id === editingId)
    if (!el || !cap) return
    el.textContent = cap.text
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editingId, captions])

  const commitEdit = () => {
    const el = editRef.current
    if (editingId && el) onEditText?.(editingId, el.textContent ?? '')
    setEditingId(null)
  }

  const startDrag = (cap: Caption) => (e: React.PointerEvent) => {
    if (editingId === cap.id) return // let text selection work while editing
    e.preventDefault()
    onSelect?.(cap.id)
    const layer = layerRef.current
    if (!layer || !onMove) return
    const rect = layer.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const originX = cap.x
    const originY = cap.y
    let moved = false
    const onPointerMove = (ev: PointerEvent) => {
      if (!moved) {
        moved = true
        onGestureStart?.()
      }
      const x = clamp01(originX + (ev.clientX - startX) / rect.width)
      const y = clamp01(originY + (ev.clientY - startY) / rect.height)
      onMove(cap.id, x, y)
    }
    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    }
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }

  return (
    <div ref={layerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      {active.map((cap) => {
        const selected = editable && selectedId === cap.id
        const isEditing = editingId === cap.id
        return (
          <div
            key={cap.id}
            onPointerDown={editable ? startDrag(cap) : undefined}
            onDoubleClick={
              editable
                ? (e) => {
                    e.preventDefault()
                    onSelect?.(cap.id)
                    onGestureStart?.()
                    setEditingId(cap.id)
                  }
                : undefined
            }
            className={editable ? 'pointer-events-auto' : ''}
            style={{
              position: 'absolute',
              left: `${cap.x * 100}%`,
              top: `${cap.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              maxWidth: '86%',
              cursor: editable ? (isEditing ? 'text' : 'move') : 'default',
              outline: selected ? '1.5px solid rgba(139,92,246,0.9)' : undefined,
              outlineOffset: 2,
              borderRadius: 4,
              ...captionBoxStyle(cap.style, scale),
            }}
          >
            {isEditing ? (
              <div
                ref={editRef}
                contentEditable
                suppressContentEditableWarning
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    commitEdit()
                  }
                  e.stopPropagation() // don't trip editor shortcuts while typing
                }}
                style={{ ...captionTextStyle(cap.style, scale), outline: 'none', minWidth: 12 }}
              />
            ) : (
              <div style={captionTextStyle(cap.style, scale)}>{cap.text || ' '}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
