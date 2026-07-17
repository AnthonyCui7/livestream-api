import { useEffect, useState } from 'react'
import { subscribeToast } from '../../lib/toast'

interface Item {
  id: number
  message: string
}

/** Renders transient toasts fired via showToast(). Mount once, near the root. */
export function Toaster() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    let seq = 0
    return subscribeToast((message) => {
      const id = ++seq
      setItems((prev) => [...prev, { id, message }])
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 2400)
    })
  }, [])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2">
      {items.map((i) => (
        <div
          key={i.id}
          className="px-3.5 py-2 bg-[#1a1a1e] ring-1 ring-white/[0.10] rounded-[8px] shadow-xl text-neutral-200 text-[12.5px]"
        >
          {i.message}
        </div>
      ))}
    </div>
  )
}
