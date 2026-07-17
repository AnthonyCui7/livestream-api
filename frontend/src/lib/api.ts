// Router HTTP client — the write path to the backend.
//
// Reads (project/clip lists) go straight to Supabase with the anon key (RLS
// owner-scopes the selects — see services/projects.ts); writes go through the
// router's FastAPI (`/api` prefix) because RLS makes projects/clips
// service_role-only. Every request carries the caller's Supabase access token
// in `Authorization: Bearer …`; the router validates it and scopes the write
// to that user.

import type { Clip, ClipEdits, ClipMetadata, Project, SocialPlatform, StreamPlatform } from '../types'
import { getSupabase } from './supabase'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ── raw rows (snake_case, exactly as the DB/PostgREST/router return them) ──

export interface ProjectRow {
  id: string
  user_id: string | null
  name: string
  source_type: Project['sourceType']
  source_url: string
  status: Project['status']
  error: string | null
  instance_id?: string | null
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
  /** Supabase `clips(count)` aggregate — present on direct reads only. */
  clips?: { count: number }[]
}

export interface ClipRow {
  id: string
  project_id: string
  title: string
  description: string | null
  start_seconds: number | string
  end_seconds: number | string
  score: number | string | null
  video_url: string | null
  status: Clip['status']
  metadata?: ClipMetadata | null
  edits?: ClipEdits | null
  created_at: string
}

// ── row → domain-type mappers (shared with services/projects.ts) ──────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/** Which platform a video/livestream URL points at. Derived client-side —
 *  the DB only stores `source_url`. */
export function platformFor(sourceUrl: string): StreamPlatform | undefined {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase()
    if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) return 'twitch'
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) {
      return 'youtube'
    }
  } catch {
    // Not a URL (e.g. upload://…) — no platform.
  }
  return undefined
}

export function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    streamPlatform: row.source_type === 'upload' ? undefined : platformFor(row.source_url),
    status: row.status,
    error: row.error,
    clipCount: row.clips?.[0]?.count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function rowToClip(row: ClipRow, postedPlatforms: SocialPlatform[] = []): Clip {
  // metadata is untrusted jsonb — only a real non-empty string becomes the
  // poster. Existing clips predate thumbnails, so this is usually undefined.
  const thumbnail = row.metadata?.thumbnail_url
  // clips.edits jsonb defaults to {} — treat an empty object as "no edits".
  const rawEdits = row.edits
  const edits =
    rawEdits && typeof rawEdits === 'object' && Object.keys(rawEdits).length > 0
      ? (rawEdits as ClipEdits)
      : undefined
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    startSeconds: Number(row.start_seconds),
    endSeconds: Number(row.end_seconds),
    // Clamp to the 0–1 scale — legacy rows carry out-of-range scores (e.g. 42).
    score: clamp01(Number(row.score ?? 0)),
    status: row.status,
    videoUrl: row.video_url,
    createdAt: row.created_at,
    metadata: row.metadata ?? undefined,
    edits,
    posterUrl: typeof thumbnail === 'string' && thumbnail !== '' ? thumbnail : undefined,
    postedPlatforms,
  }
}

// ── authenticated fetch ────────────────────────────────────────────────────

async function accessToken(): Promise<string> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not signed in — please sign in again.')
  return token
}

/** Best human-readable message out of a FastAPI error response. */
async function readableError(res: Response): Promise<string> {
  try {
    const { detail } = (await res.json()) as { detail?: unknown }
    if (typeof detail === 'string') return detail
    // Pydantic validation errors: detail is [{msg, …}, …].
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) => (d && typeof d === 'object' && 'msg' in d ? String(d.msg) : ''))
        .filter(Boolean)
      if (msgs.length > 0) return msgs.join('; ')
    }
  } catch {
    // Not JSON — fall through to the generic message.
  }
  return `Request failed (${res.status})`
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!res.ok) throw new Error(await readableError(res))
  return res
}

// ── endpoints ──────────────────────────────────────────────────────────────

export interface CreateProjectInput {
  name?: string
  sourceUrl: string
  sourceType: 'livestream' | 'video'
}

/** POST /api/projects — insert the row and launch the clip worker. */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const res = await apiFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      ...(input.name ? { name: input.name } : {}),
      source_url: input.sourceUrl,
      source_type: input.sourceType,
    }),
  })
  return rowToProject((await res.json()) as ProjectRow)
}

/**
 * POST /api/projects/:id/cancel — graceful stop (status → 'stopping'; the
 * worker winds down and marks it 'cancelled'). `force` terminates the EC2
 * instance immediately instead.
 */
export async function cancelProject(id: string, force = false): Promise<Project> {
  const res = await apiFetch(`/api/projects/${id}/cancel${force ? '?force=true' : ''}`, {
    method: 'POST',
  })
  return rowToProject((await res.json()) as ProjectRow)
}

/** DELETE /api/projects/:id — terminates any worker and removes the row
 *  (DB triggers enqueue the media cleanup). */
export async function deleteProject(id: string): Promise<void> {
  await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
}

// ── clips ────────────────────────────────────────────────────────────────────

/** PATCH /api/clips/:id — persist reviewer edits (trim/captions/title). Clips
 *  are service_role-only for writes (RLS), so this goes through the router; the
 *  request body is the `ClipEdits` shape verbatim. */
export async function patchClipEdits(clipId: string, edits: ClipEdits): Promise<void> {
  await apiFetch(`/api/clips/${clipId}`, {
    method: 'PATCH',
    body: JSON.stringify(edits),
  })
}
