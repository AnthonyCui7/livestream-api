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

/** Lifecycle of a project. Matches the DB `projects.status` check constraint.
 *  stopping = cancel requested, worker wrapping up · cancelled = terminal. */
export type ProjectStatus =
  | 'created'
  | 'ingesting'
  | 'ready'
  | 'failed'
  | 'stopping'
  | 'cancelled'

/** Lifecycle of a clip. Matches the DB `clips.status` check constraint. */
export type ClipStatus = 'detected' | 'rendered' | 'failed'

/** Free-form clip data stored in the DB `clips.metadata` jsonb column.
 *  Newer pipeline versions write `thumbnail_url`; existing rows lack it, so
 *  every key is optional and readers must tolerate junk. */
export interface ClipMetadata {
  /** Public JPG poster frame for the clip tile (newer clips only). */
  thumbnail_url?: string
  /** Other pipeline-written keys we don't model yet. */
  [key: string]: unknown
}

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
  /** Clips scoring below this 0–1 cutoff are not rendered (DB `virality_threshold`). */
  viralityThreshold: number
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
  /** Raw DB `clips.metadata` jsonb, passed through as-is. */
  metadata?: ClipMetadata
  /** Poster frame for the clip tile — `metadata.thumbnail_url` when the
   *  pipeline rendered one; older clips fall back to a video frame / color. */
  posterUrl?: string
  /** Which platforms this clip has been posted to (UI/demo state). */
  postedPlatforms?: SocialPlatform[]
}
