'use client'

import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/auth.store'

interface LiveStats {
  activeCalls: number
  callsPerMinute: number
  activeCampaigns: number
  recentEvents: any[]
}

interface LiveEvent {
  type: string
  uuid?: string
  phone?: string
  campaignId?: string
  hangupCause?: string
  duration?: number
  amdResult?: string
  timestamp: string
}

export function useLiveStats() {
  const token = useAuthStore(s => s.accessToken)
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [liveStats, setLiveStats] = useState<LiveStats>({
    activeCalls: 0,
    callsPerMinute: 0,
    activeCampaigns: 0,
    recentEvents: [],
  })
  const [events, setEvents] = useState<LiveEvent[]>([])

  useEffect(() => {
    if (!token) return

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'
    const socket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join:live-monitor')
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('stats:update', (data: any) => {
      setLiveStats(prev => ({ ...prev, ...data }))
    })

    socket.on('call:update', (event: LiveEvent) => {
      setEvents(prev => [event, ...prev.slice(0, 99)])
    })

    socket.on('call:answered', (event: LiveEvent) => {
      setLiveStats(prev => ({ ...prev, activeCalls: prev.activeCalls + 1 }))
      setEvents(prev => [event, ...prev.slice(0, 99)])
    })

    socket.on('call:hangup', (event: LiveEvent) => {
      setLiveStats(prev => ({ ...prev, activeCalls: Math.max(0, prev.activeCalls - 1) }))
      setEvents(prev => [event, ...prev.slice(0, 99)])
    })

    socket.on('campaign:started', () => {
      setLiveStats(prev => ({ ...prev, activeCampaigns: prev.activeCampaigns + 1 }))
    })

    socket.on('campaign:completed', () => {
      setLiveStats(prev => ({ ...prev, activeCampaigns: Math.max(0, prev.activeCampaigns - 1) }))
    })

    return () => {
      socket.disconnect()
    }
  }, [token])

  const joinCampaign = (campaignId: string) => {
    socketRef.current?.emit('join:campaign', { campaignId })
  }

  const leaveCampaign = (campaignId: string) => {
    socketRef.current?.emit('leave:campaign', { campaignId })
  }

  return { liveStats, events, connected, joinCampaign, leaveCampaign }
}
