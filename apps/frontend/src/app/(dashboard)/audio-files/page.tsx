'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileAudio, Play, Pause, Trash2, Loader2 } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { formatDuration, formatFileSize, getStatusColor, timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

export default function AudioFilesPage() {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)
  const qc = useQueryClient()

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['audio-files'],
    queryFn: () => api.get('/audio-files').then(r => r.data),
    refetchInterval: 5000,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      form.append('name', file.name.replace(/\.[^.]+$/, ''))
      return api.post('/audio-files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audio-files'] }); toast.success('Audio file uploaded') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Upload failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/audio-files/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audio-files'] }); toast.success('File deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => uploadMutation.mutate(file))
  }, [uploadMutation])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'], 'audio/wave': ['.wav'] },
    maxSize: 50 * 1024 * 1024,
  })

  const togglePlay = (file: any) => {
    const streamUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/audio-files/${file.id}/stream`
    const authToken = JSON.parse(localStorage.getItem('voxora-auth') || '{}')?.state?.accessToken

    if (playingId === file.id) {
      audioEl?.pause()
      setPlayingId(null)
      return
    }

    if (audioEl) audioEl.pause()
    const audio = new Audio(streamUrl)
    audio.addEventListener('ended', () => setPlayingId(null))
    audio.play().catch(() => toast.error('Cannot play audio'))
    setAudioEl(audio)
    setPlayingId(file.id)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audio Files</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Upload and manage your broadcast audio</p>
      </div>

      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all',
          isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-border hover:border-brand-500/50',
        )}
      >
        <input {...getInputProps()} />
        {uploadMutation.isPending ? (
          <Loader2 className="h-10 w-10 mx-auto mb-3 text-brand-400 animate-spin" />
        ) : (
          <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        )}
        <p className="font-medium mb-1">
          {isDragActive ? 'Drop your audio here' : uploadMutation.isPending ? 'Uploading...' : 'Upload MP3 or WAV'}
        </p>
        <p className="text-xs text-muted-foreground">Drag & drop or click to browse. Max 50MB per file.</p>
      </div>

      {/* Files grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-16">
          <FileAudio className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="font-semibold text-lg mb-1">No audio files yet</p>
          <p className="text-muted-foreground text-sm">Upload MP3 or WAV files to use in campaigns</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {files.map((file: any) => (
            <div key={file.id} className="bg-card border border-border rounded-xl p-4 hover:border-brand-500/30 transition-all">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-brand-500/15 flex items-center justify-center flex-shrink-0">
                  <FileAudio className="h-5 w-5 text-brand-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm truncate">{file.name}</p>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0', getStatusColor(file.status))}>
                      {file.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{file.format?.toUpperCase()}</span>
                    <span>•</span>
                    <span>{formatDuration(file.duration ?? 0)}</span>
                    <span>•</span>
                    <span>{formatFileSize(file.size)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(file.createdAt)}</p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {file.status === 'READY' && (
                    <button
                      onClick={() => togglePlay(file)}
                      className="p-2 rounded-lg border border-border hover:bg-accent transition-all"
                    >
                      {playingId === file.id ? (
                        <Pause className="h-4 w-4 text-brand-400" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(file.id)}
                    className="p-2 rounded-lg border border-border hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Waveform placeholder */}
              {file.status === 'READY' && (
                <div className="mt-3 h-8 bg-muted rounded-lg overflow-hidden">
                  <div className="flex items-center h-full gap-px px-2">
                    {[...Array(48)].map((_, i) => (
                      <div
                        key={i}
                        className={cn('w-1 rounded-full flex-shrink-0', playingId === file.id ? 'bg-brand-400' : 'bg-brand-500/40')}
                        style={{ height: `${20 + Math.sin(i * 0.5) * 15 + Math.cos(i * 0.3) * 10}%` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
