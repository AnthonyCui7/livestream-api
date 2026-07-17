import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clapperboard, Eye, EyeOff, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { DEMO_MODE } from '../lib/demo'

export default function LoginPage() {
  const { signInWithEmail, signUpWithEmail, signInDemo } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
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
      if (mode === 'signup') await signUpWithEmail(email, password)
      else await signInWithEmail(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const enterDemo = () => {
    signInDemo()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-neutral-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-8">
          <span className="grid place-items-center w-9 h-9 rounded-[9px] bg-gradient-to-br from-violet-500 to-fuchsia-500">
            <Clapperboard size={19} className="text-white" />
          </span>
          <div>
            <div className="text-white text-[17px] font-semibold leading-none tracking-tight">
              Clipper {/* HARDCODED: placeholder product name */}
            </div>
            <div className="text-neutral-500 text-[12px] mt-1">Turn long video into viral clips</div>
          </div>
        </div>

        {DEMO_MODE && (
          <button
            onClick={enterDemo}
            className="w-full mb-4 h-11 flex items-center justify-center gap-2 rounded-[9px] bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[13.5px] font-semibold hover:opacity-95 transition-opacity"
          >
            <Sparkles size={15} />
            Continue in demo mode
          </button>
        )}

        {DEMO_MODE && (
          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-white/[0.07]" />
            <span className="text-neutral-600 text-[11px]">or use email</span>
            <div className="h-px flex-1 bg-white/[0.07]" />
          </div>
        )}

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
                placeholder="••••••••"
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
            className="w-full h-11 bg-white/[0.08] hover:bg-white/[0.12] text-white text-[13.5px] font-semibold rounded-[9px] transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-neutral-500 text-[12.5px]">
          {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              setMode((m) => (m === 'signup' ? 'signin' : 'signup'))
              setError('')
            }}
            className="text-neutral-300 hover:text-white transition-colors"
          >
            {mode === 'signup' ? 'Sign in' : 'Sign up'}
          </button>
        </p>

        {DEMO_MODE && (
          <p className="mt-6 text-center text-neutral-600 text-[11px]">
            {/* HARDCODED: demo notice — remove when real auth is enabled */}
            Demo mode is on — email sign-in is faked. No real account is created.
          </p>
        )}
      </div>
    </div>
  )
}
