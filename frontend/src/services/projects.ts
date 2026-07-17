// Data-access layer for projects and clips.
//
// This is the single seam between the UI and the backend. Right now every
// call delegates to the DEMO store (`lib/demo.ts`). To go live, replace each
// function body with a real request to the router API (VITE_API_URL) — the
// signatures and return types already match `router/app/schemas.py`, so the
// components above don't change.

import type { Clip, Project } from '../types'
import { demoStore, type CreateProjectInput } from '../lib/demo' // DEMO

// export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type { CreateProjectInput }

export function listProjects(): Promise<Project[]> {
  // TODO(api): GET ${API_URL}/api/projects
  return demoStore.listProjects() // DEMO
}

export function getProject(id: string): Promise<Project | null> {
  // TODO(api): GET ${API_URL}/api/projects/:id
  return demoStore.getProject(id) // DEMO
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  // TODO(api): POST ${API_URL}/api/projects  (then upload files / submit job)
  return demoStore.createProject(input) // DEMO
}

export function deleteProject(id: string): Promise<void> {
  // TODO(api): DELETE ${API_URL}/api/projects/:id
  return demoStore.deleteProject(id) // DEMO
}

export function listClips(projectId: string): Promise<Clip[]> {
  // TODO(api): GET ${API_URL}/api/projects/:id/clips
  return demoStore.listClips(projectId) // DEMO
}

/**
 * Stream a project's clips as they're produced. Returns an unsubscribe fn.
 * With the real API this becomes polling or an SSE/websocket subscription;
 * the callback contract stays the same.
 */
export function subscribeClips(projectId: string, cb: (clips: Clip[]) => void): () => void {
  // TODO(api): poll GET /api/projects/:id/clips (or subscribe via SSE)
  return demoStore.subscribeClips(projectId, cb) // DEMO
}
