// Auth state, backed entirely by Supabase (email/password). Users live in
// Supabase auth.users; projects.user_id references them. Requires the browser
// env vars (VITE_SUPABASE_URL + ANON_KEY) — see lib/supabase.ts.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSupabase } from '../lib/supabase'

/** Minimal user shape the UI needs — a subset of Supabase's User. */
export interface AppUser {
  id: string
  email: string | null
}

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  signInWithEmail: (email: string, password: string) => Promise<void>
  /** Returns whether the project requires email confirmation before sign-in. */
  signUpWithEmail: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function toAppUser(user: { id: string; email?: string } | null | undefined): AppUser | null {
  return user ? { id: user.id, email: user.email ?? null } : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let supabase
    try {
      supabase = getSupabase()
    } catch (err) {
      // Missing env — surface it, but don't white-screen: land on /login.
      console.error(err)
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(toAppUser(session?.user))
      setLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAppUser(session?.user))
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUpWithEmail = async (email: string, password: string) => {
    const { data, error } = await getSupabase().auth.signUp({ email, password })
    if (error) throw error
    // When email confirmation is enabled, signUp returns a user but no session.
    return { needsConfirmation: !data.session }
  }

  const signOut = async () => {
    setUser(null)
    try {
      await getSupabase().auth.signOut({ scope: 'local' })
    } catch (err) {
      console.error('Sign out error (non-fatal):', err)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithEmail, signUpWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
