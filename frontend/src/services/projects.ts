// Data-access layer for projects and clips.
//
// The single seam between the UI and the backend. Today (DATA_DEMO) reads come
// from the hardcoded demo store (lib/demo.ts) and there are no writes —
// creating/deleting projects are duds in the UI until the router exposes the
// projects API. Signatures/return types already match the DB schema
// (livestream-container/supabase/migrations/*.sql), so going live means:
//   • reads  — Supabase queries; RLS auto-scopes them to auth.uid()
//   • writes — POST/DELETE to the router (RLS: projects/clips are
//              service_role-only)

import type { Clip, Project, SocialPlatform } from '../types'
import { demoStore } from '../lib/demo' // DEMO

// export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export function listProjects(): Promise<Project[]> {
  // TODO(api): supabase.from('projects').select('*, clips(count)') — RLS-scoped
  return demoStore.listProjects() // DEMO
}

export function getProject(id: string): Promise<Project | null> {
  // TODO(api): supabase.from('projects').select('*').eq('id', id).maybeSingle()
  return demoStore.getProject(id) // DEMO
}

export function listClips(projectId: string): Promise<Clip[]> {
  // TODO(api): supabase.from('clips').select('*').eq('project_id', projectId)
  return demoStore.listClips(projectId) // DEMO
}

export function postClip(clipId: string, platform: SocialPlatform): Promise<void> {
  // TODO(api): POST ${API_URL}/api/clips/:id/post { platform }
  return demoStore.postClip(clipId, platform) // DEMO
}

/**
 * Stream a project's clips as they're produced. Returns an unsubscribe fn.
 * With the real API this becomes polling or an SSE/websocket subscription.
 */
export function subscribeClips(projectId: string, cb: (clips: Clip[]) => void): () => void {
  // TODO(api): poll GET /api/projects/:id/clips (or subscribe via SSE)
  return demoStore.subscribeClips(projectId, cb) // DEMO
}
