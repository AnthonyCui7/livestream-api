// Local persistence for clip edits (trim + captions + title override).
//
// There is no clip-edit endpoint on the router yet (only project create/cancel/
// delete). Until one exists, reviewer edits live in localStorage keyed by clip
// id — enough to survive reloads and be read back into the clip grid/player.
// The shape written here is exactly `ClipEdits` from types.ts, so swapping this
// for a `PATCH /api/clips/:id` (body = ClipEdits) is a drop-in: keep
// `getClipEdits`/`putClipEdits` as the seam and change only their bodies.

import type { ClipEdits } from '../types'

const KEY_PREFIX = 'livestream:clip-edits:'

// Small in-memory mirror so a clip read (which happens every 4s poll per
// subscription) doesn't re-parse JSON from localStorage each time.
const cache = new Map<string, ClipEdits | null>()

function keyFor(clipId: string): string {
  return `${KEY_PREFIX}${clipId}`
}

/** The saved edits for a clip, or null if it was never edited. */
export function getClipEdits(clipId: string): ClipEdits | null {
  if (cache.has(clipId)) return cache.get(clipId) ?? null
  let value: ClipEdits | null = null
  try {
    const raw = localStorage.getItem(keyFor(clipId))
    if (raw) value = JSON.parse(raw) as ClipEdits
  } catch (err) {
    // Corrupt entry or storage disabled — treat as unedited.
    console.error('[clipEdits] read failed', err)
  }
  cache.set(clipId, value)
  return value
}

/** Persist a clip's edits (overwrites any prior record). */
export function putClipEdits(clipId: string, edits: ClipEdits): void {
  cache.set(clipId, edits)
  try {
    localStorage.setItem(keyFor(clipId), JSON.stringify(edits))
  } catch (err) {
    // Quota or private-mode failure — the in-memory cache still reflects it for
    // this session, so the UI stays consistent even if it won't survive reload.
    console.error('[clipEdits] write failed', err)
  }
}

/** Drop a clip's edits entirely (revert to the untouched clip). */
export function clearClipEdits(clipId: string): void {
  cache.set(clipId, null)
  try {
    localStorage.removeItem(keyFor(clipId))
  } catch (err) {
    console.error('[clipEdits] clear failed', err)
  }
}
