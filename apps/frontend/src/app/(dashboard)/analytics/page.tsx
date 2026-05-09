'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, Phone, Users, TrendingUp, Clock, Zap, CheckCircle2,
  Calendar, ChevronDown, RefreshCw, Info,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatNumber, formatDuration, getMosColor, getMosLabel } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts'
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { cn } from '@/lib/utils'

const COLORS = ['#22c55e', '#f97316', '#ef4444', '#6366f1', '#8b5cf6']

const PRESETS = [
  { label: 'Last 7 days',   days: 7 },
  { label: 'Last 14 days',  days: 14 },
  { label: 'Last 30 days',  days: 30 },
  { label: 'Last 90 days',  days: 90 },
  { label: 'This month',    days: -1 },
  { label: 'Last month',    days: -2 },
]

function getPresetDates(preset: typeof PRESETS[0]) {
  if (preset.days === -1) {
    return {
      from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      to:   format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    }
  }
  if (preset.days === -2) {
    return {
      from: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'),
      to:   format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'),
    }
  }
  return {
    from: format(subDays(new Date(), preset.days - 1), 'yyyy-MM-dd'),
    to:   format(new Date(), 'yyyy-MM-dd'),
  }
}

export default function AnalyticsPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const ago30 = format(subDays(new Date(), 29), 'yyyy-MM-dd')

  const [from, setFrom]       = useState(ago30)
  const [to, setTo]           = useState(today)
  const [preset, setPreset]   = useState('Last 30 days')
  const [showP, setShowP]     = useState(false)
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')

  const applyPreset = (p: typeof PRESETS[0]) => {
    const dates = getPresetDates(p)
    setFrom(dates.from); setTo(dates.to); setPreset(p.label); setShowP(false)
  }

  const { data: rangeData, isLoading: loadRange, refetch } = useQuery({
    queryKey: ['analytics', 'range', from, to, groupBy],
    queryFn: () => api.get('/analytics/range', { params: { from, to, groupBy } }).then(r => r.data),
    enabled: !!from && !!to,
  })

  const { data: campaigns = [] } = useQuery({
    queryKey: ['analytics', 'campaigns'],
    queryFn: () => api.get('/analytics/campaigns').then(r => r.data),
  })

  const { data: rtp } = useQuery({
    queryKey: ['analytics', 'rtp'],
    queryFn: () => api.get('/analytics/rtp').then(r => r.data),
  })

  const summary = rangeData?.summary ?? {}
  const timeline = rangeData?.timeline ?? []

  const pieData = [
    { name: 'Human Answer', value: summary.humanAnswers ?? 0 },
    { name: 'Voicemail',    value: summary.machineAnswers ?? 0 },
    { name: 'No Answer',    value: Math.max(0, (summary.totalCalls ?? 0) - (summary.answeredCalls ?? 0) - (summary.failedCalls ?? 0)) },
    { name: 'Failed/Busy',  value: summary.failedCalls ?? 0 },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Campaign performance insights for any date range
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-accent transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Date range + group by */}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4 flex-wrap">
        {/* Preset */}
        <div className="relative">
          <button
            onClick={() => setShowP(!showP)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-background border border-border text-sm hover:border-brand-500/50 transition-all"
          >
            <Calendar className="h-4 w-4 text-brand-400" />
            {preset}
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', showP && 'rotate-180')} />
          </button>
          {showP && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowP(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-xl py-1 w-40">
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className={cn(
                      'w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
                      preset === p.label && 'text-brand-300 font-medium',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Custom range */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">From</span>
          <input type="date" value={from} max={to}
            onChange={e => { setFrom(e.target.value); setPreset('Custom') }}
            className="px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <span className="text-xs text-muted-foreground">To</span>
          <input type="date" value={to} min={from} max={today}
            onChange={e => { setTo(e.target.value); setPreset('Custom') }}
            className="px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>

        {/* Group by */}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Group:</span>
          {(['day', 'week', 'month'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                groupBy === g ? 'gradient-brand text-white' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Phone,       label: 'Total Calls',  value: formatNumber(summary.totalCalls ?? 0),       color: 'text-blue-400',   bg: 'bg-blue-500/10' },
          { icon: TrendingUp,  label: 'Answer Rate',  value: `${(summary.answerRate ?? 0).toFixed(1)}%`,  color: 'text-green-400',  bg: 'bg-green-500/10' },
          { icon: Users,       label: 'Human Rate',   value: `${(summary.humanRate ?? 0).toFixed(1)}%`,   color: 'text-brand-400',  bg: 'bg-brand-500/10' },
          { icon: Clock,       label: 'Total Talk',   value: formatDuration(summary.totalDuration ?? 0),  color: 'text-purple-400', bg: 'bg-purple-500/10' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className={cn('p-2 rounded-lg', kpi.bg)}>
                <kpi.icon className={cn('h-4 w-4', kpi.color)} />
              </div>
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
            </div>
            <p className={cn('text-3xl font-bold', kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Answered',   value: formatNumber(summary.answeredCalls ?? 0),  color: 'text-green-400' },
          { label: 'Human',      value: formatNumber(summary.humanAnswers ?? 0),   color: 'text-brand-400' },
          { label: 'Voicemail',  value: formatNumber(summary.machineAnswers ?? 0), color: 'text-orange-400' },
          { label: 'Failed',     value: formatNumber(summary.failedCalls ?? 0),    color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chart + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold">Call Volume</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {from} → {to} · grouped by {groupBy}
              </p>
            </div>
          </div>
          {loadRange ? (
            <div className="h-60 bg-muted/20 rounded-xl animate-pulse" />
          ) : timeline.length === 0 ? (
            <div className="h-60 flex flex-col items-center justify-center text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No calls in this period</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Try a different date range or start a campaign
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={timeline} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false}
                  tickFormatter={v => groupBy === 'month' ? v.slice(0, 7) : v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="human"   name="Human"    fill="#22c55e" stackId="a" radius={[2,2,0,0]} />
                <Bar dataKey="machine" name="Voicemail" fill="#f97316" stackId="a" />
                <Bar dataKey="failed"  name="Failed"   fill="#ef4444" stackId="a" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-5">Call Outcomes</h3>
          {pieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-center text-muted-foreground text-sm">
              No data yet
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <PieChart width={160} height={160}>
                  <Pie data={pieData} cx={75} cy={75} innerRadius={45} outerRadius={70}
                    dataKey="value" strokeWidth={0}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </div>
              <div className="space-y-2">
                {pieData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground">{entry.name}</span>
                    </div>
                    <span className="font-medium tabular-nums">{formatNumber(entry.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Call Quality */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-semibold">Call Quality (MOS Score)</h3>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Based on RTP media quality metrics
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg MOS Score',   value: rtp?.avgMos ?? 0, fmt: (v: number) => v.toFixed(2),  color: getMosColor(rtp?.avgMos ?? 0), sub: getMosLabel(rtp?.avgMos ?? 0) },
            { label: 'Excellent Calls', value: rtp?.excellentCalls ?? 0, fmt: (v: number) => formatNumber(v), color: 'text-green-400',  sub: 'MOS ≥ 4.0 — HD quality' },
            { label: 'Good Calls',      value: rtp?.goodCalls ?? 0,      fmt: (v: number) => formatNumber(v), color: 'text-yellow-400', sub: 'MOS 3.5–4.0 — acceptable' },
            { label: 'Poor Calls',      value: rtp?.poorCalls ?? 0,      fmt: (v: number) => formatNumber(v), color: 'text-red-400',    sub: 'MOS < 3.5 — degraded' },
          ].map(s => (
            <div key={s.label} className="bg-muted/30 rounded-xl p-4 text-center">
              <p className={cn('text-3xl font-bold tabular-nums', s.color)}>{s.fmt(s.value)}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
        {!rtp?.avgMos && (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            MOS data is collected from completed calls. Make calls to see quality metrics.
          </div>
        )}
      </div>

      {/* Campaign performance */}
      {campaigns.length > 0 ? (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Campaign Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  {['Campaign', 'Status', 'Dialed', 'Answer %', 'Human %', 'Voicemail %', 'Avg Duration'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {campaigns.map((c: any) => {
                  const ans = c.processedContacts > 0 ? (c.answeredCalls / c.processedContacts * 100).toFixed(1) : '0.0'
                  const hum = c.answeredCalls > 0     ? (c.humanAnswers / c.answeredCalls  * 100).toFixed(1) : '0.0'
                  const mac = c.answeredCalls > 0     ? (c.machineAnswers / c.answeredCalls * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={c.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-4 py-3 font-medium max-w-[200px] truncate">{c.name}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'text-xs font-semibold px-2 py-0.5 rounded-full',
                          c.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400' :
                          c.status === 'RUNNING'   ? 'bg-brand-500/10 text-brand-400' :
                          'bg-muted text-muted-foreground',
                        )}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatNumber(c.processedContacts)}</td>
                      <td className="px-4 py-3 tabular-nums text-green-400 font-medium">{ans}%</td>
                      <td className="px-4 py-3 tabular-nums text-brand-400">{hum}%</td>
                      <td className="px-4 py-3 tabular-nums text-orange-400">{mac}%</td>
                      <td className="px-4 py-3 tabular-nums">{formatDuration(c.avgDuration ?? 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No campaign data yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Create and run campaigns to see performance analytics here
          </p>
        </div>
      )}
    </div>
  )
}
