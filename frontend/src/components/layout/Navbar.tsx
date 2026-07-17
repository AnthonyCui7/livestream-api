import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { DATA_DEMO } from '../../lib/config'

export function Navbar() {
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const initial = (user?.email ?? '?').charAt(0).toUpperCase()

  return (
    <header className="h-16 shrink-0 border-b border-white/[0.06] flex items-center justify-between px-5">
      <Link to="/" className="flex items-center gap-3 group">
        <span className="grid place-items-center w-11 h-11 rounded-[10px] border border-white/70 bg-transparent">
          <img src="/clipfarm-logo.png" alt="" className="w-8 h-8 object-contain" />
        </span>
        <span className="text-[#F5F5F3] text-[22px] font-semibold tracking-tight">ClipFarm</span>
        {DATA_DEMO && (
          <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-[#22E55F] bg-[#22E55F]/10 ring-1 ring-[#22E55F]/20 rounded-full px-1.5 py-0.5">
            demo
          </span>
        )}
      </Link>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-neutral-200 text-[13px] font-semibold grid place-items-center transition-colors"
          title={user?.email ?? 'Account'}
        >
          {initial}
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-[#171717] ring-1 ring-white/[0.08] rounded-[6px] shadow-xl overflow-hidden z-20">
            <div className="px-3 py-2.5 border-b border-white/[0.06]">
              <div className="text-neutral-300 text-[12px] truncate">{user?.email}</div>
              <div className="text-neutral-500 text-[11px]">Signed in</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                void signOut()
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
