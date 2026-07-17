import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type ApiStatus = 'checking' | 'online' | 'offline'

const statusStyles: Record<ApiStatus, string> = {
  checking: 'bg-amber-400/10 text-amber-400 ring-amber-400/30',
  online: 'bg-emerald-400/10 text-emerald-400 ring-emerald-400/30',
  offline: 'bg-rose-400/10 text-rose-400 ring-rose-400/30',
}

export default function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => setApiStatus(res.ok ? 'online' : 'offline'))
      .catch(() => setApiStatus('offline'))
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-950 text-neutral-100">
      <h1 className="text-4xl font-semibold tracking-tight">Livestream Clipper</h1>
      <p className="max-w-md text-center text-neutral-400">
        Paste a stream or VOD URL and let the pipeline find the moments worth clipping.
      </p>
      <span className={`rounded-full px-3 py-1 text-sm ring-1 ${statusStyles[apiStatus]}`}>
        router: {apiStatus}
      </span>
    </main>
  )
}
