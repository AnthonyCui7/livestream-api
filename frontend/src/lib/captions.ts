// Caption model helpers for the clip editor.
//
// A caption is a timed text overlay (`Caption` in types.ts) painted over the
// clip's rendered video. This module is the small vocabulary the editor and any
// future burn-in share: the style presets, the "which captions are visible at
// time t" test, a constructor, and the CSS derivation that turns a
// `CaptionStyle` into inline styles. All of it mirrors — in miniature —
// narrative's `textClips.ts` / `textOverlayStyles.ts`.

import type { Caption, CaptionPreset, CaptionStyle } from '../types'

/** Font size / positions are authored against this reference frame width, then
 *  scaled to the real player width so a caption keeps its visual weight at any
 *  size. Matches narrative's 1080px reference. */
export const CAPTION_REFERENCE_WIDTH = 1080

/** Default lower-third placement (normalized, center-anchored) — the common
 *  short-form caption spot. */
export const CAPTION_DEFAULT_X = 0.5
export const CAPTION_DEFAULT_Y = 0.82

/** Shortest caption we let the user create / trim to. */
export const CAPTION_MIN_DURATION = 0.3

const FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** The three canonical looks. Text color, stroke and background pill differ;
 *  everything else is shared. */
export const CAPTION_PRESETS: Record<CaptionPreset, CaptionStyle> = {
  // White text on a solid black rounded pill — the "clean caption" look.
  pill: {
    preset: 'pill',
    fontFamily: FONT_STACK,
    fontSize: 60,
    fontWeight: 800,
    color: '#ffffff',
    align: 'center',
    stroke: null,
    background: { color: '#000000', opacity: 0.72 },
  },
  // White text with a heavy black outline — the "MrBeast" headline look.
  outline: {
    preset: 'outline',
    fontFamily: FONT_STACK,
    fontSize: 66,
    fontWeight: 800,
    color: '#ffffff',
    align: 'center',
    stroke: { color: '#000000', width: 5 },
    background: null,
  },
  // White text with a soft drop shadow (the shadow lives in the layer CSS).
  shadow: {
    preset: 'shadow',
    fontFamily: FONT_STACK,
    fontSize: 58,
    fontWeight: 700,
    color: '#ffffff',
    align: 'center',
    stroke: null,
    background: null,
  },
}

export const CAPTION_PRESET_LABELS: Record<CaptionPreset, string> = {
  pill: 'Pill',
  outline: 'Outline',
  shadow: 'Shadow',
}

/** A fresh caption of the given preset, placed at the lower third and shown for
 *  ~2s from `atSeconds`, clamped inside `[0, duration]`. */
export function createCaption(
  atSeconds: number,
  duration: number,
  preset: CaptionPreset = 'pill'
): Caption {
  const start = Math.max(0, Math.min(atSeconds, Math.max(0, duration - CAPTION_MIN_DURATION)))
  const end = Math.min(duration, start + 2)
  return {
    id: `cap_${idSuffix()}`,
    text: 'Your caption',
    startSeconds: start,
    endSeconds: end > start ? end : Math.min(duration, start + CAPTION_MIN_DURATION),
    x: CAPTION_DEFAULT_X,
    y: CAPTION_DEFAULT_Y,
    style: { ...CAPTION_PRESETS[preset] },
  }
}

/** Captions active at clip time `t` — half-open `[start, end)`, matching how a
 *  burn-in would decide visibility frame by frame. */
export function visibleCaptions(captions: Caption[], t: number): Caption[] {
  return captions.filter((c) => t >= c.startSeconds && t < c.endSeconds)
}

/** `#rrggbb` + opacity → `rgba(...)`. Tolerates already-rgba/other strings by
 *  returning them unchanged. */
export function withOpacity(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${clamp(opacity, 0, 1)})`
}

/**
 * Inline styles for the caption <span> (the text itself). `scale` maps the
 * 1080px-reference font size onto the actual player width. Stroke uses
 * `-webkit-text-stroke` + `paint-order: stroke fill` so the outline sits behind
 * the fill (mirrors a canvas `strokeText` then `fillText`); the `shadow` preset
 * gets a drop shadow instead.
 */
export function captionTextStyle(style: CaptionStyle, scale: number): React.CSSProperties {
  const css: React.CSSProperties = {
    fontFamily: style.fontFamily,
    fontSize: Math.max(8, style.fontSize * scale),
    fontWeight: style.fontWeight,
    color: style.color,
    textAlign: style.align,
    lineHeight: 1.15,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  }
  if (style.stroke) {
    const w = style.stroke.width * scale
    css.WebkitTextStroke = `${w}px ${style.stroke.color}`
    // paint-order isn't in the React CSS types yet — set via index signature.
    ;(css as Record<string, unknown>).paintOrder = 'stroke fill'
  }
  if (style.preset === 'shadow') {
    css.textShadow = `0 ${Math.max(1, 2 * scale)}px ${Math.max(2, 4 * scale)}px rgba(0,0,0,0.65)`
  }
  return css
}

/**
 * Inline styles for the caption box (the padded, optionally-pilled wrapper
 * around the text). `scale` keeps padding/radius proportional to the player.
 */
export function captionBoxStyle(style: CaptionStyle, scale: number): React.CSSProperties {
  if (!style.background) return {}
  return {
    background: withOpacity(style.background.color, style.background.opacity),
    borderRadius: Math.max(4, 14 * scale),
    padding: `${Math.max(2, 8 * scale)}px ${Math.max(6, 20 * scale)}px`,
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// Short, dependency-free unique-ish suffix. Editor state is per-session and
// re-keyed on save, so collision-resistance need only survive a session.
let counter = 0
function idSuffix(): string {
  counter += 1
  return `${counter.toString(36)}${performance.now().toString(36).replace('.', '').slice(-4)}`
}
