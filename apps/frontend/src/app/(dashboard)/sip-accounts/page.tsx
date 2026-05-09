'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Wifi, WifiOff, CheckCircle2, Loader2, Trash2, Settings, TestTube } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { getStatusColor, timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { AddSipAccountModal } from '@/components/sip-accounts/AddSipAccountModal'

export default function SipAccountsPage() {
  const [showAdd, setShowAdd] = useState(false)
  const qc = useQueryClient()

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['sip-accounts'],
    queryFn: () => api.get('/sip-accounts').then(r => r.data),
    refetchInterval: 30000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sip-accounts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sip-accounts'] }); toast.success('SIP account removed') },
    onError: () => toast.error('Failed to remove account'),
  })

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/sip-accounts/${id}/test`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['sip-accounts'] })
      toast.success('SIP connection test completed')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Test failed'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SIP Accounts</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Connect your SIP providers for outbound calling</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add SIP Account
        </button>
      </div>

      {/* Info card */}
      <div className="p-4 bg-brand-500/10 border border-brand-500/20 rounded-xl text-sm text-brand-200">
        <p className="font-medium mb-1">Direct SIP Protocol</p>
        <p className="text-brand-300/80 text-xs">
          Connect any SIP provider (UDP, TCP, TLS). CallsPsy uses direct SIP via FreeSWITCH — no third-party APIs required.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-48 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-20">
          <Wifi className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">No SIP accounts</h3>
          <p className="text-muted-foreground text-sm mb-6">Add your first SIP provider account</p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-6 py-2.5 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90"
          >
            Add SIP Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc: any) => (
            <SipAccountCard
              key={acc.id}
              account={acc}
              onTest={() => testMutation.mutate(acc.id)}
              onDelete={() => deleteMutation.mutate(acc.id)}
              testing={testMutation.isPending}
            />
          ))}
        </div>
      )}

      {showAdd && <AddSipAccountModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function SipAccountCard({ account, onTest, onDelete, testing }: {
  account: any; onTest: () => void; onDelete: () => void; testing: boolean
}) {
  const isRegistered = account.status === 'REGISTERED'

  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-brand-500/30 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-10 w-10 rounded-xl flex items-center justify-center',
            isRegistered ? 'bg-green-500/15' : 'bg-muted',
          )}>
            {isRegistered ? (
              <Wifi className="h-5 w-5 text-green-400" />
            ) : (
              <WifiOff className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <h3 className="font-semibold">{account.name}</h3>
            <p className="text-xs text-muted-foreground">{account.sipServer}:{account.sipPort}</p>
          </div>
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', getStatusColor(account.status))}>
          {account.status}
        </span>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground mb-4">
        <div className="flex justify-between">
          <span>Username</span>
          <span className="font-mono text-foreground">{account.username}</span>
        </div>
        <div className="flex justify-between">
          <span>Transport</span>
          <span className="font-medium text-foreground">{account.transport}</span>
        </div>
        <div className="flex justify-between">
          <span>Max Concurrent</span>
          <span className="font-medium text-foreground">{account.maxConcurrentCalls} calls</span>
        </div>
        <div className="flex justify-between">
          <span>CPS</span>
          <span className="font-medium text-foreground">{account.callsPerSecond}/s</span>
        </div>
        {account.lastCheckedAt && (
          <div className="flex justify-between">
            <span>Last Checked</span>
            <span>{timeAgo(account.lastCheckedAt)}</span>
          </div>
        )}
      </div>

      {account.lastError && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{account.lastError}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onTest}
          disabled={testing}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-border hover:bg-accent text-xs font-medium transition-all disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
          Test Connection
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg border border-border hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
