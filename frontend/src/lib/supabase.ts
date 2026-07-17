// Browser-side Supabase client. Uses the anon key only (RLS-gated) — the
// service-role key never ships to the client (see the repo README's trust
// model). Reads the VITE_ vars from frontend/.env.
//
// Created lazily so a missing env doesn't throw at import time — AuthContext
// catches the error and lands the user on /login instead of white-screening.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
        'Set them in frontend/.env, or use demo mode.',
    )
  }
  client = createClient(supabaseUrl, supabaseAnonKey)
  return client
}
