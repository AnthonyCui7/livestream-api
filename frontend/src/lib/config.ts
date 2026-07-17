// App-level mode switches.
//
// Auth is ALWAYS real Supabase (no demo bypass) — see contexts/AuthContext.
//
// DATA_DEMO: projects/clips are still hardcoded sample data (see lib/demo.ts),
// shown to every signed-in user for now. Under the DB's RLS, writes are
// service_role-only (worker/router), so real project creation needs a router
// endpoint. Flip DATA_DEMO to false and back services/projects.ts with real
// Supabase reads + router writes once that exists.
export const DATA_DEMO = true
