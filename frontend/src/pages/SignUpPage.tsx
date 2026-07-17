import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, MailCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { AuthShell } from '../components/auth/AuthShell'

export default function SignUpPage() {
  const { signUpWithEmail } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { needsConfirmation } = await signUpWithEmail(email, password)
      if (needsConfirmation) {
        // Email confirmation is on for this project — no session yet.
        setConfirmSent(true)
      } else {
        // Confirmation off — signUp created a session, we're in.
        navigate('/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (confirmSent) {
    return (
      <AuthShell subtitle="Turn long video into viral clips">
        <div className="text-center">
          <span className="grid place-items-center w-12 h-12 mx-auto rounded-[12px] bg-white/[0.04] ring-1 ring-white/[0.06] mb-4">
            <MailCheck size={22} className="text-violet-300" />
          </span>
          <h2 className="text-white text-[15px] font-medium mb-1.5">Confirm your email</h2>
          <p className="text-neutral-500 text-[12.5px] mb-6">
            We sent a confirmation link to <span className="text-neutral-300">{email}</span>. Click
            it, then sign in.
          </p>
          <Link
            to="/login"
            className="inline-block w-full h-11 leading-[44px] bg-violet-600 hover:bg-violet-500 text-white text-[13.5px] font-semibold rounded-[9px] transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell subtitle="Create your account">
      <form onSubmit={submit} className="space-y-3">
        {error && (
          <div className="px-3 py-2 bg-red-500/10 ring-1 ring-red-500/20 rounded-[7px]">
            <p className="text-red-300 text-[12px]">{error}</p>
          </div>
        )}
        <div>
          <label className="block text-neutral-400 text-[12px] mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-3.5 py-2.5 bg-white/[0.04] text-white text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-violet-500/40 placeholder-neutral-600 transition-colors"
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
              minLength={6}
              placeholder="At least 6 characters"
              className="w-full px-3.5 py-2.5 pr-10 bg-white/[0.04] text-white text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-violet-500/40 placeholder-neutral-600 transition-colors"
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
          className="w-full h-11 bg-violet-600 hover:bg-violet-500 text-white text-[13.5px] font-semibold rounded-[9px] transition-colors disabled:opacity-50"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-5 text-center text-neutral-500 text-[12.5px]">
        Already have an account?{' '}
        <Link to="/login" className="text-neutral-300 hover:text-white transition-colors">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}
