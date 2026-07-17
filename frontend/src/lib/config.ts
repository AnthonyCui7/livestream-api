// App-level mode switches.
//
// Auth is ALWAYS real Supabase (no demo bypass) — see contexts/AuthContext.
//
// DATA_DEMO: false — projects/clips come from the real backend now (Supabase
// reads in services/projects.ts + router writes in lib/api.ts). The hardcoded
// sample store (lib/demo.ts) is kept for reference only; flip this back to
// true only if you also re-point services/projects.ts at it.
export const DATA_DEMO = false

// YouTube blocks datacenter (EC2) egress IPs, so real YouTube ingestion is
// off: the New Project flow routes every YouTube submission to this seeded
// showcase project (projects.is_demo — readable by all users) instead of
// launching a worker that would fail. Seeded by scripts in the container
// repo; keep in sync with the DB row's fixed id.
export const DEMO_YOUTUBE_PROJECT_ID = '11111111-2222-4333-8444-555555555555'
