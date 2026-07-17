// Deterministic gradient placeholders. Used wherever a real poster/thumbnail
// isn't available yet (which, in DEMO mode, is everywhere). Keying off a
// stable id means a given clip/project always gets the same look.

const PALETTES: [string, string][] = [
  ['#6d28d9', '#db2777'], // violet → pink
  ['#0ea5e9', '#4f46e5'], // sky → indigo
  ['#f97316', '#db2777'], // orange → pink
  ['#059669', '#0ea5e9'], // emerald → sky
  ['#7c3aed', '#2563eb'], // purple → blue
  ['#e11d48', '#f97316'], // rose → orange
]

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** A CSS linear-gradient string derived from `id`. */
export function gradientFor(id: string): string {
  const [a, b] = PALETTES[hash(id) % PALETTES.length]
  const angle = 115 + (hash(id + 'a') % 90)
  return `linear-gradient(${angle}deg, ${a}, ${b})`
}
