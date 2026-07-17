import { useEffect, useRef } from 'react'

interface Args {
  onTogglePlay: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onDeleteSelected: () => void
  /** Seek by a signed number of seconds (frame step). */
  onStep: (deltaSeconds: number) => void
}

/** ~30fps clips → one frame ≈ 1/30s. */
const FRAME = 1 / 30

/**
 * Editor keyboard shortcuts, distilled from narrative's useTrimEditorKeyboard:
 * Space = play/pause, ⌘/Ctrl+S = save (even while typing), ⌘/Ctrl+Z /
 * ⇧⌘Z = undo/redo, Delete = remove selected caption, ⌘/Ctrl+←/→ = frame step.
 * Everything except Save is suppressed while typing in a field.
 */
export function useEditorKeyboard(args: Args) {
  const ref = useRef(args)
  ref.current = args

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = ref.current
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        a.onSave()
        return
      }

      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (typing) return

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) a.onRedo()
        else a.onUndo()
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        a.onTogglePlay()
        return
      }
      if (mod && e.key === 'ArrowLeft') {
        e.preventDefault()
        a.onStep(-FRAME)
        return
      }
      if (mod && e.key === 'ArrowRight') {
        e.preventDefault()
        a.onStep(FRAME)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        a.onDeleteSelected()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
