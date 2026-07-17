import type { ReactNode } from 'react'
import { Clapperboard } from 'lucide-react'

/** Shared centered card + brand header for the login / signup pages. */
export function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0b] text-neutral-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-8">
          <span className="grid place-items-center w-9 h-9 rounded-[9px] bg-violet-600">
            <Clapperboard size={19} className="text-white" />
          </span>
          <div>
            <div className="text-white text-[17px] font-semibold leading-none tracking-tight">
              Clipper {/* HARDCODED: placeholder product name */}
            </div>
            <div className="text-neutral-500 text-[12px] mt-1">{subtitle}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
