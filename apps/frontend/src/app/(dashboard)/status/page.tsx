'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ServiceStatus {
  id: string
  name: string
  description: string
  status: 'operational' | 'degraded' | 'outage'
}

interface PublicStatus {
  status: 'operational' | 'partial_outage' | 'major_outage'
  statusLabel: string
  services: ServiceStatus[]
  updatedAt: string
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'operational') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
        <span className="h-2 w-2 rounded-full bg-green-400" />
        Operational
      </span>
    )
  }
  if (status === 'degraded') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-yellow-400">
        <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
        Degraded
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
      <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
      Outage
    </span>
  )
}

const INCIDENTS: { date: string; title: string; resolved: boolean }[] = []

export default function StatusPage() {
  const { data, isLoading, refetch, isFetching } = useQuery<PublicStatus>({
    queryKey: ['system', 'public-status'],
    queryFn: () => api.get('/system/public-status').then(r => r.data),
    refetchInterval: 30000,
    retry: 2,
  })

  const overallColor =
    data?.status === 'operational'
      ? 'border-green-500/30 bg-green-500/5 text-green-300'
      : data?.status === 'partial_outage'
      ? 'border-yellow-500/30 bg-yellow-500/5 text-yellow-300'
      : 'border-red-500/30 bg-red-500/5 text-red-300'

  const OverallIcon =
    data?.status === 'operational'
      ? CheckCircle2
      : data?.status === 'partial_outage'
      ? AlertTriangle
      : XCircle

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">System Status</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live status of all Voxora services
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-accent text-sm transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Overall Banner */}
      {isLoading ? (
        <div className="h-20 bg-card border border-border rounded-2xl animate-pulse" />
      ) : (
        <div className={cn('flex items-center gap-4 px-6 py-5 rounded-2xl border', overallColor)}>
          <OverallIcon className="h-8 w-8 flex-shrink-0" />
          <div>
            <p className="text-lg font-bold">{data?.statusLabel ?? 'Checking...'}</p>
            <p className="text-sm opacity-70 mt-0.5">
              Last checked {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Services */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Services</h2>
        </div>
        {isLoading ? (
          <div className="divide-y divide-border/50">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center justify-between">
                <div className="h-4 w-40 bg-muted rounded animate-pulse" />
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {(data?.services ?? []).map(svc => (
              <div key={svc.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{svc.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
                </div>
                <StatusBadge status={svc.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incident History */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Incident History</h2>
        </div>
        {INCIDENTS.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-3 opacity-60" />
            <p className="text-sm font-medium">No incidents in the past 90 days</p>
            <p className="text-xs text-muted-foreground mt-1">
              All systems have been operating normally.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {INCIDENTS.map((inc, i) => (
              <div key={i} className="px-5 py-4 flex items-start gap-3">
                {inc.resolved
                  ? <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                  : <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                }
                <div>
                  <p className="text-sm font-medium">{inc.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{inc.date}</p>
                    {inc.resolved && (
                      <span className="text-xs text-green-400 font-medium">Resolved</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subscribe notice */}
      <p className="text-center text-xs text-muted-foreground">
        For urgent issues, contact{' '}
        <a href="mailto:support@voxora.io" className="text-brand-400 hover:text-brand-300">
          support@voxora.io
        </a>
      </p>
    </div>
  )
}
