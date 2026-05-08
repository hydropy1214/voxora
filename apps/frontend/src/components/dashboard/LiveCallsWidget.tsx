'use client'

import { Phone } from 'lucide-react'
import { useLiveStats } from '@/hooks/useLiveStats'
import { formatPhoneNumber, getStatusColor } from '@/lib/utils'
import { cn } from '@/lib/utils'

export function LiveCallsWidget() {
  const { events, liveStats } = useLiveStats()
  const recentCalls = events.slice(0, 5)

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-brand-400" />
          <h3 className="font-semibold text-sm">Live Calls</h3>
        </div>
        <div className={cn(
          'text-lg font-bold tabular-nums',
          liveStats.activeCalls > 0 ? 'text-green-400' : 'text-muted-foreground'
        )}>
          {liveStats.activeCalls}
        </div>
      </div>

      <div className="space-y-2">
        {recentCalls.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No active calls</p>
        ) : (
          recentCalls.map((event, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className={cn(
                'px-1.5 py-0.5 rounded text-xs font-medium border',
                event.type === 'call:answered' || event.amdResult === 'HUMAN'
                  ? getStatusColor('HUMAN')
                  : event.amdResult === 'MACHINE'
                  ? getStatusColor('MACHINE')
                  : 'text-muted-foreground bg-muted border-border',
              )}>
                {event.amdResult ?? (event.type === 'call:answered' ? 'LIVE' : 'END')}
              </div>
              <span className="flex-1 font-mono text-muted-foreground truncate">
                {formatPhoneNumber(event.phone || '')}
              </span>
              {event.duration !== undefined && (
                <span className="text-muted-foreground">{event.duration}s</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
