'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Megaphone, Users, FileAudio, Wifi,
  Activity, Mic, BarChart3, CreditCard, Settings, PhoneCall, ChevronRight, MonitorCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/live-monitor', label: 'Live Monitor', icon: Activity, live: true },
    ],
  },
  {
    label: 'Campaigns',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/contacts', label: 'Contacts', icon: Users },
      { href: '/audio-files', label: 'Audio Files', icon: FileAudio },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { href: '/sip-accounts', label: 'SIP Accounts', icon: Wifi },
      { href: '/recordings', label: 'Recordings', icon: Mic },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/billing', label: 'Billing', icon: CreditCard },
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/status', label: 'System Status', icon: MonitorCheck },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 flex-shrink-0 bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-border">
        <div className="h-8 w-8 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0">
          <PhoneCall className="h-4 w-4 text-white" />
        </div>
        <span className="font-bold text-lg">CallsPsy</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {NAV_ITEMS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all mb-0.5',
                    isActive
                      ? 'bg-brand-500/15 text-brand-300 font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  )}
                >
                  <Icon className={cn('h-4 w-4 flex-shrink-0', isActive && 'text-brand-400')} />
                  <span className="flex-1">{item.label}</span>
                  {'live' in item && item.live && (
                    <span className="flex h-1.5 w-1.5 rounded-full bg-green-400" />
                  )}
                  {isActive && <ChevronRight className="h-3.5 w-3.5 text-brand-400" />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom: plan badge */}
      <div className="p-4 border-t border-border">
        <div className="bg-brand-500/10 border border-brand-500/20 rounded-lg p-3">
          <p className="text-xs font-semibold text-brand-300">Trial Plan</p>
          <p className="text-xs text-muted-foreground mt-0.5">2 concurrent calls</p>
          <Link href="/billing" className="mt-2 text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
            Upgrade <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </aside>
  )
}
