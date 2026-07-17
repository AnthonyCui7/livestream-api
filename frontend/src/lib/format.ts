// Small display helpers shared across the app.

/** `mm:ss` from a duration in seconds. */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Human "3m ago" / "2h ago" / "Jul 16" from an ISO timestamp. */
export function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (!t) return ''
  const diffMs = Date.now() - t
  const min = Math.round(diffMs / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.round(hr / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Map the pipeline's raw 0–1 `score` to the 0–100 "virality score" the UI
 * shows. Keeping the backend field as 0–1 (per `router/app/schemas.py`) means
 * this is the only place the presentation scale lives.
 */
export function viralityScore(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

/**
 * Tailwind classes + a raw bar color for a virality badge, tiered by score.
 * `bar` is a hex (not a class) because it's applied via inline style — dynamic
 * `bg-*` class names would be missed by Tailwind's content scanner.
 */
export function viralityTone(score100: number): {
  text: string
  ring: string
  bg: string
  bar: string
} {
  if (score100 >= 85)
    return { text: 'text-emerald-300', ring: 'ring-emerald-400/30', bg: 'bg-emerald-400/10', bar: '#6ee7b7' }
  if (score100 >= 70)
    return { text: 'text-lime-300', ring: 'ring-lime-400/30', bg: 'bg-lime-400/10', bar: '#bef264' }
  if (score100 >= 55)
    return { text: 'text-amber-300', ring: 'ring-amber-400/30', bg: 'bg-amber-400/10', bar: '#fcd34d' }
  return { text: 'text-neutral-300', ring: 'ring-white/15', bg: 'bg-white/[0.06]', bar: '#d4d4d4' }
}
