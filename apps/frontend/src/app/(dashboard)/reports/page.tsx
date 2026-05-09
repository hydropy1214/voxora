'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart2, Download, Calendar, Phone, Megaphone, Users,
  PhoneOutgoing, TrendingUp, Clock, CheckCircle2, XCircle,
  FileText, AlertCircle, ChevronDown, RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'

// ── Helpers ──────────────────────────────────────────────────────
function fmt(n: number | undefined) { return (n ?? 0).toLocaleString() }
function dur(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60); const sec = s % 60
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${sec}s`
}

const PRESETS = [
  { label: 'Today',        from: () => format(new Date(), 'yyyy-MM-dd'), to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Last 7 days',  from: () => format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Last 30 days', from: () => format(subDays(new Date(), 29), 'yyyy-MM-dd'), to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'This month',   from: () => format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: () => format(endOfMonth(new Date()), 'yyyy-MM-dd') },
  { label: 'Last month',   from: () => format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), to: () => format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') },
  { label: 'Last 3 months',from: () => format(subDays(new Date(), 89), 'yyyy-MM-dd'), to: () => format(new Date(), 'yyyy-MM-dd') },
]

type ReportTab = 'overview' | 'campaigns' | 'dialer' | 'contacts'

// ── CSV export helper ────────────────────────────────────────────
function downloadCsv(data: any[], filename: string, columns: { key: string; label: string }[]) {
  const header = columns.map(c => c.label).join(',')
  const rows = data.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? ''
      return typeof val === 'string' && val.includes(',') ? `"${val}"` : val
    }).join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── KPI card ────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={cn('p-2 rounded-lg', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

export default function ReportsPage() {
  const today  = format(new Date(), 'yyyy-MM-dd')
  const ago30  = format(subDays(new Date(), 29), 'yyyy-MM-dd')

  const [from, setFrom]         = useState(ago30)
  const [to, setTo]             = useState(today)
  const [activeTab, setTab]     = useState<ReportTab>('overview')
  const [groupBy, setGroupBy]   = useState<'day' | 'week' | 'month'>('day')
  const [preset, setPreset]     = useState('Last 30 days')
  const [showPresets, setShowP] = useState(false)

  const applyPreset = (p: typeof PRESETS[0]) => {
    setFrom(p.from()); setTo(p.to()); setPreset(p.label); setShowP(false)
  }

  // Data queries
  const { data: overview, isLoading: loadOverview, refetch: refOverview } = useQuery({
    queryKey: ['reports', 'range', from, to, groupBy],
    queryFn: () => api.get('/analytics/range', { params: { from, to, groupBy } }).then(r => r.data),
    enabled: !!from && !!to,
  })

  const { data: campaignReport = [], isLoading: loadCamp, refetch: refCamp } = useQuery({
    queryKey: ['reports', 'campaigns', from, to],
    queryFn: () => api.get('/analytics/reports/campaigns', { params: { from, to } }).then(r => r.data),
    enabled: !!from && !!to,
  })

  const { data: dialerRaw, isLoading: loadDial, refetch: refDial } = useQuery({
    queryKey: ['reports', 'dialer', from, to],
    queryFn: () => api.get('/analytics/reports/dialer', { params: { from, to } }).then(r => r.data),
    enabled: !!from && !!to,
  })
  const dialerReport = dialerRaw?.records ?? []
  const dialerSummary = dialerRaw?.summary

  const { data: contactReport = [], isLoading: loadCont } = useQuery({
    queryKey: ['reports', 'contacts'],
    queryFn: () => api.get('/analytics/reports/contacts').then(r => r.data),
  })

  const summary = overview?.summary ?? {}

  const TABS: { id: ReportTab; label: string; icon: any }[] = [
    { id: 'overview',  label: 'Overview',   icon: BarChart2 },
    { id: 'campaigns', label: 'Campaigns',  icon: Megaphone },
    { id: 'dialer',    label: 'Dialer Calls', icon: PhoneOutgoing },
    { id: 'contacts',  label: 'Contacts',   icon: Users },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Analyse your calling activity across any date range. Export any report to CSV.
          </p>
        </div>
      </div>

      {/* Date range controls */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Preset picker */}
          <div className="relative">
            <button
              onClick={() => setShowP(!showPresets)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-background border border-border text-sm hover:border-brand-500/50 transition-all"
            >
              <Calendar className="h-4 w-4 text-brand-400" />
              <span>{preset}</span>
              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', showPresets && 'rotate-180')} />
            </button>
            {showPresets && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowP(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-xl py-1 w-44">
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

          {/* Custom date range */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={e => { setFrom(e.target.value); setPreset('Custom') }}
              className="px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="text-xs text-muted-foreground">To</span>
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={e => { setTo(e.target.value); setPreset('Custom') }}
              className="px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Group by (for overview) */}
          {activeTab === 'overview' && (
            <div className="flex items-center gap-1 ml-auto">
              {(['day', 'week', 'month'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                    groupBy === g
                      ? 'gradient-brand text-white'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === t.id
                ? 'gradient-brand text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Calls" value={fmt(summary.totalCalls)} icon={Phone} color="bg-blue-500/10 text-blue-400" />
            <KpiCard label="Answer Rate" value={`${(summary.answerRate ?? 0).toFixed(1)}%`} icon={TrendingUp} color="bg-green-500/10 text-green-400" />
            <KpiCard label="Human Rate" value={`${(summary.humanRate ?? 0).toFixed(1)}%`} icon={Users} color="bg-brand-500/10 text-brand-400" />
            <KpiCard label="Total Talk Time" value={dur(summary.totalDuration ?? 0)} icon={Clock} color="bg-purple-500/10 text-purple-400" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Answered" value={fmt(summary.answeredCalls)} sub="Connected calls" icon={CheckCircle2} color="bg-green-500/10 text-green-400" />
            <KpiCard label="Human" value={fmt(summary.humanAnswers)} sub="Live person answered" icon={Users} color="bg-brand-500/10 text-brand-400" />
            <KpiCard label="Voicemail" value={fmt(summary.machineAnswers)} sub="Machine detected" icon={Phone} color="bg-orange-500/10 text-orange-400" />
            <KpiCard label="Failed / Busy" value={fmt(summary.failedCalls)} sub="Did not connect" icon={XCircle} color="bg-red-500/10 text-red-400" />
          </div>

          {/* Timeline chart */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold">Call Volume Over Time</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Stacked by outcome — grouped by {groupBy}
                </p>
              </div>
              <button
                onClick={() => refOverview()}
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            {loadOverview ? (
              <div className="h-60 bg-muted/20 rounded-xl animate-pulse" />
            ) : !overview?.timeline?.length ? (
              <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
                No call data for this date range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={overview.timeline} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false}
                    tickFormatter={v => groupBy === 'month' ? v.slice(0, 7) : v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="human"   name="Human"    fill="#22c55e" radius={[2,2,0,0]} stackId="a" />
                  <Bar dataKey="machine" name="Voicemail" fill="#f97316" stackId="a" />
                  <Bar dataKey="failed"  name="Failed"   fill="#ef4444" radius={[2,2,0,0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Export button */}
          {overview?.timeline?.length > 0 && (
            <button
              onClick={() => downloadCsv(overview.timeline, `callspsy_overview_${from}_${to}.csv`, [
                { key: 'date', label: 'Date' },
                { key: 'total', label: 'Total' },
                { key: 'answered', label: 'Answered' },
                { key: 'human', label: 'Human' },
                { key: 'machine', label: 'Machine' },
                { key: 'failed', label: 'Failed' },
                { key: 'totalDuration', label: 'Total Duration (s)' },
              ])}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent transition-all"
            >
              <Download className="h-4 w-4" />
              Export to CSV
            </button>
          )}
        </div>
      )}

      {/* ── CAMPAIGNS TAB ────────────────────────────────────── */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {campaignReport.length} campaign{campaignReport.length !== 1 ? 's' : ''} in selected range
            </p>
            {campaignReport.length > 0 && (
              <button
                onClick={() => downloadCsv(campaignReport, `callspsy_campaigns_${from}_${to}.csv`, [
                  { key: 'name', label: 'Campaign' },
                  { key: 'status', label: 'Status' },
                  { key: 'sipAccount', label: 'SIP Account' },
                  { key: 'totalContacts', label: 'Total Contacts' },
                  { key: 'dialedCount', label: 'Dialed' },
                  { key: 'answeredCount', label: 'Answered' },
                  { key: 'humanCount', label: 'Human' },
                  { key: 'machineCount', label: 'Machine' },
                  { key: 'failedCount', label: 'Failed' },
                  { key: 'answerRate', label: 'Answer Rate %' },
                  { key: 'humanRate', label: 'Human Rate %' },
                  { key: 'avgDuration', label: 'Avg Duration (s)' },
                  { key: 'totalDuration', label: 'Total Duration (s)' },
                  { key: 'createdAt', label: 'Created' },
                ])}
                className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-accent transition-all"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {loadCamp ? (
              <div className="p-8 text-center text-muted-foreground">Loading…</div>
            ) : campaignReport.length === 0 ? (
              <div className="p-10 text-center">
                <Megaphone className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No campaigns in this period</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Try expanding your date range</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      {['Campaign', 'Status', 'Dialed', 'Answered', 'Human', 'Voicemail', 'Failed', 'Answer %', 'Human %', 'Avg Duration'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {campaignReport.map((c: any) => (
                      <tr key={c.id} className="hover:bg-accent/20 transition-colors">
                        <td className="px-4 py-3 font-medium max-w-[180px] truncate" title={c.name}>{c.name}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'text-xs font-semibold px-2 py-0.5 rounded-full',
                            c.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400' :
                            c.status === 'RUNNING'   ? 'bg-brand-500/10 text-brand-400' :
                            'bg-muted text-muted-foreground',
                          )}>{c.status}</span>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{fmt(c.dialedCount)}</td>
                        <td className="px-4 py-3 tabular-nums text-green-400">{fmt(c.answeredCount)}</td>
                        <td className="px-4 py-3 tabular-nums text-brand-400">{fmt(c.humanCount)}</td>
                        <td className="px-4 py-3 tabular-nums text-orange-400">{fmt(c.machineCount)}</td>
                        <td className="px-4 py-3 tabular-nums text-red-400">{fmt(c.failedCount)}</td>
                        <td className="px-4 py-3 tabular-nums font-medium">{c.answerRate}%</td>
                        <td className="px-4 py-3 tabular-nums">{c.humanRate}%</td>
                        <td className="px-4 py-3 tabular-nums">{dur(c.avgDuration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DIALER TAB ───────────────────────────────────────── */}
      {activeTab === 'dialer' && (
        <div className="space-y-4">
          {/* Summary */}
          {dialerSummary && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: 'Total Calls', value: fmt(dialerSummary.total), color: 'text-foreground' },
                { label: 'Completed', value: fmt(dialerSummary.completed), color: 'text-green-400' },
                { label: 'Not Connected', value: fmt(dialerSummary.failed), color: 'text-red-400' },
                { label: 'Answer Rate', value: `${dialerSummary.answerRate}%`, color: 'text-brand-400' },
                { label: 'Total Talk Time', value: dur(dialerSummary.totalDuration), color: 'text-purple-400' },
              ].map(s => (
                <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{dialerReport.length} calls in selected range</p>
            {dialerReport.length > 0 && (
              <button
                onClick={() => downloadCsv(dialerReport, `callspsy_dialer_${from}_${to}.csv`, [
                  { key: 'destination', label: 'Number Dialed' },
                  { key: 'callerIdNumber', label: 'Caller ID' },
                  { key: 'sipAccount', label: 'SIP Account' },
                  { key: 'status', label: 'Status' },
                  { key: 'duration', label: 'Duration (s)' },
                  { key: 'notes', label: 'Notes' },
                  { key: 'hangupCause', label: 'Hangup Cause' },
                  { key: 'startedAt', label: 'Started' },
                  { key: 'endedAt', label: 'Ended' },
                ])}
                className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-accent transition-all"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {loadDial ? (
              <div className="p-8 text-center text-muted-foreground">Loading…</div>
            ) : dialerReport.length === 0 ? (
              <div className="p-10 text-center">
                <PhoneOutgoing className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No dialer calls in this period</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr className="bg-muted/20">
                      {['Number', 'Status', 'Duration', 'SIP Account', 'Notes', 'Started', 'Ended'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {dialerReport.map((r: any, i: number) => (
                      <tr key={r.callId ?? i} className="hover:bg-accent/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm">{r.destination}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'text-xs font-semibold',
                            r.status === 'COMPLETED' ? 'text-green-400' :
                            r.status === 'BUSY'      ? 'text-yellow-400' :
                            r.status === 'NO_ANSWER' ? 'text-yellow-400' :
                            r.status === 'FAILED'    ? 'text-red-400'    :
                            'text-muted-foreground',
                          )}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{dur(r.duration ?? 0)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{r.sipAccount}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[140px] truncate">{r.notes || '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {r.startedAt ? new Date(r.startedAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {r.endedAt ? new Date(r.endedAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONTACTS TAB ─────────────────────────────────────── */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{contactReport.length} contact list{contactReport.length !== 1 ? 's' : ''}</p>
            {contactReport.length > 0 && (
              <button
                onClick={() => downloadCsv(contactReport, `callspsy_contacts_report.csv`, [
                  { key: 'name', label: 'List Name' },
                  { key: 'description', label: 'Description' },
                  { key: 'totalCount', label: 'Total Contacts' },
                  { key: 'validCount', label: 'Valid Numbers' },
                  { key: 'createdAt', label: 'Created' },
                ])}
                className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-accent transition-all"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {loadCont ? (
              <div className="p-8 text-center text-muted-foreground">Loading…</div>
            ) : contactReport.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No contact lists yet</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    {['List Name', 'Description', 'Total', 'Valid', 'Invalid', 'Valid Rate', 'Created'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {contactReport.map((l: any) => {
                    const invalid = (l.totalCount ?? 0) - (l.validCount ?? 0)
                    const validRate = l.totalCount > 0 ? ((l.validCount / l.totalCount) * 100).toFixed(1) : '0.0'
                    return (
                      <tr key={l.id} className="hover:bg-accent/20 transition-colors">
                        <td className="px-4 py-3 font-medium">{l.name}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">{l.description || '—'}</td>
                        <td className="px-4 py-3 tabular-nums">{fmt(l.totalCount)}</td>
                        <td className="px-4 py-3 tabular-nums text-green-400">{fmt(l.validCount)}</td>
                        <td className="px-4 py-3 tabular-nums text-red-400">{fmt(invalid)}</td>
                        <td className="px-4 py-3 tabular-nums font-medium">{validRate}%</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(l.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
