import { AlignCenter, AlignLeft, AlignRight, Plus, Trash2 } from 'lucide-react'
import type { Caption, CaptionAlign, CaptionPreset, CaptionStyle } from '../../../types'
import { formatDuration } from '../../../lib/format'
import { CAPTION_PRESET_LABELS, CAPTION_PRESETS } from '../../../lib/captions'

interface Props {
  captions: Caption[]
  selectedId: string | null
  currentTime: number
  duration: number
  onAdd: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  /** Apply a change (no undo snapshot — call onGestureStart first). */
  onUpdate: (id: string, patch: Partial<Caption>) => void
  onUpdateStyle: (id: string, patch: Partial<CaptionStyle>) => void
  /** Push one undo snapshot at the start of an edit gesture. */
  onGestureStart: () => void
}

const PRESETS: CaptionPreset[] = ['pill', 'outline', 'shadow']
const ALIGNS: { value: CaptionAlign; Icon: typeof AlignLeft }[] = [
  { value: 'left', Icon: AlignLeft },
  { value: 'center', Icon: AlignCenter },
  { value: 'right', Icon: AlignRight },
]
const POS_X = [0.18, 0.5, 0.82]
const POS_Y = [0.16, 0.5, 0.84]

/** The captions side panel: a list of captions plus a style/timing editor for
 *  the selected one. Continuous controls snapshot once via `onGestureStart` on
 *  focus/pointer-down; discrete ones snapshot then mutate. */
export function CaptionInspector({
  captions,
  selectedId,
  currentTime,
  duration,
  onAdd,
  onSelect,
  onDelete,
  onUpdate,
  onUpdateStyle,
  onGestureStart,
}: Props) {
  const selected = captions.find((c) => c.id === selectedId) ?? null

  // Discrete change: snapshot, then mutate.
  const setStyle = (patch: Partial<CaptionStyle>) => {
    if (!selected) return
    onGestureStart()
    onUpdateStyle(selected.id, patch)
  }
  const setField = (patch: Partial<Caption>) => {
    if (!selected) return
    onGestureStart()
    onUpdate(selected.id, patch)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] shrink-0">
        <h2 className="text-[13px] font-medium text-neutral-200">Captions</h2>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 h-7 pl-1.5 pr-2.5 text-[12px] font-medium text-[#0A0A0A] bg-[#22E55F] hover:bg-[#35f16d] rounded-[6px] transition-colors"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {/* Caption list */}
        <div className="p-2 space-y-1">
          {captions.length === 0 && (
            <p className="px-2 py-6 text-center text-[12px] text-neutral-600">
              No captions yet. Add one to overlay text on the clip.
            </p>
          )}
          {captions.map((cap) => {
            const active = cap.id === selectedId
            return (
              <button
                key={cap.id}
                type="button"
                onClick={() => onSelect(cap.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-[7px] text-left transition-colors ${
                  active ? 'bg-[#22E55F]/10 ring-1 ring-[#22E55F]/30' : 'hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] text-neutral-200 truncate">
                    {cap.text || 'Caption'}
                  </span>
                  <span className="block text-[10.5px] text-neutral-500 tabular-nums">
                    {formatDuration(cap.startSeconds)} – {formatDuration(cap.endSeconds)}
                  </span>
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(cap.id)
                  }}
                  className="shrink-0 grid place-items-center w-6 h-6 rounded-[5px] text-neutral-500 hover:text-red-300 hover:bg-white/[0.06] transition-colors"
                  aria-label="Delete caption"
                >
                  <Trash2 size={13} />
                </span>
              </button>
            )
          })}
        </div>

        {/* Selected caption editor */}
        {selected && (
          <div className="border-t border-white/[0.06] p-4 space-y-4">
            {/* Text */}
            <div>
              <Label>Text</Label>
              <textarea
                value={selected.text}
                onFocus={onGestureStart}
                onChange={(e) => onUpdate(selected.id, { text: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 bg-white/[0.04] text-[#F5F5F3] text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-[#22E55F]/40 placeholder-neutral-600 resize-none transition-colors"
                placeholder="Caption text…"
              />
            </div>

            {/* Timing */}
            <div>
              <Label>Timing</Label>
              <div className="flex items-center gap-2">
                <TimeButton
                  label="In"
                  value={selected.startSeconds}
                  onClick={() =>
                    setField({
                      startSeconds: Math.max(0, Math.min(currentTime, selected.endSeconds - 0.3)),
                    })
                  }
                />
                <TimeButton
                  label="Out"
                  value={selected.endSeconds}
                  onClick={() =>
                    setField({
                      endSeconds: Math.min(duration, Math.max(currentTime, selected.startSeconds + 0.3)),
                    })
                  }
                />
              </div>
              <p className="mt-1 text-[10.5px] text-neutral-600">
                Buttons snap to the playhead. Drag the block on the timeline to fine-tune.
              </p>
            </div>

            {/* Preset */}
            <div>
              <Label>Style</Label>
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-white/[0.03] rounded-[7px]">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      setStyle({
                        preset: p,
                        stroke: CAPTION_PRESETS[p].stroke,
                        background: CAPTION_PRESETS[p].background,
                        fontWeight: CAPTION_PRESETS[p].fontWeight,
                      })
                    }
                    className={`h-7 rounded-[5px] text-[11.5px] font-medium transition-colors ${
                      selected.style.preset === p
                        ? 'bg-[#22E55F]/15 text-[#22E55F]'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {CAPTION_PRESET_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <Label>Size · {Math.round(selected.style.fontSize)}</Label>
              <input
                type="range"
                min={24}
                max={140}
                step={1}
                value={selected.style.fontSize}
                onPointerDown={onGestureStart}
                onChange={(e) => onUpdateStyle(selected.id, { fontSize: Number(e.target.value) })}
                className="w-full accent-[#22E55F]"
              />
            </div>

            {/* Fill + alignment */}
            <div className="flex items-center gap-3">
              <div>
                <Label>Fill</Label>
                <ColorSwatch
                  value={selected.style.color}
                  onGestureStart={onGestureStart}
                  onChange={(color) => onUpdateStyle(selected.id, { color })}
                />
              </div>
              <div className="flex-1">
                <Label>Align</Label>
                <div className="grid grid-cols-3 gap-1 p-0.5 bg-white/[0.03] rounded-[7px]">
                  {ALIGNS.map(({ value, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStyle({ align: value })}
                      className={`h-7 grid place-items-center rounded-[5px] transition-colors ${
                        selected.style.align === value
                          ? 'bg-[#22E55F]/15 text-[#22E55F]'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Background pill */}
            <ToggleRow
              label="Background pill"
              on={selected.style.background !== null}
              onToggle={() =>
                setStyle({ background: selected.style.background ? null : { color: '#000000', opacity: 0.72 } })
              }
            >
              {selected.style.background && (
                <div className="mt-2 flex items-center gap-3">
                  <ColorSwatch
                    value={selected.style.background.color}
                    onGestureStart={onGestureStart}
                    onChange={(color) =>
                      onUpdateStyle(selected.id, {
                        background: { ...selected.style.background!, color },
                      })
                    }
                  />
                  <div className="flex-1">
                    <span className="block text-[10.5px] text-neutral-500 mb-1">
                      Opacity · {Math.round(selected.style.background.opacity * 100)}%
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selected.style.background.opacity}
                      onPointerDown={onGestureStart}
                      onChange={(e) =>
                        onUpdateStyle(selected.id, {
                          background: { ...selected.style.background!, opacity: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-[#22E55F]"
                    />
                  </div>
                </div>
              )}
            </ToggleRow>

            {/* Stroke */}
            <ToggleRow
              label="Stroke"
              on={selected.style.stroke !== null}
              onToggle={() =>
                setStyle({ stroke: selected.style.stroke ? null : { color: '#000000', width: 5 } })
              }
            >
              {selected.style.stroke && (
                <div className="mt-2 flex items-center gap-3">
                  <ColorSwatch
                    value={selected.style.stroke.color}
                    onGestureStart={onGestureStart}
                    onChange={(color) =>
                      onUpdateStyle(selected.id, { stroke: { ...selected.style.stroke!, color } })
                    }
                  />
                  <div className="flex-1">
                    <span className="block text-[10.5px] text-neutral-500 mb-1">
                      Width · {selected.style.stroke.width}
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      step={1}
                      value={selected.style.stroke.width}
                      onPointerDown={onGestureStart}
                      onChange={(e) =>
                        onUpdateStyle(selected.id, {
                          stroke: { ...selected.style.stroke!, width: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-[#22E55F]"
                    />
                  </div>
                </div>
              )}
            </ToggleRow>

            {/* Position */}
            <div>
              <Label>Position</Label>
              <div className="inline-grid grid-cols-3 gap-1">
                {POS_Y.map((y) =>
                  POS_X.map((x) => {
                    const active =
                      Math.abs(selected.x - x) < 0.02 && Math.abs(selected.y - y) < 0.02
                    return (
                      <button
                        key={`${x}-${y}`}
                        type="button"
                        onClick={() => setField({ x, y })}
                        aria-label={`Position ${x} ${y}`}
                        className={`w-7 h-7 rounded-[5px] grid place-items-center transition-colors ${
                          active ? 'bg-[#22E55F]/20 ring-1 ring-[#22E55F]/60' : 'bg-white/[0.04] hover:bg-white/[0.08]'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#22E55F]' : 'bg-neutral-500'}`} />
                      </button>
                    )
                  })
                )}
              </div>
              <p className="mt-1.5 text-[10.5px] text-neutral-600">Or drag the caption on the video.</p>
            </div>

            <button
              type="button"
              onClick={() => onDelete(selected.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 h-9 text-[12.5px] text-red-300/90 hover:text-red-300 bg-white/[0.03] hover:bg-red-500/10 ring-1 ring-white/[0.06] hover:ring-red-500/25 rounded-[7px] transition-colors"
            >
              <Trash2 size={14} /> Delete caption
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium text-neutral-400 mb-1.5">{children}</div>
}

function TimeButton({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex items-center justify-between px-2.5 h-8 bg-white/[0.04] hover:bg-white/[0.08] rounded-[6px] transition-colors"
    >
      <span className="text-[11px] text-neutral-500">{label}</span>
      <span className="text-[12px] text-neutral-200 tabular-nums">{formatDuration(value)}</span>
    </button>
  )
}

function ColorSwatch({
  value,
  onChange,
  onGestureStart,
}: {
  value: string
  onChange: (v: string) => void
  onGestureStart: () => void
}) {
  return (
    <label
      className="block w-9 h-8 rounded-[6px] ring-1 ring-white/10 cursor-pointer overflow-hidden"
      style={{ backgroundColor: value }}
    >
      <input
        type="color"
        value={value}
        onPointerDown={onGestureStart}
        onChange={(e) => onChange(e.target.value)}
        className="opacity-0 w-full h-full cursor-pointer"
      />
    </label>
  )
}

function ToggleRow({
  label,
  on,
  onToggle,
  children,
}: {
  label: string
  on: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between"
      >
        <span className="text-[11px] font-medium text-neutral-400">{label}</span>
        <span
          className={`relative w-8 h-[18px] rounded-full transition-colors ${on ? 'bg-[#22E55F]' : 'bg-white/[0.12]'}`}
        >
          <span
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
              on ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </span>
      </button>
      {children}
    </div>
  )
}
