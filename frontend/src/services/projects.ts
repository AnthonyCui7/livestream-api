// Data-access layer for projects and clips.
//
// The single seam between the UI and the backend:
//   • reads  — direct Supabase queries with the anon key; RLS owner-scopes
//              every select to auth.uid()
//   • writes — the router HTTP API (lib/api.ts); RLS makes projects/clips
//              service_role-only, so the router does the writing
//   • live   — polling every 4s (no Supabase realtime)
// Social posting is still simulated (see postClip below).

import type { Clip, ClipEdits, Project, SocialPlatform } from '../types'
import { getSupabase } from '../lib/supabase'
import { patchClipEdits, rowToClip, rowToProject, type ClipRow, type ProjectRow } from '../lib/api'
import { getClipEdits, putClipEdits } from '../lib/clipEdits'

export { createProject, cancelProject, deleteProject } from '../lib/api'

// DEMO: which platforms a clip was "posted" to — in-memory for the session
// (resets on reload). Real social posting needs OAuth + a router endpoint.
const postedByClip = new Map<string, Set<SocialPlatform>>()

function toClip(row: ClipRow): Clip {
  const base = rowToClip(row, [...(postedByClip.get(row.id) ?? [])])
  // Merge in any reviewer edits (trim/captions/title) from the local edit store
  // so the grid, player and editor all see the edited clip. A future router
  // endpoint would return these fields on the row instead.
  // Server-persisted edits (clips.edits jsonb, mapped in rowToClip) win; the
  // localStorage cache is only a fallback for edits not yet round-tripped.
  const edits = base.edits ?? getClipEdits(row.id)
  if (!edits) return base
  return { ...base, title: edits.title ?? base.title, edits }
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*, clips(count)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as ProjectRow[]).map(rowToProject)
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*, clips(count)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToProject(data as ProjectRow) : null
}

export async function listClips(projectId: string): Promise<Clip[]> {
  const { data, error } = await getSupabase()
    .from('clips')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return ((data ?? []) as ClipRow[]).map(toClip)
}

/** A single clip by id — used by the editor route on a hard refresh, when the
 *  clip wasn't handed over via navigation state. */
export async function getClip(id: string): Promise<Clip | null> {
  const { data, error } = await getSupabase().from('clips').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toClip(data as ClipRow) : null
}

// ── live clip updates: 4s polling ──────────────────────────────────────────

/** Refresh fns of active subscriptions, so postClip can update badges
 *  without waiting for the next poll. */
const activeSubs = new Set<() => void>()

/**
 * Stream a project's clips as they're produced. Polls every 4s and emits only
 * when the payload actually changed. Returns an unsubscribe fn.
 */
export function subscribeClips(projectId: string, cb: (clips: Clip[]) => void): () => void {
  let lastJson = ''
  let disposed = false

  const tick = async () => {
    try {
      const clips = await listClips(projectId)
      if (disposed) return
      // Cheap change detection — skip the emit when nothing moved.
      const json = JSON.stringify(clips)
      if (json === lastJson) return
      lastJson = json
      cb(clips)
    } catch (err) {
      console.error('[subscribeClips] poll failed', err)
    }
  }
  const refresh = () => void tick()

  refresh()
  const interval = setInterval(refresh, 4000)
  activeSubs.add(refresh)
  return () => {
    disposed = true
    clearInterval(interval)
    activeSubs.delete(refresh)
  }
}

/** DEMO: fake "post to social" — records the platform in memory and nudges
 *  active subscriptions so the posted badge updates right away. */
export function postClip(clipId: string, platform: SocialPlatform): Promise<void> {
  let set = postedByClip.get(clipId)
  if (!set) {
    set = new Set()
    postedByClip.set(clipId, set)
  }
  set.add(platform)
  activeSubs.forEach((refresh) => refresh())
  return new Promise((resolve) => setTimeout(resolve, 700)) // pretend the upload takes a beat
}

/**
 * Persist reviewer edits (trim + captions + title) for a clip. Writes through
 * the router (PATCH /api/clips/:id → clips.edits jsonb; service_role, since RLS
 * makes clips backend-write-only), then mirrors to the localStorage cache for
 * instant reads before the next poll / offline resilience, and nudges active
 * subscriptions so the grid reflects the edit immediately.
 */
export async function saveClipEdits(clipId: string, edits: ClipEdits): Promise<void> {
  await patchClipEdits(clipId, edits)
  putClipEdits(clipId, edits)
  activeSubs.forEach((refresh) => refresh())
}
