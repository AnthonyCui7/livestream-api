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
  /** Reviewer edits (trim + captions + title override) layered on top of the
   *  rendered clip. Merged in on read from the edit store (`lib/clipEdits.ts`);
   *  undefined = untouched. Burning these into the file is a future server
   *  re-render — see `services/saveClipEdits`. */
  edits?: ClipEdits
}

// ── clip editor: trim + captions ────────────────────────────────────────────
//
// The editor (see `components/clips/editor/`) works on the CLIP'S OWN rendered
// video: time 0 is the start of `clip.videoUrl`, and every time below is in
// those clip-relative seconds. Trim narrows the playable window; captions are
// timed text overlays painted over the video. All of it is stored as edit
// metadata (`ClipEdits`) and is forward-compatible with a router
// `PATCH /api/clips/:id` + a server-side re-render that burns it in.

/** A named caption look. Drives the default fill / stroke / background pill;
 *  individual fields can still be overridden per caption. */
export type CaptionPreset = 'pill' | 'outline' | 'shadow'

/** Where a caption sits over the frame — one of nine anchor slots. Position is
 *  stored as normalized center coords (`Caption.x` / `.y`); these are just the
 *  quick-place presets the inspector offers. */
export type CaptionAlign = 'left' | 'center' | 'right'

/** Full visual style of a caption overlay. Mirrors narrative's `TextClipStyle`,
 *  collapsed to what a simple editor needs. */
export interface CaptionStyle {
  preset: CaptionPreset
  fontFamily: string
  /** Font size in px, authored against a 1080px-wide reference frame and
   *  scaled to the actual player width at render time. */
  fontSize: number
  fontWeight: number
  /** Text fill color (hex). */
  color: string
  align: CaptionAlign
  /** Outline painted behind the fill — null disables it. */
  stroke: { color: string; width: number } | null
  /** Rounded background pill behind the text — null disables it. */
  background: { color: string; opacity: number } | null
}

/** One on-video caption. Visible over `[startSeconds, endSeconds)` of the clip
 *  timeline, positioned in normalized center-anchored coords (0.5,0.5 = dead
 *  center of the frame), independent of player size. */
export interface Caption {
  id: string
  text: string
  startSeconds: number
  endSeconds: number
  /** 0–1 of frame width, center-anchored. */
  x: number
  /** 0–1 of frame height, center-anchored. */
  y: number
  style: CaptionStyle
}

/** The reviewable edits layered on top of a rendered clip. Times are
 *  clip-relative seconds. Persisted per clip id and merged into `Clip.edits`
 *  on read; an unedited clip has no record. */
export interface ClipEdits {
  /** Overridden title, when the reviewer renamed the clip. */
  title?: string
  /** New in-point within the clip video (clip-relative seconds). Undefined =
   *  start of the clip. */
  trimStart?: number
  /** New out-point within the clip video. Undefined = end of the clip. */
  trimEnd?: number
  captions: Caption[]
  /** Center-crop the clip to a vertical 9:16 frame. Undefined/null = full
   *  frame. Applied via CSS in previews; burned in by a future re-render. */
  crop?: 'center' | null
  /** ISO timestamp of the last save. */
  updatedAt: string
}

// ── social accounts (Zernio-backed, via the router) ─────────────────────────

/** One connected social account, as returned by GET /api/social/accounts. */
export interface SocialAccount {
  id: string
  platform: SocialPlatform | string
  name?: string | null
}
