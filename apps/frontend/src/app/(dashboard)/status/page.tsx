'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw,
  Database, Server, Wifi, Radio, Shield, Globe, Lock,
  Terminal, Activity, Cpu, Network, Info, ChevronDown, ChevronRight,
  HardDrive, Zap, Phone, Layers,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServiceStatus {
  name: string; label: string; status: 'ok' | 'error' | 'warning' | 'unknown';
  message: string; detail?: string; latencyMs?: number; required: boolean;
}
interface PortStatus {
  port: number; protocol: string; service: string; description: string; status: 'open' | 'closed' | 'unknown';
}
interface EnvStatus {
  key: string; label: string; configured: boolean; value?: string; required: boolean; description: string;
}
interface SystemStatus {
  timestamp: string; overallStatus: 'healthy' | 'degraded' | 'critical';
  version: string; uptime: number; environment: string;
  publicIp: string; privateIp: string;
  services: ServiceStatus[]; ports: PortStatus[]; environment_vars: EnvStatus[];
  database: { connected: boolean; latencyMs: number; stats: Record<string, number> };
  telephony: { freeswitchConnected: boolean; activeCalls: number; sofiaStatus: string };
  summary: { totalServices: number; healthyServices: number; warnings: number; errors: number };
}

// ─── Status indicator component ──────────────────────────────────────────────
function StatusDot({ status }: { status: 'ok' | 'error' | 'warning' | 'unknown' }) {
  return (
    <span className={cn(
      'flex h-2.5 w-2.5 rounded-full flex-shrink-0',
      status === 'ok'      && 'bg-green-400',
      status === 'warning' && 'bg-yellow-400',
      status === 'error'   && 'bg-red-400',
      status === 'unknown' && 'bg-gray-500',
    )} />
  )
}

function StatusIcon({ status, size = 'sm' }: { status: 'ok' | 'error' | 'warning' | 'unknown'; size?: 'sm' | 'md' | 'lg' }) {
  const cls = cn(
    size === 'sm'  && 'h-4 w-4',
    size === 'md'  && 'h-5 w-5',
    size === 'lg'  && 'h-7 w-7',
  )
  if (status === 'ok')      return <CheckCircle2 className={cn(cls, 'text-green-400')} />
  if (status === 'warning') return <AlertTriangle className={cn(cls, 'text-yellow-400')} />
  if (status === 'error')   return <XCircle className={cn(cls, 'text-red-400')} />
  return <Clock className={cn(cls, 'text-gray-500')} />
}

function statusBadge(status: 'ok' | 'error' | 'warning' | 'unknown') {
  const map = {
    ok:      'text-green-400  bg-green-400/10  border-green-400/20',
    warning: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    error:   'text-red-400    bg-red-400/10    border-red-400/20',
    unknown: 'text-gray-400   bg-gray-400/10   border-gray-400/20',
  }
  const labels = { ok: 'Healthy', warning: 'Warning', error: 'Error', unknown: 'Unknown' }
  return (
    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', map[status])}>
      {labels[status]}
    </span>
  )
}

function overallBadge(status: 'healthy' | 'degraded' | 'critical') {
  const map = {
    healthy:  { cls: 'bg-green-500/15 border-green-500 text-green-300',  label: '✓ All Systems Operational',    dot: 'bg-green-400 animate-pulse' },
    degraded: { cls: 'bg-yellow-500/15 border-yellow-500 text-yellow-300', label: '⚠ Partially Degraded',       dot: 'bg-yellow-400 animate-pulse' },
    critical: { cls: 'bg-red-500/15 border-red-500 text-red-300',         label: '✗ System Outage Detected',    dot: 'bg-red-400 animate-pulse' },
  }
  const { cls, label, dot } = map[status]
  return (
    <div className={cn('flex items-center gap-3 px-5 py-3 rounded-xl border text-sm font-semibold', cls)}>
      <span className={cn('h-2.5 w-2.5 rounded-full', dot)} />
      {label}
    </div>
  )
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ─── SERVICE EXPLANATIONS ─────────────────────────────────────────────────────
const SERVICE_DOCS: Record<string, { icon: any; what: string; role: string; install: string }> = {
  postgres: {
    icon: Database,
    what: 'PostgreSQL 16',
    role: 'Stores all application data — users, campaigns, call logs, SIP accounts, contacts.',
    install: 'Runs as Docker container postgres:16-alpine. No local install required.',
  },
  redis: {
    icon: Zap,
    what: 'Redis 7',
    role: 'Powers real-time features: BullMQ job queues (campaign workers), caching, WebSocket pub/sub.',
    install: 'Runs as Docker container redis:7-alpine. No local install required.',
  },
  freeswitch: {
    icon: Phone,
    what: 'FreeSWITCH v1.10',
    role: 'SIP media server — places outbound calls, plays audio files, detects AMD (human vs voicemail), connects to your SIP providers via ESL API.',
    install: 'Runs as Docker container signalwire/freeswitch:v1.10. Auto-built with CallsPsy Lua scripts. No manual install.',
  },
  kamailio: {
    icon: Network,
    what: 'Kamailio 5.7',
    role: 'SIP proxy on port 5060 — routes outbound calls from FreeSWITCH to your SIP providers, handles load balancing, integrates with RTPengine.',
    install: 'Runs as Docker container kamailio/kamailio:5.7-debian. No manual install.',
  },
  rtpengine: {
    icon: Radio,
    what: 'RTPengine',
    role: 'RTP media relay — ensures media packets reach both sides when behind NAT/AWS. Uses public IP for SDP negotiation.',
    install: 'Runs as Docker container drachtio/rtpengine. Uses host networking for media relay. No manual install.',
  },
  coturn: {
    icon: Shield,
    what: 'Coturn 4.6',
    role: 'STUN/TURN server on port 3478 — assists with NAT traversal for WebRTC clients (optional for SIP).',
    install: 'Runs as Docker container coturn/coturn:4.6-alpine. No manual install.',
  },
  nginx: {
    icon: Globe,
    what: 'Nginx 1.25',
    role: 'Reverse proxy — routes /api/* to backend, / to frontend, /socket.io/* to WebSocket. Optionally handles SSL termination.',
    install: 'Runs as Docker container nginx:1.25-alpine. No manual install.',
  },
}

// ─── Section component ────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-accent/30 transition-colors"
      >
        <Icon className="h-5 w-5 text-brand-400 flex-shrink-0" />
        <span className="font-semibold text-base flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/60">{children}</div>}
    </div>
  )
}

// ─── SERVICE ROW ─────────────────────────────────────────────────────────────
function ServiceRow({ service }: { service: ServiceStatus }) {
  const [expanded, setExpanded] = useState(false)
  const doc = SERVICE_DOCS[service.name]
  const DocIcon = doc?.icon || Server

  return (
    <div className={cn(
      'rounded-xl border transition-all',
      service.status === 'ok'      && 'border-green-500/20  bg-green-500/5',
      service.status === 'warning' && 'border-yellow-500/20 bg-yellow-500/5',
      service.status === 'error'   && 'border-red-500/20    bg-red-500/5',
      service.status === 'unknown' && 'border-border        bg-muted/20',
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className={cn(
          'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
          service.status === 'ok'      && 'bg-green-500/15',
          service.status === 'warning' && 'bg-yellow-500/15',
          service.status === 'error'   && 'bg-red-500/15',
          service.status === 'unknown' && 'bg-muted',
        )}>
          <DocIcon className={cn(
            'h-5 w-5',
            service.status === 'ok'      && 'text-green-400',
            service.status === 'warning' && 'text-yellow-400',
            service.status === 'error'   && 'text-red-400',
            service.status === 'unknown' && 'text-muted-foreground',
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{service.label}</span>
            {statusBadge(service.status)}
            {!service.required && (
              <span className="text-xs text-muted-foreground border border-border px-1.5 py-0.5 rounded">optional</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{service.message}</p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {service.latencyMs !== undefined && (
            <span className={cn('text-xs tabular-nums', service.latencyMs < 100 ? 'text-green-400' : service.latencyMs < 500 ? 'text-yellow-400' : 'text-red-400')}>
              {service.latencyMs}ms
            </span>
          )}
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && doc && (
        <div className="px-4 pb-4 pt-0 border-t border-border/40 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div className="bg-background/60 rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">SOFTWARE</p>
              <p className="text-sm font-medium">{doc.what}</p>
            </div>
            <div className="bg-background/60 rounded-lg p-3 md:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1">WHAT IT DOES</p>
              <p className="text-sm text-muted-foreground">{doc.role}</p>
            </div>
          </div>
          <div className="bg-background/60 rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">HOW IT&apos;S INSTALLED</p>
            <p className="text-sm text-muted-foreground">{doc.install}</p>
          </div>
          {service.detail && (
            <div className={cn(
              'flex items-start gap-2 p-3 rounded-lg text-xs',
              service.status === 'warning' ? 'bg-yellow-500/10 text-yellow-300' : 'bg-muted text-muted-foreground',
            )}>
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              {service.detail}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MAIN STATUS PAGE ─────────────────────────────────────────────────────────
export default function StatusPage() {
  const { data: status, isLoading, refetch, isFetching } = useQuery<SystemStatus>({
    queryKey: ['system', 'status'],
    queryFn: () => api.get('/system/status').then(r => r.data),
    refetchInterval: 30000,
    retry: 2,
  })

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">System Status</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time health of every CallsPsy service — click any service to see what it does and how it&apos;s installed.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-accent text-sm transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !status ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <XCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <p className="font-semibold">Cannot reach API</p>
          <p className="text-muted-foreground text-sm mt-1">Make sure the backend is running on port 3001</p>
        </div>
      ) : (
        <>
          {/* Overall Status Banner */}
          <div className="flex items-center justify-between flex-wrap gap-4 p-5 bg-card border border-border rounded-xl">
            {overallBadge(status.overallStatus)}
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div>
                <p className="text-muted-foreground text-xs">Version</p>
                <p className="font-semibold">v{status.version}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Uptime</p>
                <p className="font-semibold">{formatUptime(status.uptime)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Environment</p>
                <p className="font-semibold capitalize">{status.environment}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Public IP</p>
                <p className="font-mono text-sm font-semibold">{status.publicIp}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Private IP</p>
                <p className="font-mono text-sm font-semibold">{status.privateIp}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Last Checked</p>
                <p className="font-semibold">{new Date(status.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          </div>

          {/* Summary counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Services',   value: status.summary.totalServices,   color: 'text-foreground',    bg: 'bg-muted/30' },
              { label: 'Healthy',          value: status.summary.healthyServices, color: 'text-green-400',     bg: 'bg-green-500/10' },
              { label: 'Warnings',         value: status.summary.warnings,        color: 'text-yellow-400',    bg: 'bg-yellow-500/10' },
              { label: 'Errors',           value: status.summary.errors,          color: 'text-red-400',       bg: 'bg-red-500/10' },
            ].map(c => (
              <div key={c.label} className={cn('rounded-xl p-4 text-center border border-border', c.bg)}>
                <p className={cn('text-3xl font-bold tabular-nums', c.color)}>{c.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Architecture explainer */}
          <Section title="How CallsPsy Works — Architecture Overview" icon={Layers}>
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                CallsPsy is a <strong className="text-foreground">fully self-contained SaaS platform</strong> deployed via Docker Compose.
                Every component runs as a Docker container — <strong className="text-foreground">no manual software installation is required</strong> on your server.
                Just run <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">sudo ./setup.sh</code> and everything is downloaded, configured, and started automatically.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    step: '1', title: 'Web Layer',
                    desc: 'Users access CallsPsy through Nginx (port 80/443), which routes to the Next.js frontend (port 3000) and NestJS API (port 3001). Real-time updates flow via Socket.io WebSocket.',
                    services: ['Nginx', 'Next.js', 'NestJS API'],
                  },
                  {
                    step: '2', title: 'Data Layer',
                    desc: 'PostgreSQL stores all data. Redis powers BullMQ campaign job queues and real-time pub/sub. Uploads (audio files, recordings) are stored on disk.',
                    services: ['PostgreSQL', 'Redis', 'File Storage'],
                  },
                  {
                    step: '3', title: 'SIP Signaling',
                    desc: 'FreeSWITCH (port 5080) is the SIP media server — it connects to your SIP providers via registered gateways. Kamailio (port 5060) acts as an outbound SIP proxy with load balancing.',
                    services: ['FreeSWITCH', 'Kamailio'],
                  },
                  {
                    step: '4', title: 'Media Relay + NAT',
                    desc: 'RTPengine relays RTP audio packets through your public IP so your SIP provider can reach media behind AWS NAT. Coturn provides STUN/TURN for WebRTC clients.',
                    services: ['RTPengine', 'Coturn'],
                  },
                ].map(item => (
                  <div key={item.step} className="bg-muted/30 rounded-xl p-4 border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {item.step}
                      </div>
                      <span className="font-semibold text-sm">{item.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">{item.desc}</p>
                    <div className="flex flex-wrap gap-1">
                      {item.services.map(s => (
                        <span key={s} className="text-xs px-2 py-0.5 bg-brand-500/10 border border-brand-500/20 text-brand-300 rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Call flow diagram */}
              <div className="bg-muted/20 border border-border rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3">OUTBOUND CALL FLOW</p>
                <div className="flex items-center gap-2 flex-wrap text-xs overflow-x-auto">
                  {[
                    { label: 'Campaign Start', icon: '▶', color: 'bg-brand-500/20 text-brand-300' },
                    { label: '→' },
                    { label: 'BullMQ Worker', icon: '⚙', color: 'bg-blue-500/20 text-blue-300' },
                    { label: '→' },
                    { label: 'FreeSWITCH ESL', icon: '📞', color: 'bg-green-500/20 text-green-300' },
                    { label: '→' },
                    { label: 'Kamailio SIP', icon: '🔀', color: 'bg-yellow-500/20 text-yellow-300' },
                    { label: '→' },
                    { label: 'SIP Provider', icon: '🌐', color: 'bg-purple-500/20 text-purple-300' },
                    { label: '→' },
                    { label: 'AMD Detection', icon: '🤖', color: 'bg-orange-500/20 text-orange-300' },
                    { label: '→' },
                    { label: 'Audio Plays', icon: '🔊', color: 'bg-pink-500/20 text-pink-300' },
                  ].map((step, i) => step.color ? (
                    <span key={i} className={cn('px-2 py-1 rounded-lg font-medium whitespace-nowrap', step.color)}>
                      {step.icon} {step.label}
                    </span>
                  ) : (
                    <span key={i} className="text-muted-foreground">{step.label}</span>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* Services */}
          <Section title="Service Health" icon={Server}>
            <div className="space-y-3 mt-4">
              {status.services.map(svc => (
                <ServiceRow key={svc.name} service={svc} />
              ))}
            </div>
          </Section>

          {/* Database Stats */}
          <Section title="Database" icon={Database}>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border">
                <StatusIcon status={status.database.connected ? 'ok' : 'error'} size="md" />
                <div>
                  <p className="font-medium text-sm">
                    {status.database.connected ? 'Connected to PostgreSQL' : 'Cannot connect to PostgreSQL'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Response time: {status.database.latencyMs}ms
                  </p>
                </div>
              </div>

              {status.database.connected && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(status.database.stats).map(([key, val]) => (
                    <div key={key} className="bg-muted/30 rounded-xl p-3 text-center border border-border">
                      <p className="text-2xl font-bold tabular-nums">{val.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1 capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* Telephony */}
          <Section title="Telephony (SIP / FreeSWITCH)" icon={Phone}>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={cn(
                  'rounded-xl p-4 border text-center',
                  status.telephony.freeswitchConnected ? 'bg-green-500/10 border-green-500/20' : 'bg-muted/30 border-border',
                )}>
                  <p className={cn('text-2xl font-bold', status.telephony.freeswitchConnected ? 'text-green-400' : 'text-muted-foreground')}>
                    {status.telephony.freeswitchConnected ? 'CONNECTED' : 'OFFLINE'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">FreeSWITCH ESL</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4 border border-border text-center">
                  <p className="text-2xl font-bold tabular-nums text-blue-400">{status.telephony.activeCalls}</p>
                  <p className="text-xs text-muted-foreground mt-1">Active Calls</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4 border border-border text-center">
                  <p className="text-lg font-bold text-foreground">SIP Ready</p>
                  <p className="text-xs text-muted-foreground mt-1">Media Server</p>
                </div>
              </div>

              {!status.telephony.freeswitchConnected && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm text-yellow-300">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">FreeSWITCH is not connected yet</p>
                      <p className="text-yellow-200/70 text-xs">
                        This is normal during initial startup. FreeSWITCH takes ~60 seconds to fully initialize.
                        The API will automatically reconnect. Campaigns cannot start until connected.
                      </p>
                      <p className="text-yellow-200/70 text-xs">
                        Check: <code className="bg-black/20 px-1 rounded font-mono">docker compose logs freeswitch</code>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Network Ports */}
          <Section title="Network Ports" icon={Network}>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Port', 'Protocol', 'Service', 'Status', 'Description'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {status.ports.map(p => (
                    <tr key={`${p.port}-${p.protocol}`} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                      <td className="px-3 py-2.5 font-mono font-semibold text-foreground">{p.port}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded font-mono font-medium',
                          p.protocol === 'UDP' ? 'bg-blue-500/10 text-blue-300' : 'bg-purple-500/10 text-purple-300',
                        )}>{p.protocol}</span>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-sm">{p.service}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <StatusDot status={p.status === 'open' ? 'ok' : p.status === 'closed' ? 'warning' : 'unknown'} />
                          <span className={cn(
                            'text-xs font-medium',
                            p.status === 'open' ? 'text-green-400' : 'text-muted-foreground',
                          )}>
                            {p.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <Info className="h-3.5 w-3.5" />
                UDP ports cannot be probed remotely. &quot;Closed&quot; for UDP services may mean unreachable from this server context.
                For AWS: verify Security Group rules include 5060/UDP, 3478/UDP, 10000-20000/UDP.
              </p>
            </div>
          </Section>

          {/* Environment Variables */}
          <Section title="Configuration (Environment Variables)" icon={Lock}>
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted-foreground mb-4">
                These are read from the <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">.env</code> file.
                Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">sudo ./setup.sh</code> to auto-generate all required values.
              </p>

              {/* Required vars */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Required</p>
              <div className="space-y-1.5 mb-4">
                {status.environment_vars.filter(v => v.required).map(v => (
                  <div key={v.key} className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-all',
                    v.configured ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/30 bg-red-500/5',
                  )}>
                    <StatusIcon status={v.configured ? 'ok' : 'error'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono text-xs font-semibold text-foreground">{v.key}</code>
                        <span className="text-xs text-muted-foreground">—</span>
                        <span className="text-xs text-muted-foreground">{v.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{v.description}</p>
                    </div>
                    {v.configured && v.value && (
                      <code className="font-mono text-xs text-green-300 flex-shrink-0 bg-green-500/10 px-2 py-0.5 rounded">
                        {v.value}
                      </code>
                    )}
                    {!v.configured && (
                      <span className="text-xs text-red-400 flex-shrink-0 font-medium">Not set</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Optional vars */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Optional</p>
              <div className="space-y-1.5">
                {status.environment_vars.filter(v => !v.required).map(v => (
                  <div key={v.key} className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg border text-sm',
                    v.configured ? 'border-green-500/20 bg-green-500/5' : 'border-border bg-muted/20',
                  )}>
                    <StatusIcon status={v.configured ? 'ok' : 'warning'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono text-xs font-semibold text-foreground">{v.key}</code>
                        <span className="text-xs text-muted-foreground">{v.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{v.description}</p>
                    </div>
                    {v.configured && v.value ? (
                      <code className="font-mono text-xs text-green-300 flex-shrink-0 bg-green-500/10 px-2 py-0.5 rounded">{v.value}</code>
                    ) : (
                      <span className="text-xs text-muted-foreground flex-shrink-0">Not set</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* AWS Setup Guide */}
          <Section title="AWS EC2 Setup Guide" icon={Globe} defaultOpen={false}>
            <div className="mt-4 space-y-5">
              <div className="space-y-3">
                {[
                  {
                    step: 1, title: 'Launch EC2 Instance',
                    content: 'Use Ubuntu 22.04 LTS. Minimum c5.xlarge (4 vCPU, 8GB RAM) for production. Attach an Elastic IP so your public IP doesn\'t change on reboot.',
                    code: null,
                  },
                  {
                    step: 2, title: 'Configure Security Group',
                    content: 'Add these inbound rules to your EC2 Security Group:',
                    code: `TCP  22         — SSH (your IP only)
TCP  80, 443   — HTTP/HTTPS (0.0.0.0/0)
TCP  3000      — Frontend (0.0.0.0/0)
TCP  3001      — API (0.0.0.0/0)
UDP  5060      — SIP Kamailio (0.0.0.0/0)
TCP  5060      — SIP TCP (0.0.0.0/0)
UDP  5080      — SIP FreeSWITCH (0.0.0.0/0)
UDP  3478      — STUN/TURN (0.0.0.0/0)
TCP  3478      — STUN/TURN TCP (0.0.0.0/0)
UDP  10000-20000 — RTP Media (0.0.0.0/0)`,
                  },
                  {
                    step: 3, title: 'Clone and Deploy',
                    content: 'SSH into your instance and run:',
                    code: `git clone https://github.com/your-org/callspsy.git
cd callspsy
sudo ./setup.sh`,
                  },
                  {
                    step: 4, title: 'Verify',
                    content: 'After ~5 minutes, the setup completes. Visit:',
                    code: `Dashboard:  http://YOUR_EC2_IP:3000
API:        http://YOUR_EC2_IP:3001/api/docs
Status:     http://YOUR_EC2_IP:3000/status

Login:  demo@callspsy.com / demo123456`,
                  },
                ].map(item => (
                  <div key={item.step} className="flex gap-4">
                    <div className="flex-shrink-0 h-7 w-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold">
                      {item.step}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm mb-1">{item.title}</p>
                      <p className="text-xs text-muted-foreground mb-2">{item.content}</p>
                      {item.code && (
                        <pre className="bg-muted/50 border border-border rounded-lg px-4 py-3 text-xs font-mono text-muted-foreground whitespace-pre overflow-x-auto">
                          {item.code}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* Troubleshooting */}
          <Section title="Troubleshooting" icon={Terminal} defaultOpen={false}>
            <div className="mt-4 space-y-4">
              {[
                {
                  problem: 'FreeSWITCH shows "Not Connected"',
                  cause: 'FreeSWITCH needs ~60s to start. The API retries with exponential backoff.',
                  fix: 'docker compose logs freeswitch\n# Wait 2 minutes then refresh this page',
                },
                {
                  problem: 'Campaigns fail to start',
                  cause: 'FreeSWITCH ESL must be connected before campaigns can place calls.',
                  fix: 'Check FreeSWITCH status above. Ensure ESL_PASSWORD matches in .env.',
                },
                {
                  problem: 'SIP calls not connecting',
                  cause: 'Incorrect SIP account credentials or firewall blocking ports.',
                  fix: 'Test SIP account in SIP Accounts → Test Connection\nCheck AWS Security Group has 5060/UDP open',
                },
                {
                  problem: 'No audio / one-way audio',
                  cause: 'RTPengine NAT traversal issue. PUBLIC_IP in .env may be wrong.',
                  fix: 'Verify PUBLIC_IP in .env matches your actual Elastic IP\ndocker compose restart rtpengine freeswitch',
                },
                {
                  problem: 'docker compose build fails',
                  cause: 'Docker Hub rate limiting or network issue during image pull.',
                  fix: 'docker login  # Login to Docker Hub first\ndocker compose pull\ndocker compose build --no-cache',
                },
                {
                  problem: 'Missing packages / modules in FreeSWITCH',
                  cause: 'signalwire/freeswitch image may not include all modules.',
                  fix: 'Edit infra/freeswitch/Dockerfile — uncomment the debian build\nstage (alternative install) which builds all required modules.',
                },
              ].map((item, i) => (
                <div key={i} className="border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-muted/30 flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                    <span className="font-semibold text-sm">{item.problem}</span>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <p className="text-xs text-muted-foreground"><strong className="text-foreground">Cause:</strong> {item.cause}</p>
                    <pre className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground whitespace-pre overflow-x-auto">
                      {item.fix}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
