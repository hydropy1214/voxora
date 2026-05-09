'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Wifi, WifiOff, CheckCircle2, Loader2, Trash2, TestTube,
  Phone, ShieldCheck, Info, AlertTriangle, RefreshCw, Lock,
  Globe, Zap, Signal, Edit3,
} from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  REGISTERED:   'text-green-400 bg-green-500/10 border-green-500/20',
  UNREGISTERED: 'text-muted-foreground bg-muted/30 border-border',
  REGISTERING:  'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  FAILED:       'text-red-400 bg-red-500/10 border-red-500/20',
  ESL_DISCONNECTED: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'text-muted-foreground bg-muted/30 border-border'
  const Icon = status === 'REGISTERED' ? Wifi : status === 'REGISTERING' ? Loader2 : WifiOff
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border', cls)}>
      <Icon className={cn('h-3 w-3', status === 'REGISTERING' && 'animate-spin')} />
      {status === 'ESL_DISCONNECTED' ? 'Awaiting FreeSWITCH' : status}
    </span>
  )
}

// ── Known provider presets ───────────────────────────────────────
const PROVIDER_PRESETS: Record<string, { transport: string; port: number; name?: string }> = {
  'vonedge.com':   { transport: 'TLS', port: 5061, name: 'Vonage Edge' },
  'vonage.com':    { transport: 'TLS', port: 5061, name: 'Vonage' },
  'twilio.com':    { transport: 'TCP', port: 5060, name: 'Twilio' },
  'telnyx.com':    { transport: 'TLS', port: 5061, name: 'Telnyx' },
  'signalwire.com':{ transport: 'TLS', port: 5061, name: 'SignalWire' },
  'bulkvs.com':    { transport: 'UDP', port: 5060, name: 'BulkVS' },
  'voip.ms':       { transport: 'UDP', port: 5060, name: 'VoIP.ms' },
}

function detectProvider(host: string): { transport: string; port: number; label: string } | null {
  for (const [domain, preset] of Object.entries(PROVIDER_PRESETS)) {
    if (host.toLowerCase().includes(domain)) {
      return { ...preset, label: preset.name ?? domain }
    }
  }
  return null
}

// ── Add/Edit SIP Account Form ────────────────────────────────────
function SipAccountForm({ initial, onSave, onCancel }: {
  initial?: any; onSave: (d: any) => void; onCancel: () => void
}) {
  const [form, setForm] = useState({
    name:              initial?.name              ?? '',
    sipServer:         initial?.sipServer         ?? '',
    sipPort:           initial?.sipPort           ?? 5060,
    username:          initial?.username          ?? '',
    password:          '',
    transport:         initial?.transport         ?? 'UDP',
    callerIdName:      initial?.callerIdName      ?? 'Voxora',
    callerIdNumber:    initial?.callerIdNumber    ?? '',
    maxConcurrentCalls: initial?.maxConcurrentCalls ?? 10,
    callsPerSecond:    initial?.callsPerSecond    ?? 1,
    proxy:             initial?.proxy             ?? '',
    fromDomain:        initial?.fromDomain        ?? '',
  })
  const [showPass, setShowPass] = useState(false)
  const [detectedProvider, setDetectedProvider] = useState<string | null>(null)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value }))

  const inputCls = "w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-muted-foreground"
  const labelCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide"

  // Auto-detect provider from hostname
  const handleSipServer = (e: React.ChangeEvent<HTMLInputElement>) => {
    const host = e.target.value
    setForm(f => ({ ...f, sipServer: host }))
    const preset = detectProvider(host)
    if (preset) {
      setDetectedProvider(preset.label)
      setForm(f => ({ ...f, transport: preset.transport, sipPort: preset.port }))
    } else {
      setDetectedProvider(null)
    }
  }

  // Auto-set port when transport changes
  const handleTransport = (t: string) => {
    const defaultPort = t === 'TLS' ? 5061 : 5060
    setForm(f => ({ ...f, transport: t, sipPort: f.sipPort === 5060 || f.sipPort === 5061 ? defaultPort : f.sipPort }))
  }

  return (
    <div className="space-y-5">
      {/* Name */}
      <div className="space-y-1.5">
        <label className={labelCls}>Account Name *</label>
        <input value={form.name} onChange={set('name')} placeholder="e.g. Vonage Primary, Twilio US"
          className={inputCls} />
        <p className="text-xs text-muted-foreground">A friendly label to identify this SIP account</p>
      </div>

      {/* Server + Transport */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <label className={labelCls}>SIP Server / Host *</label>
          <input value={form.sipServer} onChange={handleSipServer}
            placeholder="e.g. edge3-tlssbc2va.prod.vonedge.com"
            className={inputCls} />
          {detectedProvider && (
            <div className="flex items-center gap-1.5 text-xs text-brand-400">
              <CheckCircle2 className="h-3 w-3" />
              Auto-configured for {detectedProvider} (transport + port set automatically)
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Port</label>
          <input type="number" value={form.sipPort} onChange={set('sipPort')}
            min={1} max={65535} className={inputCls} />
        </div>
      </div>

      {/* Transport */}
      <div className="space-y-1.5">
        <label className={labelCls}>Transport Protocol *</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'UDP', icon: Globe,       desc: 'Standard, most compatible' },
            { value: 'TCP', icon: Signal,      desc: 'More reliable than UDP' },
            { value: 'TLS', icon: ShieldCheck, desc: 'Encrypted (Vonage, SRTP)' },
          ].map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleTransport(t.value)}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all',
                form.transport === t.value
                  ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                  : 'border-border text-muted-foreground hover:border-brand-500/40',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.value}
              <span className="text-[10px] font-normal text-center opacity-70">{t.desc}</span>
            </button>
          ))}
        </div>
        {form.transport === 'TLS' && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
            <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            TLS encrypts SIP signalling. Vonage Edge, Telnyx, and SignalWire use port 5061 with TLS + SRTP. Both are automatically enabled by Voxora.
          </div>
        )}
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>SIP Username *</label>
          <input value={form.username} onChange={set('username')}
            placeholder="your_sip_username" autoComplete="new-password"
            className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Password *</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              placeholder={initial ? '(leave blank to keep)' : 'SIP password'}
              autoComplete="new-password"
              className={cn(inputCls, 'pr-10')}
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <Lock className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Caller ID */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>Caller ID Name</label>
          <input value={form.callerIdName} onChange={set('callerIdName')}
            placeholder="Voxora" className={inputCls} />
          <p className="text-xs text-muted-foreground">Shown to call recipient (if allowed by provider)</p>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Caller ID Number</label>
          <input value={form.callerIdNumber} onChange={set('callerIdNumber')}
            placeholder="+12025550000" className={inputCls} />
          <p className="text-xs text-muted-foreground">DID number from your SIP provider</p>
        </div>
      </div>

      {/* Limits */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>Max Concurrent Calls</label>
          <input type="number" value={form.maxConcurrentCalls} onChange={set('maxConcurrentCalls')}
            min={1} max={1000} className={inputCls} />
          <p className="text-xs text-muted-foreground">Based on your provider plan limits</p>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Calls Per Second (CPS)</label>
          <input type="number" value={form.callsPerSecond} onChange={set('callsPerSecond')}
            min={0.1} max={50} step={0.5} className={inputCls} />
          <p className="text-xs text-muted-foreground">Rate limit for dialing (typically 1–5)</p>
        </div>
      </div>

      {/* Advanced */}
      <details className="group">
        <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1.5">
          <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
          Advanced options (proxy, domain override)
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Outbound Proxy</label>
            <input value={form.proxy} onChange={set('proxy')}
              placeholder="proxy.provider.com:5060 (optional)"
              className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>From Domain</label>
            <input value={form.fromDomain} onChange={set('fromDomain')}
              placeholder="provider.com (optional)" className={inputCls} />
          </div>
        </div>
      </details>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={!form.name || !form.sipServer || !form.username || (!form.password && !initial)}
          className="flex-1 py-2.5 gradient-brand rounded-lg text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-all"
        >
          {initial ? 'Save Changes' : 'Add SIP Account'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2.5 border border-border rounded-lg text-sm hover:bg-accent transition-all">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Account card ────────────────────────────────────────────────
function SipAccountCard({ account, onTest, onDelete, testing, onEdit }: {
  account: any; onTest: () => void; onDelete: () => void; testing: boolean; onEdit: () => void
}) {
  const isRegistered = account.status === 'REGISTERED'

  return (
    <div className={cn(
      'bg-card border rounded-2xl p-5 transition-all',
      isRegistered ? 'border-green-500/30' : 'border-border',
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-11 w-11 rounded-xl flex items-center justify-center',
            isRegistered ? 'bg-green-500/15' : 'bg-muted/30',
          )}>
            {isRegistered
              ? <Wifi className="h-5 w-5 text-green-400" />
              : <WifiOff className="h-5 w-5 text-muted-foreground" />
            }
          </div>
          <div>
            <h3 className="font-semibold text-sm">{account.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {account.sipServer}:{account.sipPort}
            </p>
          </div>
        </div>
        <StatusBadge status={account.status} />
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
        {[
          { label: 'Username',    value: account.username,                     mono: true },
          { label: 'Transport',   value: account.transport,                    mono: false },
          { label: 'Caller ID #', value: account.callerIdNumber || '—',        mono: true },
          { label: 'Caller Name', value: account.callerIdName   || '—',        mono: false },
          { label: 'Max Concurrent', value: `${account.maxConcurrentCalls} calls`, mono: false },
          { label: 'CPS',         value: `${account.callsPerSecond}/s`,         mono: false },
        ].map(r => (
          <div key={r.label} className="flex justify-between gap-2 py-1 border-b border-border/30">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={cn('font-medium truncate max-w-[120px]', r.mono && 'font-mono text-[11px]')}>
              {r.value}
            </span>
          </div>
        ))}
      </div>

      {/* Error message */}
      {account.lastError && account.lastError !== 'ESL_DISCONNECTED' && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-400 flex-1">{account.lastError}</p>
        </div>
      )}

      {/* ESL hint */}
      {(account.status === 'ESL_DISCONNECTED' || (account.status === 'UNREGISTERED' && !account.lastError)) ? (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 bg-muted/30 border border-border rounded-lg">
          <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Registration activates when FreeSWITCH is running. Start all services with <code className="font-mono">docker compose up -d</code> then click &ldquo;Test Registration&rdquo;.
          </p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTest}
          disabled={testing}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border hover:bg-accent text-xs font-medium transition-all disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
          Test Registration
        </button>
        <button
          onClick={onEdit}
          className="p-2 rounded-lg border border-border hover:bg-accent hover:text-foreground transition-all text-muted-foreground"
          title="Edit account"
        >
          <Edit3 className="h-4 w-4" />
        </button>
        <button
          onClick={() => { if (confirm(`Delete "${account.name}"?`)) onDelete() }}
          className="p-2 rounded-lg border border-border hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all text-muted-foreground"
          title="Delete account"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────
export default function SipAccountsPage() {
  const [showForm, setShowForm]   = useState(false)
  const [editAccount, setEdit]    = useState<any>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: rawAccounts, isLoading, refetch } = useQuery({
    queryKey: ['sip-accounts'],
    queryFn: () => api.get('/sip-accounts').then(r => {
      const d = r.data
      return Array.isArray(d) ? d : d?.data ?? []
    }),
    refetchInterval: 20000,
  })
  const accounts = rawAccounts ?? []

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/sip-accounts', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sip-accounts'] })
      setShowForm(false)
      toast.success('SIP account added — registration will begin shortly. Click "Test Registration" to verify.')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to add account'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/sip-accounts/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sip-accounts'] })
      setEdit(null)
      toast.success('SIP account updated')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/sip-accounts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sip-accounts'] }); toast.success('SIP account removed') },
  })

  const testMut = useMutation({
    mutationFn: (id: string) => api.post(`/sip-accounts/${id}/test`).then(r => r.data),
    onSuccess: (data, id) => {
      setTestingId(null)
      qc.invalidateQueries({ queryKey: ['sip-accounts'] })
      if (data.success) {
        toast.success(`Registration test passed — status: ${data.status}`)
      } else {
        toast.warning(`Test completed — status: ${data.status}. ${data.detail || ''}`)
      }
    },
    onError: (e: any, id) => {
      setTestingId(null)
      toast.error(e.response?.data?.message || 'Test failed')
    },
  })

  const handleTest = (id: string) => { setTestingId(id); testMut.mutate(id) }
  const handleSave = (data: any) => {
    if (!data.password) delete data.password
    editAccount
      ? updateMut.mutate({ id: editAccount.id, data })
      : createMut.mutate(data)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">SIP Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect your SIP providers. Calls go through these accounts — add as many as you need.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setEdit(null); setShowForm(!showForm) }}
            className="flex items-center gap-2 px-4 py-2 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Add SIP Account
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Globe,       title: 'Any Provider',  desc: 'Vonage Edge, Twilio, Telnyx, BulkVS, VoIP.ms — any SIP provider works' },
          { icon: ShieldCheck, title: 'TLS + SRTP',    desc: 'SIP-TLS and SRTP media encryption for Vonage Edge and other secure trunks' },
          { icon: Zap,         title: 'High Volume',   desc: 'Set CPS and concurrency limits to match your provider plan capacity' },
        ].map(b => (
          <div key={b.title} className="flex items-start gap-3 p-3 bg-card border border-border rounded-xl">
            <div className="p-1.5 bg-brand-500/10 rounded-lg flex-shrink-0">
              <b.icon className="h-4 w-4 text-brand-400" />
            </div>
            <div>
              <p className="text-xs font-semibold">{b.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit form */}
      {(showForm || editAccount) && (
        <div className="bg-card border border-brand-500/30 rounded-2xl p-6">
          <h2 className="font-semibold mb-5">
            {editAccount ? `Edit — ${editAccount.name}` : 'Add New SIP Account'}
          </h2>
          <SipAccountForm
            initial={editAccount}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEdit(null) }}
          />
        </div>
      )}

      {/* Accounts grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-52 bg-card border border-border rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-14 text-center">
          <div className="h-16 w-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
            <Phone className="h-8 w-8 text-brand-400" />
          </div>
          <h3 className="font-semibold text-lg mb-2">No SIP accounts yet</h3>
          <p className="text-muted-foreground text-sm mb-2 max-w-sm mx-auto">
            Add your SIP provider credentials to start making calls. Voxora connects directly via SIP — no third-party telecom API needed.
          </p>
          <p className="text-xs text-muted-foreground/60 mb-6">
            You&apos;ll need: server hostname, username, and password from your SIP provider. Works with Vonage Edge, Twilio, Telnyx, BulkVS, and more.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-2.5 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90"
          >
            Add First SIP Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc: any) => (
            <SipAccountCard
              key={acc.id}
              account={acc}
              onTest={() => handleTest(acc.id)}
              onDelete={() => deleteMut.mutate(acc.id)}
              onEdit={() => { setEdit(acc); setShowForm(false) }}
              testing={testingId === acc.id && testMut.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}
