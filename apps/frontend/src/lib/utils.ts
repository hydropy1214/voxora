import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '0s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatPhoneNumber(phone: string): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return phone
}

export function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n?.toString() ?? '0'
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    RUNNING: 'text-green-400 bg-green-400/10 border-green-400/20',
    COMPLETED: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    PAUSED: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    FAILED: 'text-red-400 bg-red-400/10 border-red-400/20',
    CANCELLED: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
    DRAFT: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
    SCHEDULED: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    REGISTERED: 'text-green-400 bg-green-400/10 border-green-400/20',
    UNREGISTERED: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
    TESTING: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    READY: 'text-green-400 bg-green-400/10 border-green-400/20',
    PROCESSING: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    HUMAN: 'text-green-400 bg-green-400/10 border-green-400/20',
    MACHINE: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    ANSWERED: 'text-green-400 bg-green-400/10 border-green-400/20',
    BUSY: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    NOANSWER: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
  }
  return colors[status] ?? 'text-gray-400 bg-gray-400/10 border-gray-400/20'
}

export function getMosColor(mos: number): string {
  if (mos >= 4.0) return 'text-green-400'
  if (mos >= 3.5) return 'text-yellow-400'
  if (mos >= 3.0) return 'text-orange-400'
  return 'text-red-400'
}

export function getMosLabel(mos: number): string {
  if (mos >= 4.3) return 'Excellent'
  if (mos >= 4.0) return 'Good'
  if (mos >= 3.5) return 'Fair'
  if (mos >= 3.0) return 'Poor'
  return 'Bad'
}

export function timeAgo(date: string | Date): string {
  const d = new Date(date)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)

  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
