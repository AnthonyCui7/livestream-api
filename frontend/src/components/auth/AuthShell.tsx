import type { ReactNode } from 'react'

/** Shared centered card + brand header for the login / signup pages. */
export function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F3] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-8">
          <span className="grid place-items-center w-9 h-9 rounded-[9px] border border-white/60 bg-transparent">
            <img src="/clipfarm-logo.png" alt="" className="w-7 h-7 object-contain" />
          </span>
          <div>
            <div className="text-[#F5F5F3] text-[17px] font-semibold leading-none tracking-tight">
              ClipFarm
            </div>
            <div className="text-neutral-500 text-[12px] mt-1">{subtitle}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
