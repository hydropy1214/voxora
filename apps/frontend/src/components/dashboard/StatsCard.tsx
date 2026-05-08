'use client'

import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  subtitle?: string
  trend?: 'up' | 'down'
  trendValue?: string
  color?: 'brand' | 'blue' | 'green' | 'purple' | 'yellow' | 'red'
  live?: boolean
  compact?: boolean
}

const colorMap = {
  brand: 'bg-brand-500/15 text-brand-400 border-brand-500/20',
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  green: 'bg-green-500/15 text-green-400 border-green-500/20',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  red: 'bg-red-500/15 text-red-400 border-red-500/20',
}

export function StatsCard({
  title, value, icon: Icon, subtitle, trend, trendValue,
  color = 'brand', live, compact,
}: StatsCardProps) {
  return (
    <div className={cn(
      'stat-card',
      compact ? 'p-4' : 'p-6',
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn('text-muted-foreground font-medium', compact ? 'text-xs' : 'text-sm')}>{title}</p>
            {live && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-green-400">
                <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-green-400 opacity-75" />
              </span>
            )}
          </div>
          <p className={cn('font-bold tabular-nums', compact ? 'text-xl' : 'text-3xl')}>{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && trendValue && (
            <div className={cn(
              'inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full',
              trend === 'up' ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10',
            )}>
              {trend === 'up' ? '↑' : '↓'} {trendValue}
            </div>
          )}
        </div>

        <div className={cn(
          'rounded-xl border flex items-center justify-center flex-shrink-0',
          compact ? 'p-2.5' : 'p-3',
          colorMap[color],
        )}>
          <Icon className={cn(compact ? 'h-4 w-4' : 'h-5 w-5')} />
        </div>
      </div>
    </div>
  )
}
