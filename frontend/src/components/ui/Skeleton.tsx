// Pulsing placeholder block for loading states (solid — no gradient).

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-white/[0.05] rounded-[3px] animate-pulse ${className}`} />
}
