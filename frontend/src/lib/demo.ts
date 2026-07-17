// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DEMO DATA — 100% HARDCODED / FAKE, read-only.                          ║
// ║                                                                        ║
// ║  Sample projects + clips shown to EVERY signed-in user for now (auth    ║
// ║  is real; data is not). Shapes match the real DB schema                 ║
// ║  (livestream-container/supabase/migrations/*.sql), so wiring the real   ║
// ║  data layer later is a swap in services/projects.ts, not a reshape.     ║
// ║                                                                         ║
// ║  There is no create/delete here — those buttons are duds until the     ║
// ║  router projects API exists. Only `postClip` mutates, and only in       ║
// ║  memory for the current session. Search "DEMO" to find every seam.      ║
// ╚══════════════════════════════════════════════════════════════════════╝

import type { Clip, Project, SocialPlatform } from '../types'

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString()
}

// DEMO: OpusClip-style viral hook titles the fake pipeline "detected".
const CLIP_TITLES = [
  'The moment nobody saw coming',
  'He did NOT just say that 😳',
  'This take is going to start a war',
  'Wait for the plot twist at the end',
  'Chat completely lost it here',
  'The advice that changed everything',
  '3 things you’re doing wrong',
  'This is why you keep losing',
  'Insane clutch play (must watch)',
  'The story that silenced the room',
  'Nobody talks about this hack',
  'The comeback of the century',
]

function makeClip(projectId: string, index: number, score: number): Clip {
  const start = 45 + index * 180
  const length = 22 + ((index * 7) % 40) // 22–62s, deterministic
  return {
    id: `${projectId}_clip_${index}`,
    projectId,
    title: CLIP_TITLES[index % CLIP_TITLES.length],
    description: null,
    startSeconds: start,
    endSeconds: start + length,
    score,
    status: 'rendered', // DEMO: pretend the render finished (no real media)
    videoUrl: null,
    createdAt: minutesAgo(120 - index * 5),
    posterUrl: undefined,
    postedPlatforms: [],
  }
}

// Deterministic-ish scores so the virality tiers show off.
const READY_SCORES = [0.97, 0.91, 0.86, 0.82, 0.74, 0.66, 0.61, 0.54]
const INGESTING_SCORES = [0.93, 0.7, 0.58]

const READY_ID = 'proj_demo_ready'
const INGESTING_ID = 'proj_demo_stream'

// DEMO: the hardcoded projects every user sees.
const PROJECTS: Project[] = [
  {
    id: READY_ID,
    userId: null,
    name: 'Podcast Ep. 142 — full cut',
    sourceType: 'upload',
    sourceUrl: 'upload://podcast-142-master.mp4',
    sourceFiles: [{ id: 'f1', name: 'podcast-142-master.mp4', sizeBytes: 2_400_000_000 }],
    status: 'ready',
    viralityThreshold: 0,
    clipCount: READY_SCORES.length,
    createdAt: minutesAgo(180),
    updatedAt: minutesAgo(150),
  },
  {
    id: INGESTING_ID,
    userId: null,
    name: 'Friday night Twitch VOD',
    sourceType: 'video',
    sourceUrl: 'https://twitch.tv/videos/1234567890',
    streamPlatform: 'twitch',
    status: 'ingesting',
    viralityThreshold: 0,
    clipCount: INGESTING_SCORES.length,
    createdAt: minutesAgo(12),
    updatedAt: minutesAgo(1),
  },
]

// DEMO: the hardcoded clips. Kept in a mutable array so `postClip` can flip
// `postedPlatforms` within a session (resets on reload — no persistence).
const CLIPS: Clip[] = [
  ...READY_SCORES.map((s, i) => makeClip(READY_ID, i, s)),
  ...INGESTING_SCORES.map((s, i) => makeClip(INGESTING_ID, i, s)),
]

function clipsFor(projectId: string): Clip[] {
  return CLIPS.filter((c) => c.projectId === projectId).sort((a, b) => b.score - a.score)
}

// ── per-project clip subscribers (so a post updates the badge live) ───────

type ClipListener = (clips: Clip[]) => void
const listeners = new Map<string, Set<ClipListener>>()

function emit(projectId: string): void {
  listeners.get(projectId)?.forEach((fn) => fn(clipsFor(projectId)))
}

// Simulated network latency so loading states are visible.
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export const demoStore = {
  async listProjects(): Promise<Project[]> {
    return delay([...PROJECTS].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  },

  async getProject(id: string): Promise<Project | null> {
    return delay(PROJECTS.find((p) => p.id === id) ?? null)
  },

  async listClips(projectId: string): Promise<Clip[]> {
    return delay(clipsFor(projectId))
  },

  /** DEMO: fake "post to social" — records the platform in memory and notifies. */
  async postClip(clipId: string, platform: SocialPlatform): Promise<void> {
    const clip = CLIPS.find((c) => c.id === clipId)
    if (clip) {
      const set = new Set(clip.postedPlatforms ?? [])
      set.add(platform)
      clip.postedPlatforms = [...set]
      emit(clip.projectId)
    }
    return delay(undefined, 700) // pretend the upload takes a beat
  },

  /** Fires immediately with the project's clips, then again on each post. */
  subscribeClips(projectId: string, cb: ClipListener): () => void {
    let set = listeners.get(projectId)
    if (!set) {
      set = new Set()
      listeners.set(projectId, set)
    }
    set.add(cb)
    cb(clipsFor(projectId))
    return () => {
      set?.delete(cb)
    }
  },
}
