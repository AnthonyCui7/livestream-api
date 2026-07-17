import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { AuthShell } from '../components/auth/AuthShell'
import { GoogleButton } from '../components/auth/GoogleButton'

export default function LoginPage() {
  const { signInWithEmail, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithEmail(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const googleSignIn = async () => {
    setError('')
    try {
      await signInWithGoogle() // redirects away on success
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
    }
  }

  return (
    <AuthShell subtitle="Turn long video into viral clips">
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 ring-1 ring-red-500/20 rounded-[7px]">
          <p className="text-red-300 text-[12px]">{error}</p>
        </div>
      )}

      <GoogleButton onClick={googleSignIn} />

      <div className="flex items-center gap-3 my-4">
        <span className="h-px flex-1 bg-white/[0.08]" />
        <span className="text-neutral-600 text-[11px]">or</span>
        <span className="h-px flex-1 bg-white/[0.08]" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-neutral-400 text-[12px] mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-3.5 py-2.5 bg-white/[0.04] text-[#F5F5F3] text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-[#22E55F]/40 placeholder-neutral-600 transition-colors"
          />
        </div>
        <div>
          <label className="block text-neutral-400 text-[12px] mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 pr-10 bg-white/[0.04] text-[#F5F5F3] text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-[#22E55F]/40 placeholder-neutral-600 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              {showPassword ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-[#22E55F] hover:bg-[#35f16d] text-[#0A0A0A] text-[13.5px] font-semibold rounded-[9px] transition-colors disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-neutral-500 text-[12.5px]">
        Don't have an account?{' '}
        <Link to="/signup" className="text-neutral-300 hover:text-[#F5F5F3] transition-colors">
          Sign up
        </Link>
      </p>
    </AuthShell>
  )
}
