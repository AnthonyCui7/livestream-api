import type { ReactNode } from 'react'
import { Navbar } from './Navbar'
import { Toaster } from '../ui/Toaster'

/** App chrome: fixed top navbar over a scrollable content area. */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-[#0a0a0b] text-neutral-100">
      <Navbar />
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-6xl px-5 py-8">{children}</div>
      </main>
      <Toaster />
    </div>
  )
}
