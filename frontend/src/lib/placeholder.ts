// Deterministic solid-color placeholders. Used wherever a real
// poster/thumbnail isn't available yet (which, in demo mode, is everywhere).
// Keying off a stable id means a given clip/project always gets the same
// color. No gradients — flat tones only.

const COLORS = [
  '#6d28d9', // violet
  '#0ea5e9', // sky
  '#db2777', // pink
  '#059669', // emerald
  '#f97316', // orange
  '#4f46e5', // indigo
  '#e11d48', // rose
  '#0891b2', // cyan
]

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** A solid hex color derived from `id`. */
export function colorFor(id: string): string {
  return COLORS[hash(id) % COLORS.length]
}
