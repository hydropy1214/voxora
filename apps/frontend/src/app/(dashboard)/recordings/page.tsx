'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mic, Play, Pause, Download, Trash2, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { formatDuration, formatFileSize, timeAgo } from '@/lib/utils'

export default function RecordingsPage() {
  const [search, setSearch] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['recordings', search],
    queryFn: () => api.get(`/recordings?search=${search}`).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/recordings/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recordings'] }); toast.success('Recording deleted') },
  })

  const togglePlay = (rec: any) => {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/recordings/${rec.id}/stream`
    if (playingId === rec.id) {
      audioEl?.pause(); setPlayingId(null); return
    }
    if (audioEl) audioEl.pause()
    const audio = new Audio(url)
    audio.addEventListener('ended', () => setPlayingId(null))
    audio.play().catch(() => toast.error('Cannot play recording'))
    setAudioEl(audio)
    setPlayingId(rec.id)
  }

  const recordings = data?.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recordings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Call recordings archive</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search recordings..."
          className="w-full pl-9 pr-4 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
        ))}</div>
      ) : recordings.length === 0 ? (
        <div className="text-center py-16">
          <Mic className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="font-semibold text-lg mb-1">No recordings yet</p>
          <p className="text-muted-foreground text-sm">Recordings appear here after calls complete</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Phone', 'Campaign', 'Duration', 'Size', 'Date', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recordings.map((rec: any) => {
                const call = rec.callLogs?.[0]
                return (
                  <tr key={rec.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{call?.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-32">{call?.campaign?.name ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums">{formatDuration(rec.duration ?? 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatFileSize(rec.size ?? 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{timeAgo(rec.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => togglePlay(rec)}
                          className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                          {playingId === rec.id ? <Pause className="h-3.5 w-3.5 text-brand-400" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                        <a href={`${process.env.NEXT_PUBLIC_API_URL}/api/recordings/${rec.id}/stream`}
                          download className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button onClick={() => deleteMutation.mutate(rec.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
