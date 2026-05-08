'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Play, Pause, Square, MoreVertical, Megaphone, Search, Filter } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { formatNumber, getStatusColor, timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { CreateCampaignModal } from '@/components/campaigns/CreateCampaignModal'

export default function CampaignsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then(r => r.data),
    refetchInterval: 10000,
  })

  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/start`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign started') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to start'),
  })

  const pauseMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/pause`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign paused') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to pause'),
  })

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/stop`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign stopped') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to stop'),
  })

  const campaigns = data?.data ?? []
  const filtered = campaigns.filter((c: any) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage your voice broadcast campaigns</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" /> New Campaign
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Campaigns list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">No campaigns yet</h3>
          <p className="text-muted-foreground text-sm mb-6">Create your first broadcast campaign</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-6 py-2.5 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90"
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((campaign: any) => (
            <CampaignRow
              key={campaign.id}
              campaign={campaign}
              onStart={() => startMutation.mutate(campaign.id)}
              onPause={() => pauseMutation.mutate(campaign.id)}
              onStop={() => stopMutation.mutate(campaign.id)}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CampaignRow({
  campaign, onStart, onPause, onStop,
}: {
  campaign: any; onStart: () => void; onPause: () => void; onStop: () => void
}) {
  const progress = campaign.totalContacts > 0
    ? Math.min(100, (campaign.processedContacts / campaign.totalContacts) * 100)
    : 0

  const answerRate = campaign.processedContacts > 0
    ? ((campaign.answeredCalls / campaign.processedContacts) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-brand-500/30 transition-all">
      <div className="flex items-start gap-4">
        <div className={cn(
          'flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center',
          campaign.status === 'RUNNING' ? 'bg-green-500/15' : 'bg-muted',
        )}>
          <Megaphone className={cn('h-5 w-5', campaign.status === 'RUNNING' ? 'text-green-400' : 'text-muted-foreground')} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <Link href={`/campaigns/${campaign.id}`} className="font-semibold hover:text-brand-300 transition-colors truncate">
              {campaign.name}
            </Link>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0',
              getStatusColor(campaign.status),
              campaign.status === 'RUNNING' && 'status-running',
            )}>
              {campaign.status}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
            <span>{campaign.contactList?.name}</span>
            <span>•</span>
            <span>{campaign.sipAccount?.name}</span>
            <span>•</span>
            <span>{formatNumber(campaign.processedContacts)}/{formatNumber(campaign.totalContacts)} contacts</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                campaign.status === 'RUNNING' ? 'bg-gradient-to-r from-brand-500 to-green-500' : 'bg-brand-500/50',
              )}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center gap-6">
            {[
              { label: 'Answer Rate', value: `${answerRate}%` },
              { label: 'Human', value: formatNumber(campaign.humanAnswers) },
              { label: 'Voicemail', value: formatNumber(campaign.machineAnswers) },
              { label: 'Failed', value: formatNumber(campaign.failedCalls) },
              { label: 'Active', value: campaign.activeCalls, highlight: campaign.activeCalls > 0 },
            ].map(s => (
              <div key={s.label}>
                <p className={cn('text-sm font-semibold', s.highlight ? 'text-green-400' : 'text-foreground')}>
                  {s.value}
                </p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {campaign.status === 'RUNNING' ? (
            <>
              <button
                onClick={onPause}
                className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 transition-all"
              >
                <Pause className="h-4 w-4" />
              </button>
              <button
                onClick={onStop}
                className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
              >
                <Square className="h-4 w-4" />
              </button>
            </>
          ) : ['DRAFT', 'PAUSED'].includes(campaign.status) ? (
            <button
              onClick={onStart}
              className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all"
            >
              <Play className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
