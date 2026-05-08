'use client'

import { useRouter } from 'next/navigation'
import { Bell, LogOut, User, Settings, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useState } from 'react'
import { useLiveStats } from '@/hooks/useLiveStats'

export function TopBar() {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const refreshToken = useAuthStore(s => s.refreshToken)
  const [showMenu, setShowMenu] = useState(false)
  const { connected } = useLiveStats()

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken })
      }
    } catch {}
    logout()
    router.push('/login')
    toast.success('Signed out')
  }

  const initials = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : '?'

  return (
    <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
          connected
            ? 'text-green-400 bg-green-400/10 border border-green-400/20'
            : 'text-gray-500 bg-gray-500/10 border border-gray-500/20'
        }`}>
          <div className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
          {connected ? 'Live' : 'Offline'}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all">
          <Bell className="h-4 w-4" />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-all"
          >
            <div className="h-7 w-7 rounded-full gradient-brand flex items-center justify-center text-white text-xs font-bold">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium leading-none">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-32">{user?.email}</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 z-20 bg-card border border-border rounded-xl shadow-xl py-1">
                <button
                  onClick={() => { router.push('/settings'); setShowMenu(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profile
                </button>
                <button
                  onClick={() => { router.push('/settings'); setShowMenu(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Settings
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 transition-colors text-left"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
