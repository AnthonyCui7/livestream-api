// App-level mode switches.
//
// Auth is ALWAYS real Supabase (no demo bypass) — see contexts/AuthContext.
//
// DATA_DEMO: false — projects/clips come from the real backend now (Supabase
// reads in services/projects.ts + router writes in lib/api.ts). The hardcoded
// sample store (lib/demo.ts) is kept for reference only; flip this back to
// true only if you also re-point services/projects.ts at it.
export const DATA_DEMO = false
