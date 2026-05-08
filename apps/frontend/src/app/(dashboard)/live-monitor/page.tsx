'use client'

import { useQuery } from '@tanstack/react-query'
import { Activity, Phone, Wifi, Server, TrendingUp, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { useLiveStats } from '@/hooks/useLiveStats'
import { getStatusColor, getMosColor, formatPhoneNumber, timeAgo, formatNumber } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'

export default function LiveMonitorPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['live-monitor', 'stats'],
    queryFn: () => api.get('/live-monitor/stats').then(r => r.data),
    refetchInterval: 3000,
  })

  const { data: rtpData = [] } = useQuery({
    queryKey: ['live-monitor', 'rtp'],
    queryFn: () => api.get('/live-monitor/rtp').then(r => r.data),
    refetchInterval: 5000,
  })

  const { liveStats, events, connected } = useLiveStats()
  const [mosHistory, setMosHistory] = useState<Array<{ time: string; mos: number }>>([])

  useEffect(() => {
    const now = format(new Date(), 'HH:mm:ss')
    if (liveStats.activeCalls > 0) {
      setMosHistory(prev => [...prev.slice(-30), { time: now, mos: 4.1 }])
    }
  }, [liveStats])

  const activeCalls = liveStats.activeCalls ?? stats?.activeCalls ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Monitor</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Real-time campaign activity</p>
        </div>
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border',
          connected
            ? 'text-green-400 bg-green-400/10 border-green-400/20'
            : 'text-red-400 bg-red-400/10 border-red-400/20',
        )}>
          <div className={cn('h-2 w-2 rounded-full', connected ? 'bg-green-400 animate-pulse' : 'bg-red-400')} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {/* Live metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: Phone, label: 'Active Calls', value: activeCalls,
            color: activeCalls > 0 ? 'text-green-400' : 'text-foreground',
            bg: activeCalls > 0 ? 'bg-green-500/15 border-green-500/20' : 'bg-muted border-border',
          },
          {
            icon: Activity, label: 'Campaigns Running', value: stats?.activeCampaigns?.length ?? 0,
            color: 'text-brand-400', bg: 'bg-brand-500/15 border-brand-500/20',
          },
          {
            icon: TrendingUp, label: 'Calls/Min', value: liveStats.callsPerMinute?.toFixed(1) ?? '0.0',
            color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/20',
          },
          {
            icon: Wifi, label: 'SIP Status', value: stats?.freeswitchConnected ? 'Online' : 'Offline',
            color: stats?.freeswitchConnected ? 'text-green-400' : 'text-red-400',
            bg: stats?.freeswitchConnected ? 'bg-green-500/15 border-green-500/20' : 'bg-red-500/15 border-red-500/20',
          },
        ].map(m => (
          <div key={m.label} className={cn('rounded-xl border p-4 flex items-center gap-3', m.bg)}>
            <m.icon className={cn('h-5 w-5', m.color)} />
            <div>
              <p className={cn('text-2xl font-bold tabular-nums', m.color)}>{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Campaigns */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Active Campaigns</h3>
          {(!stats?.activeCampaigns || stats.activeCampaigns.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No active campaigns
            </div>
          ) : (
            <div className="space-y-3">
              {stats.activeCampaigns.map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{c.name}</span>
                      <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                    </div>
                    <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-green-500 transition-all"
                        style={{ width: `${c.totalContacts > 0 ? (c.processedContacts / c.totalContacts) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-green-400">{c.activeCalls}</p>
                    <p className="text-xs text-muted-foreground">active</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live events feed */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Live Feed</h3>
            <span className="text-xs text-muted-foreground">{events.length} events</span>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Waiting for events...</p>
            ) : events.slice(0, 20).map((event, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 text-xs border-b border-border/30">
                <span className={cn(
                  'px-1.5 py-0.5 rounded border text-xs flex-shrink-0',
                  event.amdResult ? getStatusColor(event.amdResult) : 'text-muted-foreground bg-muted border-border',
                )}>
                  {event.amdResult ?? event.type?.replace('call:', '').toUpperCase()}
                </span>
                <span className="font-mono flex-1 truncate">
                  {formatPhoneNumber(event.phone || '')}
                </span>
                {event.duration !== undefined && <span className="text-muted-foreground">{event.duration}s</span>}
                <span className="text-muted-foreground">{timeAgo(event.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SIP Account Status */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">SIP Account Status</h3>
        </div>
        {(!stats?.sipStatus || stats.sipStatus.length === 0) ? (
          <p className="text-sm text-muted-foreground">No SIP accounts configured</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {stats.sipStatus.map((acc: any) => (
              <div key={acc.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', acc.status === 'REGISTERED' ? 'bg-green-500/15' : 'bg-muted')}>
                  <Wifi className={cn('h-4 w-4', acc.status === 'REGISTERED' ? 'text-green-400' : 'text-muted-foreground')} />
                </div>
                <div>
                  <p className="text-sm font-medium">{acc.name}</p>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full border', getStatusColor(acc.status))}>
                    {acc.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
