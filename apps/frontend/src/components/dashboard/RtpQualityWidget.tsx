'use client'

import { useQuery } from '@tanstack/react-query'
import { Signal } from 'lucide-react'
import { api } from '@/lib/api'
import { getMosColor, getMosLabel } from '@/lib/utils'
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'

export function RtpQualityWidget() {
  const { data } = useQuery({
    queryKey: ['analytics', 'rtp'],
    queryFn: () => api.get('/analytics/rtp').then(r => r.data),
    refetchInterval: 30000,
  })

  const mos = data?.avgMos ?? 0
  const mosPercent = Math.min(100, (mos / 5) * 100)

  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-3">
        <Signal className="h-4 w-4 text-brand-400" />
        <h3 className="font-semibold text-sm">RTP Quality</h3>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart innerRadius="65%" outerRadius="100%" data={[{ value: mosPercent }]} startAngle={90} endAngle={-270}>
              <RadialBar dataKey="value" cornerRadius={4} fill={mos >= 4 ? '#22c55e' : mos >= 3.5 ? '#eab308' : '#ef4444'} background={{ fill: 'rgba(255,255,255,0.05)' }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-bold ${getMosColor(mos)}`}>{mos}</span>
          </div>
        </div>

        <div className="space-y-1.5 flex-1">
          <div>
            <p className={`text-sm font-semibold ${getMosColor(mos)}`}>{getMosLabel(mos)}</p>
            <p className="text-xs text-muted-foreground">MOS Score</p>
          </div>
          <div className="space-y-1">
            {[
              { label: 'Excellent', value: data?.excellentCalls ?? 0, color: 'bg-green-400' },
              { label: 'Good', value: data?.goodCalls ?? 0, color: 'bg-yellow-400' },
              { label: 'Poor', value: data?.poorCalls ?? 0, color: 'bg-red-400' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-2 text-xs">
                <div className={`h-1.5 w-1.5 rounded-full ${row.color}`} />
                <span className="text-muted-foreground">{row.label}:</span>
                <span className="font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
