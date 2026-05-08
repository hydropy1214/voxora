'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'

interface CallsChartProps {
  data: Array<{
    date: string
    total: number
    answered: number
    human: number
    machine: number
    failed: number
  }>
  loading?: boolean
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-xl">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        {label ? format(parseISO(label), 'MMM d, yyyy') : ''}
      </p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground capitalize">{entry.name}:</span>
          <span className="font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export function CallsChart({ data, loading }: CallsChartProps) {
  if (loading) {
    return (
      <div className="stat-card h-72 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-6" />
        <div className="h-52 bg-muted rounded" />
      </div>
    )
  }

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold">Call Volume</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Last 14 days</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="humanGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="machineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tickFormatter={v => format(parseISO(v), 'MMM d')}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fill="url(#totalGrad)" name="total" />
          <Area type="monotone" dataKey="human" stroke="#22c55e" strokeWidth={1.5} fill="url(#humanGrad)" name="human" />
          <Area type="monotone" dataKey="machine" stroke="#f97316" strokeWidth={1.5} fill="url(#machineGrad)" name="machine" />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-3">
        {[
          { color: '#6366f1', label: 'Total' },
          { color: '#22c55e', label: 'Human' },
          { color: '#f97316', label: 'Voicemail' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  )
}
