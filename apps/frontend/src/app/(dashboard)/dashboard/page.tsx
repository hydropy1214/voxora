'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Activity, Phone, Users, TrendingUp, Zap, Radio, AlertCircle,
  PhoneOutgoing, Megaphone, ArrowRight, CheckCircle2, XCircle,
  Voicemail, Clock, BarChart2, Plus,
} from 'lucide-react'
import { api } from '@/lib/api'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { CallsChart } from '@/components/dashboard/CallsChart'
import { LiveCallsWidget } from '@/components/dashboard/LiveCallsWidget'
import { useLiveStats } from '@/hooks/useLiveStats'
import { useAuthStore } from '@/store/auth.store'
import Link from 'next/link'
import { cn } from '@/lib/utils'

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatDuration(s: number) {
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

export default function DashboardPage() {
  const user = useAuthStore(s => s.user)

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: timelineData } = useQuery({
    queryKey: ['analytics', 'timeline'],
    queryFn: () => api.get('/analytics/timeline?days=14').then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: recentEvents } = useQuery({
    queryKey: ['analytics', 'events'],
    queryFn: () => api.get('/analytics/events?limit=8').then(r => r.data),
    refetchInterval: 15000,
  })

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns', 'recent'],
    queryFn: () => api.get('/campaigns?limit=3').then(r => r.data?.data ?? []),
    refetchInterval: 30000,
  })

  const { data: dialerStats } = useQuery({
    queryKey: ['dialer', 'stats'],
    queryFn: () => api.get('/dialer/stats').then(r => r.data),
    refetchInterval: 60000,
  })

  const { liveStats } = useLiveStats()
  const stats = analytics?.last30Days ?? {}

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-7">

      {/* ── Greeting + Live badge ──────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting}, {user?.firstName} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Here&apos;s how your calling activity looks today
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(liveStats?.activeCalls ?? 0) > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full">
              <div className="live-indicator" />
              <span className="text-green-400 text-sm font-medium">
                {liveStats.activeCalls} active {liveStats.activeCalls === 1 ? 'call' : 'calls'}
              </span>
            </div>
          )}
          <Link
            href="/dialer"
            className="flex items-center gap-2 px-4 py-2 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90 transition-all"
          >
            <Phone className="h-3.5 w-3.5" />
            Open Dialer
          </Link>
        </div>
      </div>

      {/* ── Primary KPIs ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Active Campaigns"
          value={analytics?.activeCampaigns ?? 0}
          icon={Radio}
          trend={analytics?.activeCampaigns > 0 ? 'up' : undefined}
          color="brand"
          live={analytics?.activeCampaigns > 0}
        />
        <StatsCard
          title="Calls Today"
          value={(analytics?.todayCalls ?? 0) + (dialerStats?.todayCalls ?? 0)}
          icon={Phone}
          subtitle="Campaigns + Dialer"
          color="blue"
        />
        <StatsCard
          title="Answer Rate"
          value={`${stats.answerRate?.toFixed(1) ?? 0}%`}
          icon={TrendingUp}
          subtitle="Last 30 days"
          color="green"
        />
        <StatsCard
          title="Human Answers"
          value={`${stats.humanRate?.toFixed(1) ?? 0}%`}
          icon={Users}
          subtitle="Of answered calls"
          color="purple"
        />
      </div>

      {/* ── Secondary metrics ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Live Calls"
          value={liveStats?.activeCalls ?? 0}
          icon={Activity}
          live
          color="green"
          compact
        />
        <StatsCard
          title="Dialer Calls (30d)"
          value={dialerStats?.total ?? 0}
          icon={PhoneOutgoing}
          color="brand"
          compact
        />
        <StatsCard
          title="Voicemail Rate"
          value={`${stats.machineRate?.toFixed(1) ?? 0}%`}
          icon={Zap}
          color="yellow"
          compact
        />
        <StatsCard
          title="Failure Rate"
          value={`${stats.failureRate?.toFixed(1) ?? 0}%`}
          icon={AlertCircle}
          color="red"
          compact
        />
      </div>

      {/* ── Main content grid ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Chart — 2/3 width */}
        <div className="lg:col-span-2">
          <CallsChart data={timelineData ?? []} loading={isLoading} />
        </div>

        {/* Right sidebar widgets */}
        <div className="space-y-4">
          <LiveCallsWidget />

          {/* Quick actions */}
          <div className="stat-card">
            <p className="text-sm font-semibold mb-3">Quick Actions</p>
            <div className="space-y-2">
              {[
                { href: '/dialer', label: 'Make a call', icon: Phone, color: 'text-brand-400' },
                { href: '/campaigns?new=1', label: 'New campaign', icon: Megaphone, color: 'text-blue-400' },
                { href: '/contacts', label: 'Import contacts', icon: Users, color: 'text-green-400' },
                { href: '/audio-files', label: 'Upload audio', icon: Zap, color: 'text-yellow-400' },
              ].map(a => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-all group"
                >
                  <a.icon className={cn('h-4 w-4', a.color)} />
                  <span className="text-sm flex-1">{a.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom row: Recent events + Active campaigns ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent call events */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Recent Call Events</h3>
            </div>
            <span className="text-xs text-muted-foreground">Auto-refreshes</span>
          </div>

          {!recentEvents || recentEvents.length === 0 ? (
            <div className="py-8 text-center">
              <Phone className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No call events yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Start a campaign or use the dialer</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {recentEvents?.map((event: any, i: number) => {
                const isHuman   = event.amdResult === 'HUMAN'
                const isMachine = event.amdResult === 'MACHINE'
                const isFailed  = event.status === 'FAILED' || event.status === 'BUSY'
                const Icon = isHuman ? CheckCircle2 : isMachine ? Voicemail : isFailed ? XCircle : Phone
                const iconColor = isHuman ? 'text-green-400' : isMachine ? 'text-orange-400' : isFailed ? 'text-red-400' : 'text-muted-foreground'

                return (
                  <div key={event.id ?? i} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-accent/30 transition-colors">
                    <Icon className={cn('h-4 w-4 flex-shrink-0', iconColor)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono">
                          {event.contact?.phone || event.phone || '—'}
                        </span>
                        {event.amdResult && (
                          <span className={cn(
                            'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                            isHuman   ? 'bg-green-500/10 text-green-400'   : '',
                            isMachine ? 'bg-orange-500/10 text-orange-400' : '',
                          )}>
                            {event.amdResult}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {event.campaign?.name || 'Dialer'}
                        {event.duration ? ` · ${formatDuration(event.duration)}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {timeAgo(event.createdAt)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent campaigns */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Recent Campaigns</h3>
            </div>
            <Link href="/campaigns" className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {!campaigns || campaigns.length === 0 ? (
            <div className="py-8 text-center">
              <Megaphone className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No campaigns yet</p>
              <Link
                href="/campaigns"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg gradient-brand text-white text-xs font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> Create Campaign
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns?.map((c: any) => {
                const statusColor =
                  c.status === 'RUNNING'   ? 'text-green-400 bg-green-500/10'  :
                  c.status === 'PAUSED'    ? 'text-yellow-400 bg-yellow-500/10' :
                  c.status === 'COMPLETED' ? 'text-blue-400 bg-blue-500/10'     :
                  'text-muted-foreground bg-muted/30'

                const progress = c.totalContacts > 0
                  ? Math.round((c.dialedCount / c.totalContacts) * 100)
                  : 0

                return (
                  <Link
                    key={c.id}
                    href="/campaigns"
                    className="block p-3 rounded-xl bg-background border border-border hover:border-brand-500/40 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium truncate flex-1 mr-2">{c.name}</p>
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', statusColor)}>
                        {c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{c.dialedCount ?? 0} / {c.totalContacts ?? 0} dialed</span>
                      <span>·</span>
                      <span>{c.answeredCount ?? 0} answered</span>
                    </div>
                    {c.totalContacts > 0 && (
                      <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full gradient-brand rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
