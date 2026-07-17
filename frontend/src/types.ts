// Core domain types for the frontend.
//
// These mirror the REAL database schema in
//   livestream-container/supabase/migrations/*.sql
// (tables `projects` and `clips`), so swapping the demo store (`lib/demo.ts`)
// for real Supabase queries is a matter of changing where the data comes
// from, not reshaping it.

/**
 * How a project's source was provided. Matches the DB
 * `projects.source_type` check constraint.
 *   livestream = captured live · video = platform VOD/URL · upload = user file
 */
export type SourceType = 'livestream' | 'video' | 'upload'

/** Which platform a `video`/`livestream` link points at. UI metadata only —
 *  stored under `projects.metadata` in the DB. */
export type StreamPlatform = 'youtube' | 'twitch'

/** Lifecycle of a project. Matches the DB `projects.status` check constraint. */
export type ProjectStatus = 'created' | 'ingesting' | 'ready' | 'failed'

/** Lifecycle of a clip. Matches the DB `clips.status` check constraint. */
export type ClipStatus = 'detected' | 'rendered' | 'failed'

/** Social platforms a clip can be posted to. */
export type SocialPlatform = 'tiktok' | 'youtube' | 'instagram'

/** One uploaded source file attached to an `upload` project (UI-side only;
 *  the DB stores a single `source_url`). */
export interface SourceFile {
  id: string
  name: string
  /** Bytes, when known (display only). */
  sizeBytes?: number
}

export interface Project {
  id: string
  /** Owner (DB `user_id → auth.users`). Null for worker-created rows. */
  userId: string | null
  name: string
  sourceType: SourceType
  /** DB `source_url`. */
  sourceUrl: string
  /** Present for `video`/`livestream` links — which platform (UI metadata). */
  streamPlatform?: StreamPlatform
  /** Present for `upload` projects — the chosen files (UI metadata). */
  sourceFiles?: SourceFile[]
  status: ProjectStatus
  error?: string | null
  /** How many clips the pipeline has produced so far (derived / joined). */
  clipCount: number
  createdAt: string // ISO
  updatedAt: string // ISO
  /** Optional poster used on the project card. */
  thumbnailUrl?: string
}

export interface Clip {
  id: string
  projectId: string
  title: string
  description?: string | null
  startSeconds: number
  endSeconds: number
  /** Highlight strength used for ranking (DB `clips.score`, numeric). The UI
   *  renders it as a 0–100 virality score via `viralityScore()`. */
  score: number
  status: ClipStatus
  /** Playable clip URL — set once the clip is rendered (DB `clips.video_url`). */
  videoUrl?: string | null
  createdAt: string // ISO
  /** Poster frame for the clip tile (UI-side; not a DB column yet). */
  posterUrl?: string
  /** Which platforms this clip has been posted to (UI/demo state). */
  postedPlatforms?: SocialPlatform[]
}
