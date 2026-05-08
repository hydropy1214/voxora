'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { User, Lock, Bell, Loader2, Save } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'

export default function SettingsPage() {
  const [tab, setTab] = useState<'profile' | 'security' | 'notifications'>('profile')
  const user = useAuthStore(s => s.user)
  const updateUser = useAuthStore(s => s.updateUser)

  const profileForm = useForm({
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      phone: '',
      timezone: 'UTC',
    },
  })

  const passwordForm = useForm<{ currentPassword: string; newPassword: string; confirmPassword: string }>()

  const profileMutation = useMutation({
    mutationFn: (data: any) => api.put('/users/profile', data).then(r => r.data),
    onSuccess: (data) => { updateUser(data); toast.success('Profile updated') },
    onError: () => toast.error('Failed to update profile'),
  })

  const passwordMutation = useMutation({
    mutationFn: (data: any) => api.put('/users/password', data),
    onSuccess: () => { passwordForm.reset(); toast.success('Password changed') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to change password'),
  })

  const TABS = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
  ]

  const inputClass = "w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your account preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <form onSubmit={profileForm.handleSubmit(data => profileMutation.mutate(data))}
          className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold">Profile Information</h3>

          <div className="flex items-center gap-4 mb-6">
            <div className="h-16 w-16 rounded-full gradient-brand flex items-center justify-center text-2xl font-bold text-white">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div>
              <p className="font-medium">{user?.firstName} {user?.lastName}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">First Name</label>
              <input {...profileForm.register('firstName')} className={inputClass} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Last Name</label>
              <input {...profileForm.register('lastName')} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Phone Number</label>
            <input {...profileForm.register('phone')} placeholder="+1 555 000 0000" className={inputClass} />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Timezone</label>
            <select {...profileForm.register('timezone')} className={inputClass}>
              {['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo'].map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={profileMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {profileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </form>
      )}

      {tab === 'security' && (
        <form
          onSubmit={passwordForm.handleSubmit(data => {
            if (data.newPassword !== data.confirmPassword) { toast.error('Passwords do not match'); return }
            passwordMutation.mutate(data)
          })}
          className="bg-card border border-border rounded-xl p-6 space-y-4"
        >
          <h3 className="font-semibold">Change Password</h3>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Current Password</label>
            <input {...passwordForm.register('currentPassword')} type="password" className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">New Password</label>
            <input {...passwordForm.register('newPassword')} type="password" className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Confirm New Password</label>
            <input {...passwordForm.register('confirmPassword')} type="password" className={inputClass} />
          </div>

          <button
            type="submit"
            disabled={passwordMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {passwordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Change Password
          </button>
        </form>
      )}
    </div>
  )
}
