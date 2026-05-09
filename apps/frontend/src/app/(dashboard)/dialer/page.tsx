'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Phone, PhoneOff, PhoneCall, PhoneIncoming, PhoneMissed,
  Mic, MicOff, Volume2, VolumeX, Delete, Clock, CheckCircle2,
  XCircle, Loader2, Hash, Star, RefreshCw, Search,
} from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { io, Socket } from 'socket.io-client'

type CallStatus = 'INITIATING' | 'RINGING' | 'ANSWERED' | 'COMPLETED' | 'FAILED' | 'BUSY' | 'NO_ANSWER'

interface ActiveCall {
  id: string
  destination: string
  callerIdNumber: string
  sipAccountName: string
  status: CallStatus
  duration: number
  startedAt: string
  answeredAt?: string
}

interface CallLog {
  id: string
  callId: string
  destination: string
  callerIdNumber: string
  sipAccountName: string
  status: CallStatus
  duration: number
  startedAt: string
  answeredAt?: string
  endedAt?: string
  notes?: string
}

interface DialerStats {
  total: number
  completed: number
  failed: number
  todayCalls: number
  totalDuration: number
  answerRate: number
}

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

const KEYPAD_LETTERS: Record<string, string> = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
  '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
  '0': '+',
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return raw
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw
}

function statusIcon(status: CallStatus, className?: string) {
  const cls = cn('h-3.5 w-3.5', className)
  switch (status) {
    case 'COMPLETED':   return <CheckCircle2 className={cn(cls, 'text-green-400')} />
    case 'ANSWERED':    return <PhoneCall className={cn(cls, 'text-green-400')} />
    case 'RINGING':
    case 'INITIATING':  return <PhoneIncoming className={cn(cls, 'text-brand-400')} />
    case 'BUSY':
    case 'FAILED':      return <PhoneMissed className={cn(cls, 'text-red-400')} />
    case 'NO_ANSWER':   return <XCircle className={cn(cls, 'text-yellow-400')} />
    default:            return <Phone className={cn(cls, 'text-muted-foreground')} />
  }
}

function statusLabel(status: CallStatus): string {
  const map: Record<CallStatus, string> = {
    INITIATING: 'Initiating…',
    RINGING:    'Ringing…',
    ANSWERED:   'In Call',
    COMPLETED:  'Completed',
    FAILED:     'Failed',
    BUSY:       'Busy',
    NO_ANSWER:  'No Answer',
  }
  return map[status] ?? status
}

export default function DialerPage() {
  const qc = useQueryClient()
  const accessToken = useAuthStore(s => s.accessToken)

  const [number, setNumber]           = useState('')
  const [selectedSip, setSelectedSip] = useState('')
  const [activeCall, setActiveCall]   = useState<ActiveCall | null>(null)
  const [callTimer, setCallTimer]     = useState(0)
  const [muted, setMuted]             = useState(false)
  const [speakerOff, setSpeakerOff]   = useState(false)
  const [searchLog, setSearchLog]     = useState('')
  const [callerIdNum, setCallerIdNum] = useState('')
  const [callNote, setCallNote]       = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const socketRef = useRef<Socket | null>(null)

  // ── Data queries ────────────────────────────────────────────────
  const { data: sipAccounts = [] } = useQuery({
    queryKey: ['sip-accounts'],
    queryFn: () => api.get('/sip-accounts').then(r => r.data?.data ?? r.data ?? []),
  })

  const { data: stats, refetch: refetchStats } = useQuery<DialerStats>({
    queryKey: ['dialer', 'stats'],
    queryFn: () => api.get('/dialer/stats').then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: history = [], refetch: refetchHistory } = useQuery<CallLog[]>({
    queryKey: ['dialer', 'history'],
    queryFn: () => api.get('/dialer/history?limit=100').then(r => r.data),
  })

  // ── WebSocket for real-time call status ─────────────────────────
  useEffect(() => {
    if (!accessToken) return
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'
    const socket = io(wsUrl, { auth: { token: accessToken }, transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('dialer:call_update', (call: ActiveCall) => {
      if (call.status === 'ANSWERED') {
        setActiveCall(call)
        setCallTimer(0)
      } else if (['COMPLETED', 'FAILED', 'BUSY', 'NO_ANSWER'].includes(call.status)) {
        setActiveCall(null)
        clearInterval(timerRef.current!)
        setCallTimer(0)
        qc.invalidateQueries({ queryKey: ['dialer'] })
        const msg = call.status === 'COMPLETED'
          ? `Call ended — ${formatDuration(call.duration)}`
          : statusLabel(call.status)
        toast.info(msg)
      } else {
        setActiveCall(call)
      }
    })

    return () => { socket.disconnect() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  // ── Call timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (activeCall?.status === 'ANSWERED') {
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [activeCall?.status])

  // ── Pre-select first SIP account ────────────────────────────────
  useEffect(() => {
    if (sipAccounts.length > 0 && !selectedSip) {
      setSelectedSip(sipAccounts[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sipAccounts])

  // ── Mutations ────────────────────────────────────────────────────
  const callMutation = useMutation({
    mutationFn: () => api.post('/dialer/call', {
      destination: number.replace(/\s|\(|\)|-/g, ''),
      sipAccountId: selectedSip,
      callerIdNumber: callerIdNum || undefined,
      notes: callNote || undefined,
    }),
    onSuccess: (res) => {
      setActiveCall(res.data)
      toast.success(`Calling ${number}…`)
      setCallNote('')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Call failed'),
  })

  const hangupMutation = useMutation({
    mutationFn: () => api.post('/dialer/hangup', { callId: activeCall!.id }),
    onSuccess: () => {
      setActiveCall(null)
      clearInterval(timerRef.current!)
      setCallTimer(0)
      refetchHistory()
      refetchStats()
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Hangup failed'),
  })

  // ── Keypad handlers ──────────────────────────────────────────────
  const pressKey = useCallback((key: string) => {
    setNumber(n => (n.length < 20 ? n + key : n))
  }, [])

  const backspace = useCallback(() => {
    setNumber(n => n.slice(0, -1))
  }, [])

  const callMutationRef = useRef(callMutation)
  callMutationRef.current = callMutation

  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (/^[0-9*#]$/.test(e.key)) pressKey(e.key)
    if (e.key === 'Backspace') backspace()
    if (e.key === 'Enter' && number && selectedSip && !activeCall) callMutationRef.current.mutate()
  }, [pressKey, backspace, number, selectedSip, activeCall])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [handleKeyboard])

  const canCall = number.length >= 7 && selectedSip && !activeCall && !callMutation.isPending
  const filteredHistory = history.filter(c =>
    c.destination.includes(searchLog) ||
    (c.sipAccountName || '').toLowerCase().includes(searchLog.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dialer</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Make outbound calls directly from your browser</p>
        </div>
        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="font-bold text-lg tabular-nums">{stats.todayCalls}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg tabular-nums text-green-400">{stats.answerRate}%</p>
              <p className="text-xs text-muted-foreground">Answer Rate</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg tabular-nums">{stats.total}</p>
              <p className="text-xs text-muted-foreground">This Month</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Left: Dialer Pad ─────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-2xl overflow-hidden">

            {/* Active call banner */}
            {activeCall && (
              <div className={cn(
                'px-5 py-3 text-sm font-medium flex items-center gap-3',
                activeCall.status === 'ANSWERED'
                  ? 'bg-green-500/15 border-b border-green-500/20 text-green-300'
                  : 'bg-brand-500/15 border-b border-brand-500/20 text-brand-300',
              )}>
                <div className="live-indicator" />
                <div className="flex-1">
                  <span>{statusLabel(activeCall.status)}</span>
                  {activeCall.status === 'ANSWERED' && (
                    <span className="ml-2 font-mono">{formatDuration(callTimer)}</span>
                  )}
                </div>
                <span className="text-xs opacity-70">{activeCall.destination}</span>
              </div>
            )}

            <div className="p-5 space-y-4">
              {/* Number display — directly editable */}
              <div className="relative">
                <input
                  type="tel"
                  value={number}
                  onChange={e => setNumber(e.target.value.replace(/[^0-9+*#\s\-().]/g, '').slice(0, 20))}
                  placeholder="Enter number or type here…"
                  disabled={!!activeCall}
                  className={cn(
                    'w-full px-4 py-4 pr-12 rounded-xl bg-background border text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-muted-foreground placeholder:text-base placeholder:font-sans placeholder:tracking-normal transition-all disabled:opacity-60',
                    activeCall ? 'border-green-500/30' : 'border-border',
                  )}
                />
                {number && !activeCall && (
                  <button
                    onClick={backspace}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                  >
                    <Delete className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Keypad */}
              {!activeCall && (
                <div className="grid grid-cols-3 gap-2">
                  {KEYPAD.flat().map(key => (
                    <button
                      key={key}
                      onClick={() => pressKey(key)}
                      className="flex flex-col items-center justify-center py-3.5 rounded-xl bg-background border border-border hover:border-brand-500/50 hover:bg-brand-500/5 active:scale-95 transition-all select-none"
                    >
                      <span className="text-lg font-semibold leading-none">{key}</span>
                      {KEYPAD_LETTERS[key] && (
                        <span className="text-[10px] text-muted-foreground mt-1 tracking-widest">
                          {KEYPAD_LETTERS[key]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* In-call controls */}
              {activeCall?.status === 'ANSWERED' && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setMuted(!muted)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-4 rounded-xl border transition-all',
                      muted
                        ? 'bg-red-500/15 border-red-500/30 text-red-400'
                        : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                  >
                    {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    <span className="text-xs font-medium">{muted ? 'Unmute' : 'Mute'}</span>
                  </button>
                  <button
                    onClick={() => setSpeakerOff(!speakerOff)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-4 rounded-xl border transition-all',
                      speakerOff
                        ? 'bg-muted border-border text-muted-foreground'
                        : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                  >
                    {speakerOff ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    <span className="text-xs font-medium">Speaker</span>
                  </button>
                </div>
              )}

              {/* SIP account selector */}
              {!activeCall && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    SIP Line
                  </label>
                  {sipAccounts.length === 0 ? (
                    <div className="px-3 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
                      No SIP accounts configured. Add one in SIP Accounts.
                    </div>
                  ) : (
                    <select
                      value={selectedSip}
                      onChange={e => setSelectedSip(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    >
                      {sipAccounts.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name} — {s.sipServer}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Caller ID override */}
              {!activeCall && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Caller ID Override <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={callerIdNum}
                    onChange={e => setCallerIdNum(e.target.value)}
                    placeholder="Leave blank to use SIP account default"
                    className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder:text-muted-foreground"
                  />
                </div>
              )}

              {/* Call note */}
              {!activeCall && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Note <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <input
                    value={callNote}
                    onChange={e => setCallNote(e.target.value)}
                    placeholder="e.g. Follow-up call"
                    className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder:text-muted-foreground"
                  />
                </div>
              )}

              {/* Call / Hangup button */}
              {activeCall ? (
                <button
                  onClick={() => hangupMutation.mutate()}
                  disabled={hangupMutation.isPending}
                  className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-semibold text-base flex items-center justify-center gap-3 transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  {hangupMutation.isPending
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <PhoneOff className="h-5 w-5" />
                  }
                  End Call
                </button>
              ) : (
                <button
                  onClick={() => callMutation.mutate()}
                  disabled={!canCall}
                  className="w-full py-4 rounded-2xl gradient-brand text-white font-semibold text-base flex items-center justify-center gap-3 transition-all disabled:opacity-40 hover:opacity-90 active:scale-[0.98]"
                >
                  {callMutation.isPending
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <Phone className="h-5 w-5" />
                  }
                  {callMutation.isPending ? 'Connecting…' : 'Call'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Call History ──────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Calls', value: stats.total, color: 'text-foreground' },
                { label: 'Completed', value: stats.completed, color: 'text-green-400' },
                { label: 'Talk Time', value: formatDuration(stats.totalDuration), color: 'text-brand-400' },
              ].map(s => (
                <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* History table */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
              <h2 className="font-semibold">Call History</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    value={searchLog}
                    onChange={e => setSearchLog(e.target.value)}
                    placeholder="Search…"
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-brand-500 w-36"
                  />
                </div>
                <button onClick={() => refetchHistory()} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="py-16 text-center">
                <PhoneCall className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No calls yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Your call history will appear here</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border/60">
                    <tr>
                      {['Number', 'Status', 'Duration', 'Line', 'Time'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredHistory.map(call => (
                      <tr
                        key={call.id}
                        className="hover:bg-accent/30 transition-colors cursor-pointer"
                        onClick={() => { setNumber(call.destination); setSelectedSip('') }}
                        title="Click to redial"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {statusIcon(call.status)}
                            <span className="font-mono text-sm">{call.destination}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'text-xs font-medium',
                            call.status === 'COMPLETED' && 'text-green-400',
                            call.status === 'FAILED'    && 'text-red-400',
                            call.status === 'BUSY'      && 'text-yellow-400',
                            call.status === 'NO_ANSWER' && 'text-yellow-400',
                          )}>
                            {statusLabel(call.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3 w-3 flex-shrink-0" />
                            <span className="font-mono text-xs">{formatDuration(call.duration)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">
                          {call.sipAccountName || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(call.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          <span className="block text-muted-foreground/50 text-[10px]">
                            {new Date(call.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
