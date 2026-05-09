'use client'

import { useEffect, useState } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

export function OfflineBanner() {
  const [online, setOnline] = useState(true)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    const handleOnline  = () => { setOnline(true) }
    const handleOffline = () => { setOnline(false); setWasOffline(true) }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Back online — show brief message then hide
  useEffect(() => {
    if (online && wasOffline) {
      const t = setTimeout(() => setWasOffline(false), 3000)
      return () => clearTimeout(t)
    }
  }, [online, wasOffline])

  if (online && !wasOffline) return null

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all ${
      online
        ? 'bg-green-500/90 text-white'
        : 'bg-red-500/90 text-white'
    }`}>
      {online ? (
        <>
          <Wifi className="h-4 w-4" />
          Back online — reconnecting…
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          No internet connection. Some features may not work.
        </>
      )}
    </div>
  )
}
