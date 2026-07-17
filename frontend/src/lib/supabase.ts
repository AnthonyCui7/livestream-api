// Browser-side Supabase client. Uses the anon key only (RLS-gated) — the
// service-role key never ships to the client (see the repo README's trust
// model). Mirrors the root `.env` VITE_ vars.
//
// In DEMO_MODE (see `lib/demo.ts`) auth never touches Supabase, so the env
// vars may be absent; we create a client lazily and don't throw at import
// time.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
        'Set them in the root .env, or use demo mode.',
    )
  }
  client = createClient(supabaseUrl, supabaseAnonKey)
  return client
}
