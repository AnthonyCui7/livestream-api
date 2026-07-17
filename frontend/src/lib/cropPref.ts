// Frontend-only portrait-crop preference, per clip id.
//
// The card's reframe button stores its state HERE (localStorage), not through
// the router: demo-project clips are unowned (user_id null) so the clip PATCH
// 404s, and a shared demo shouldn't be mutated by one viewer anyway. Server
// edits (clips.edits.crop, saved from the editor on owned clips) act as the
// default; a local preference, once set, wins for this browser.

const KEY_PREFIX = 'livestream:clip-crop:'

const cache = new Map<string, 'center' | null | undefined>()

function keyFor(clipId: string): string {
  return `${KEY_PREFIX}${clipId}`
}

/** The locally chosen crop for a clip: 'center' (9:16), null (16:9), or
 *  undefined when the user never toggled it here (fall back to server edits). */
export function getCropPref(clipId: string): 'center' | null | undefined {
  if (cache.has(clipId)) return cache.get(clipId)
  let value: 'center' | null | undefined
  try {
    const raw = localStorage.getItem(keyFor(clipId))
    if (raw === 'center') value = 'center'
    else if (raw === 'full') value = null
  } catch {
    // Storage disabled — session-only via the cache.
  }
  cache.set(clipId, value)
  return value
}

export function setCropPref(clipId: string, crop: 'center' | null): void {
  cache.set(clipId, crop)
  try {
    localStorage.setItem(keyFor(clipId), crop ?? 'full')
  } catch {
    // Storage disabled — the in-memory cache still covers this session.
  }
}
