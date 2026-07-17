// Core domain types for the frontend.
//
// These mirror the backend vocabulary in `router/app/schemas.py` so that
// swapping the demo store (see `lib/demo.ts`) for the real API is a matter
// of changing where the data comes from, not reshaping it.

/** How a project's source was provided. Matches `SourceType` in the router. */
export type SourceType = 'stream' | 'vod'

/** Which live platform a stream link points at (only when sourceType === 'stream'). */
export type StreamPlatform = 'youtube' | 'twitch'

/**
 * Lifecycle of a project's clip job. Mirrors `JobStatus` in the router, with
 * `queued` standing in for the router's `pending`/`provisioning` phases.
 */
export type ProjectStatus =
  | 'queued' // accepted, worker not yet running
  | 'processing' // worker is ingesting the source and detecting clips
  | 'ready' // clip detection finished
  | 'failed'

/** One uploaded source file attached to a `vod` project. */
export interface SourceFile {
  id: string
  name: string
  /** Bytes, when known (used only for display). */
  sizeBytes?: number
}

export interface Project {
  id: string
  name: string
  sourceType: SourceType
  /** Present when sourceType === 'stream'. */
  streamUrl?: string
  streamPlatform?: StreamPlatform
  /** Present when sourceType === 'vod'. */
  sourceFiles?: SourceFile[]
  status: ProjectStatus
  /** How many clips the pipeline has produced so far. */
  clipCount: number
  createdAt: string // ISO
  updatedAt: string // ISO
  /** Optional poster used on the project card. */
  thumbnailUrl?: string
}

/**
 * A generated clip. `score` is the raw 0–1 "highlight-worthy" rating from the
 * pipeline (the router's `Clip.score`); the UI renders it as a 0–100 virality
 * score via `viralityScore()` in `lib/format.ts`.
 */
export interface Clip {
  id: string
  projectId: string
  title: string
  startSeconds: number
  endSeconds: number
  score: number // 0–1
  createdAt: string // ISO
  /** Playable clip URL (16:9). Optional while the worker is still rendering. */
  url?: string
  /** Poster frame for the clip tile. */
  posterUrl?: string
}
