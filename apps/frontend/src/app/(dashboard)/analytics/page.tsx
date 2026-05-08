'use client'

import { useQuery } from '@tanstack/react-query'
import { BarChart3, Phone, Users, TrendingUp, Clock, Zap, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatNumber, formatDuration, getMosColor, getMosLabel } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'

const COLORS = ['#6366f1', '#22c55e', '#f97316', '#ef4444', '#8b5cf6']

export default function AnalyticsPage() {
  const { data: dashboard } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: timeline = [] } = useQuery({
    queryKey: ['analytics', 'timeline', 30],
    queryFn: () => api.get('/analytics/timeline?days=30').then(r => r.data),
    refetchInterval: 120000,
  })

  const { data: campaigns = [] } = useQuery({
    queryKey: ['analytics', 'campaigns'],
    queryFn: () => api.get('/analytics/campaigns').then(r => r.data),
  })

  const { data: rtp } = useQuery({
    queryKey: ['analytics', 'rtp'],
    queryFn: () => api.get('/analytics/rtp').then(r => r.data),
  })

  const stats = dashboard?.last30Days ?? {}

  const pieData = [
    { name: 'Human', value: stats.humanAnswers ?? 0 },
    { name: 'Voicemail', value: stats.machineAnswers ?? 0 },
    { name: 'No Answer', value: (stats.totalCalls ?? 0) - (stats.answeredCalls ?? 0) - (stats.failedCalls ?? 0) },
    { name: 'Failed', value: stats.failedCalls ?? 0 },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Campaign performance insights — last 30 days</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Phone, label: 'Total Calls', value: formatNumber(stats.totalCalls ?? 0), color: 'text-blue-400' },
          { icon: TrendingUp, label: 'Answer Rate', value: `${stats.answerRate?.toFixed(1) ?? 0}%`, color: 'text-green-400' },
          { icon: Users, label: 'Human Rate', value: `${stats.humanRate?.toFixed(1) ?? 0}%`, color: 'text-brand-400' },
          { icon: Clock, label: 'Avg Duration', value: formatDuration(stats.avgDuration ?? 0), color: 'text-purple-400' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
            </div>
            <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 30-day chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-5">Call Volume (30 Days)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={timeline} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tickFormatter={v => format(parseISO(v), 'MMM d')}
                tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                labelFormatter={v => format(parseISO(v), 'MMM d, yyyy')}
              />
              <Bar dataKey="human" name="Human" fill="#22c55e" radius={[2, 2, 0, 0]} stackId="a" />
              <Bar dataKey="machine" name="Machine" fill="#f97316" radius={[0, 0, 0, 0]} stackId="a" />
              <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Outcome pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-5">Call Outcomes</h3>
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
                <span className="font-medium">{formatNumber(entry.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RTP Quality */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">RTP Quality Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg MOS Score', value: rtp?.avgMos ?? 0, suffix: '', color: getMosColor(rtp?.avgMos ?? 0), sub: getMosLabel(rtp?.avgMos ?? 0) },
            { label: 'Excellent Calls', value: formatNumber(rtp?.excellentCalls ?? 0), suffix: '', color: 'text-green-400', sub: 'MOS ≥ 4.0' },
            { label: 'Good Calls', value: formatNumber(rtp?.goodCalls ?? 0), suffix: '', color: 'text-yellow-400', sub: 'MOS 3.5–4.0' },
            { label: 'Poor Calls', value: formatNumber(rtp?.poorCalls ?? 0), suffix: '', color: 'text-red-400', sub: 'MOS < 3.5' },
          ].map(s => (
            <div key={s.label} className="text-center p-4 bg-muted/30 rounded-xl">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign performance table */}
      {campaigns.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Campaign Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Campaign', 'Status', 'Calls', 'Answer Rate', 'Human Rate', 'Avg Duration'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c: any) => {
                  const answerRate = c.processedContacts > 0 ? (c.answeredCalls / c.processedContacts * 100).toFixed(1) : '0.0'
                  const humanRate = c.answeredCalls > 0 ? (c.humanAnswers / c.answeredCalls * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatNumber(c.processedContacts)}</td>
                      <td className="px-4 py-3 tabular-nums text-green-400">{answerRate}%</td>
                      <td className="px-4 py-3 tabular-nums text-brand-400">{humanRate}%</td>
                      <td className="px-4 py-3 tabular-nums">{formatDuration(c.avgDuration ?? 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
