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
// off: the New Project flow clones the seeded showcase project (the row with
// projects.is_demo = true, seeded by scripts in the container repo) into a
// project the caller owns — see createDemoProject in lib/api.ts. The shared
// original is hidden from the projects list (services/projects.ts) because
// nobody owns it, so writes to it would 404.
