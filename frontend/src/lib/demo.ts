// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DEMO DATA — 100% HARDCODED / FAKE.                                     ║
// ║                                                                        ║
// ║  Everything in this file is placeholder "slop" so the UI is usable     ║
// ║  before the router API exists. When the real endpoints land, delete    ║
// ║  this file and back `services/projects.ts` + `contexts/AuthContext`    ║
// ║  with real network calls. Nothing else imports fake data directly —    ║
// ║  the demo surface is confined to this module.                          ║
// ║                                                                        ║
// ║  Search for "DEMO" across the codebase to find every seam.             ║
// ╚══════════════════════════════════════════════════════════════════════╝

import type { Clip, Project, ProjectStatus, SourceType, StreamPlatform } from '../types'

/**
 * DEMO master switch. `true` → the app runs entirely on this fake store and
 * auth is bypassed. Flip to `false` (and implement the real API) to go live.
 */
export const DEMO_MODE = true

/** DEMO: the fake signed-in user shown when demo mode bypasses real auth. */
export const DEMO_USER = {
  id: 'demo-user',
  email: 'you@demo.local',
} as const

// ── in-memory store (persisted to localStorage so refreshes survive) ──────

const STORAGE_KEY = 'demo.store.v1' // DEMO

interface StoreShape {
  projects: Project[]
  clips: Clip[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString()
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

// DEMO: OpusClip-style viral hook titles the fake pipeline "detects".
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
  'He predicted it 30 seconds early',
  'The comeback of the century',
  'This part broke the internet',
  'You won’t believe what happened next',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// DEMO: build one fake clip with a plausible length + virality score.
function makeClip(projectId: string, index: number): Clip {
  const start = 45 + index * 180 + Math.floor(Math.random() * 120)
  const length = 18 + Math.floor(Math.random() * 42) // 18–60s shorts
  // Skew scores high-ish so the demo shows off the virality tiers.
  const score = Math.round((0.5 + Math.random() * 0.49) * 100) / 100
  return {
    id: uid('clip'),
    projectId,
    title: pick(CLIP_TITLES),
    startSeconds: start,
    endSeconds: start + length,
    score,
    createdAt: nowIso(),
    // No real media in demo — the UI renders a gradient placeholder poster.
    url: undefined,
    posterUrl: undefined,
  }
}

// DEMO: seed content so the app isn't empty on first load.
function seed(): StoreShape {
  const readyId = 'proj_demo_ready'
  const streamId = 'proj_demo_stream'

  const projects: Project[] = [
    {
      id: readyId,
      name: 'Podcast Ep. 142 — full cut',
      sourceType: 'vod',
      sourceFiles: [{ id: 'f1', name: 'podcast-142-master.mp4', sizeBytes: 2_400_000_000 }],
      status: 'ready',
      clipCount: 8,
      createdAt: minutesAgo(180),
      updatedAt: minutesAgo(150),
    },
    {
      id: streamId,
      name: 'Friday night Twitch VOD',
      sourceType: 'stream',
      streamUrl: 'https://twitch.tv/videos/1234567890',
      streamPlatform: 'twitch',
      status: 'processing',
      clipCount: 3,
      createdAt: minutesAgo(12),
      updatedAt: minutesAgo(1),
    },
  ]

  const clips: Clip[] = [
    ...Array.from({ length: 8 }, (_, i) => makeClip(readyId, i)),
    ...Array.from({ length: 3 }, (_, i) => makeClip(streamId, i)),
  ]

  return { projects, clips }
}

function load(): StoreShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as StoreShape
  } catch {
    /* ignore corrupt/absent storage */
  }
  const fresh = seed()
  save(fresh)
  return fresh
}

function save(s: StoreShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* storage full / unavailable — demo still works in-memory */
  }
}

const store: StoreShape = load()

// ── tiny per-project clip event bus (drives "clips filtering in") ─────────

type ClipListener = (clips: Clip[]) => void
const listeners = new Map<string, Set<ClipListener>>()

function clipsFor(projectId: string): Clip[] {
  return store.clips
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => b.score - a.score)
}

function emit(projectId: string): void {
  const set = listeners.get(projectId)
  if (!set) return
  const snapshot = clipsFor(projectId)
  set.forEach((fn) => fn(snapshot))
}

// DEMO: how many clips a project ends up with, and the cadence they arrive.
const TARGET_CLIPS = 8
const CLIP_INTERVAL_MS = 3500

const generators = new Map<string, ReturnType<typeof setInterval>>()

// DEMO: simulate the worker discovering clips one by one, then completing.
function startGenerator(projectId: string): void {
  if (generators.has(projectId)) return
  const project = store.projects.find((p) => p.id === projectId)
  if (!project) return

  // A queued project "provisions" briefly, then flips to processing.
  const kickoff = setTimeout(() => {
    setProjectStatus(projectId, 'processing')
    const interval = setInterval(() => {
      const p = store.projects.find((x) => x.id === projectId)
      if (!p) return stopGenerator(projectId)
      if (p.clipCount >= TARGET_CLIPS) {
        setProjectStatus(projectId, 'ready')
        return stopGenerator(projectId)
      }
      store.clips.push(makeClip(projectId, p.clipCount))
      p.clipCount += 1
      p.updatedAt = nowIso()
      save(store)
      emit(projectId)
    }, CLIP_INTERVAL_MS)
    generators.set(projectId, interval)
  }, 1200)

  // Track the kickoff timer under the same key so stop() clears either phase.
  generators.set(projectId, kickoff as unknown as ReturnType<typeof setInterval>)
}

function stopGenerator(projectId: string): void {
  const handle = generators.get(projectId)
  if (handle) clearInterval(handle)
  generators.delete(projectId)
}

function setProjectStatus(projectId: string, status: ProjectStatus): void {
  const p = store.projects.find((x) => x.id === projectId)
  if (!p) return
  p.status = status
  p.updatedAt = nowIso()
  save(store)
  emit(projectId)
}

// On load, resume any project left mid-processing (e.g. after a refresh).
for (const p of store.projects) {
  if (p.status === 'queued' || p.status === 'processing') startGenerator(p.id)
}

// ── public demo API (mirrors what services/projects.ts will call) ─────────

// Simulated network latency so loading states are visible.
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export interface CreateProjectInput {
  name: string
  sourceType: SourceType
  streamUrl?: string
  streamPlatform?: StreamPlatform
  sourceFiles?: { name: string; sizeBytes?: number }[]
}

export const demoStore = {
  async listProjects(): Promise<Project[]> {
    const sorted = [...store.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return delay(sorted)
  },

  async getProject(id: string): Promise<Project | null> {
    return delay(store.projects.find((p) => p.id === id) ?? null)
  },

  async createProject(input: CreateProjectInput): Promise<Project> {
    const id = uid('proj')
    const project: Project = {
      id,
      name: input.name,
      sourceType: input.sourceType,
      streamUrl: input.streamUrl,
      streamPlatform: input.streamPlatform,
      sourceFiles: input.sourceFiles?.map((f, i) => ({ id: `${id}_f${i}`, ...f })),
      status: 'queued',
      clipCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    store.projects.unshift(project)
    save(store)
    startGenerator(id) // kick off the fake "clips filtering in"
    return delay(project)
  },

  async deleteProject(id: string): Promise<void> {
    stopGenerator(id)
    store.projects = store.projects.filter((p) => p.id !== id)
    store.clips = store.clips.filter((c) => c.projectId !== id)
    listeners.delete(id)
    save(store)
    return delay(undefined)
  },

  async listClips(projectId: string): Promise<Clip[]> {
    return delay(clipsFor(projectId))
  },

  /**
   * Subscribe to a project's clips as the fake pipeline produces them.
   * Fires immediately with the current set, then again on every new clip /
   * status change. Returns an unsubscribe fn.
   */
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
