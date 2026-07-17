// Auth state, mirroring the narrative frontend's Supabase-backed AuthContext
// (simplified to email/password). In DEMO_MODE it never touches Supabase and
// instead keeps a fake session in localStorage so the app is usable offline.
//
// To go live: set DEMO_MODE = false in `lib/demo.ts`. The real Supabase paths
// below are already wired.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSupabase } from '../lib/supabase'
import { DEMO_MODE, DEMO_USER } from '../lib/demo'

/** Minimal user shape the UI needs — a subset of Supabase's User. */
export interface AppUser {
  id: string
  email: string | null
}

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** DEMO: skip real auth and enter with the fake user. Remove with demo mode. */
  signInDemo: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const DEMO_SESSION_KEY = 'demo.session' // DEMO

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // ── DEMO branch: read the fake session, no network ────────────────────
    if (DEMO_MODE) {
      const active = localStorage.getItem(DEMO_SESSION_KEY) === '1'
      setUser(active ? { id: DEMO_USER.id, email: DEMO_USER.email } : null)
      setLoading(false)
      return
    }

    // ── Real Supabase auth ────────────────────────────────────────────────
    const supabase = getSupabase()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null)
      setLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signInDemo = () => {
    // DEMO: accept any (or no) credentials and enter as the fake user.
    localStorage.setItem(DEMO_SESSION_KEY, '1')
    setUser({ id: DEMO_USER.id, email: DEMO_USER.email })
  }

  const signInWithEmail = async (email: string, password: string) => {
    if (DEMO_MODE) return signInDemo() // DEMO
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUpWithEmail = async (email: string, password: string) => {
    if (DEMO_MODE) return signInDemo() // DEMO
    const { error } = await getSupabase().auth.signUp({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    setUser(null)
    if (DEMO_MODE) {
      localStorage.removeItem(DEMO_SESSION_KEY) // DEMO
      return
    }
    try {
      await getSupabase().auth.signOut({ scope: 'local' })
    } catch (err) {
      console.error('Sign out error (non-fatal):', err)
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, signInWithEmail, signUpWithEmail, signOut, signInDemo }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
