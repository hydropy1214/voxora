'use client'

import { useQuery } from '@tanstack/react-query'
import { Clock, Phone, CheckCircle2, XCircle, Voicemail } from 'lucide-react'
import { api } from '@/lib/api'
import { formatPhoneNumber, getStatusColor, timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

const getEventIcon = (status: string, amdResult: string) => {
  if (amdResult === 'HUMAN') return { icon: CheckCircle2, color: 'text-green-400' }
  if (amdResult === 'MACHINE') return { icon: Voicemail, color: 'text-orange-400' }
  if (status === 'FAILED' || status === 'BUSY') return { icon: XCircle, color: 'text-red-400' }
  return { icon: Phone, color: 'text-muted-foreground' }
}

export function RecentEvents() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'events'],
    queryFn: () => api.get('/analytics/events?limit=10').then(r => r.data),
    refetchInterval: 15000,
  })

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Recent Events</h3>
        </div>
        <span className="text-xs text-muted-foreground">Live feed</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {data?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No events yet. Start a campaign to see activity.</p>
          ) : (
            data?.map((event: any, i: number) => {
              const { icon: EventIcon, color } = getEventIcon(event.status, event.amdResult)
              return (
                <div key={event.id ?? i} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-accent/30 transition-colors">
                  <EventIcon className={cn('h-4 w-4 flex-shrink-0', color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-foreground">
                        {formatPhoneNumber(event.contact?.phone || event.phone || '')}
                      </span>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded border',
                        getStatusColor(event.amdResult || event.status),
                      )}>
                        {event.amdResult || event.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {event.campaign?.name}
                      {event.duration ? ` · ${event.duration}s` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {timeAgo(event.createdAt)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
