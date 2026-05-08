'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'

const schema = z.object({
  name: z.string().min(1, 'Campaign name required'),
  sipAccountId: z.string().min(1, 'Select a SIP account'),
  contactListId: z.string().min(1, 'Select a contact list'),
  audioFileId: z.string().min(1, 'Select an audio file'),
  type: z.enum(['BROADCAST', 'VOICEMAIL_DROP']).default('BROADCAST'),
  maxConcurrentCalls: z.number().min(1).max(500).default(5),
  callsPerSecond: z.number().min(0.1).max(100).default(1),
  amdEnabled: z.boolean().default(true),
  amdAction: z.enum(['PLAY_ON_HUMAN', 'VOICEMAIL_DROP', 'HANGUP_ON_MACHINE', 'PLAY_ON_BOTH']).default('PLAY_ON_HUMAN'),
  callerIdNumber: z.string().optional(),
  callerIdName: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  onClose: () => void
}

const STEPS = ['Basic Info', 'Select Resources', 'Settings', 'Review']

export function CreateCampaignModal({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const qc = useQueryClient()

  const { data: sipAccounts } = useQuery({ queryKey: ['sip-accounts'], queryFn: () => api.get('/sip-accounts').then(r => r.data) })
  const { data: contactLists } = useQuery({ queryKey: ['contact-lists'], queryFn: () => api.get('/contacts/lists').then(r => r.data) })
  const { data: audioFiles } = useQuery({ queryKey: ['audio-files'], queryFn: () => api.get('/audio-files').then(r => r.data) })

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'BROADCAST',
      maxConcurrentCalls: 5,
      callsPerSecond: 1,
      amdEnabled: true,
      amdAction: 'PLAY_ON_HUMAN',
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.post('/campaigns', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign created successfully!')
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create campaign'),
  })

  const values = watch()

  const selectedSip = sipAccounts?.find((s: any) => s.id === values.sipAccountId)
  const selectedList = contactLists?.find((l: any) => l.id === values.contactListId)
  const selectedAudio = audioFiles?.find((a: any) => a.id === values.audioFileId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold">Create Campaign</h2>
            <p className="text-muted-foreground text-sm">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex px-6 pt-4 gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-all ${i <= step ? 'bg-brand-500' : 'bg-muted'}`} />
          ))}
        </div>

        <form onSubmit={handleSubmit(data => createMutation.mutate(data))}>
          <div className="p-6 min-h-64">

            {/* Step 0: Basic Info */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Campaign Name *</label>
                  <input {...register('name')} placeholder="e.g. Summer Sale Broadcast"
                    className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                  />
                  {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Campaign Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['BROADCAST', 'VOICEMAIL_DROP'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setValue('type', type)}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          values.type === type
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-border hover:border-border/80'
                        }`}
                      >
                        <p className="font-medium text-sm">{type === 'BROADCAST' ? 'Broadcast' : 'Voicemail Drop'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {type === 'BROADCAST' ? 'Play audio after answer' : 'Leave voicemail on machine'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Caller ID Number</label>
                    <input {...register('callerIdNumber')} placeholder="+15551234567"
                      className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Caller ID Name</label>
                    <input {...register('callerIdName')} placeholder="Acme Corp"
                      className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Resources */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">SIP Account *</label>
                  <select {...register('sipAccountId')}
                    className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                  >
                    <option value="">Select SIP account...</option>
                    {sipAccounts?.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.sipServer})</option>
                    ))}
                  </select>
                  {errors.sipAccountId && <p className="text-red-400 text-xs mt-1">{errors.sipAccountId.message}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Contact List *</label>
                  <select {...register('contactListId')}
                    className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                  >
                    <option value="">Select contact list...</option>
                    {contactLists?.map((list: any) => (
                      <option key={list.id} value={list.id}>{list.name} ({list.validCount} valid)</option>
                    ))}
                  </select>
                  {errors.contactListId && <p className="text-red-400 text-xs mt-1">{errors.contactListId.message}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Audio File *</label>
                  <select {...register('audioFileId')}
                    className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                  >
                    <option value="">Select audio file...</option>
                    {audioFiles?.filter((f: any) => f.status === 'READY').map((f: any) => (
                      <option key={f.id} value={f.id}>{f.name} ({f.duration?.toFixed(0)}s)</option>
                    ))}
                  </select>
                  {errors.audioFileId && <p className="text-red-400 text-xs mt-1">{errors.audioFileId.message}</p>}
                </div>
              </div>
            )}

            {/* Step 2: Settings */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Max Concurrent Calls: <span className="text-brand-400">{values.maxConcurrentCalls}</span>
                  </label>
                  <input
                    type="range" min={1} max={200} step={1}
                    value={values.maxConcurrentCalls}
                    onChange={e => setValue('maxConcurrentCalls', +e.target.value)}
                    className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-brand-500"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1</span><span>100</span><span>200</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Calls Per Second: <span className="text-brand-400">{values.callsPerSecond}</span>
                  </label>
                  <input
                    type="range" min={0.1} max={20} step={0.1}
                    value={values.callsPerSecond}
                    onChange={e => setValue('callsPerSecond', +e.target.value)}
                    className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-brand-500"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0.1</span><span>10</span><span>20</span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-muted">
                  <div>
                    <p className="text-sm font-medium">Answering Machine Detection (AMD)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Detect human vs voicemail automatically</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setValue('amdEnabled', !values.amdEnabled)}
                    className={`relative h-6 w-11 rounded-full transition-all ${values.amdEnabled ? 'bg-brand-500' : 'bg-muted-foreground/30'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${values.amdEnabled ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </div>

                {values.amdEnabled && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">AMD Action</label>
                    <select
                      value={values.amdAction}
                      onChange={e => setValue('amdAction', e.target.value as any)}
                      className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    >
                      <option value="PLAY_ON_HUMAN">Play audio on human answer</option>
                      <option value="VOICEMAIL_DROP">Drop voicemail on machine</option>
                      <option value="HANGUP_ON_MACHINE">Hang up on machine</option>
                      <option value="PLAY_ON_BOTH">Play audio on both</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Review Campaign</h3>
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'Name', value: values.name },
                    { label: 'Type', value: values.type },
                    { label: 'SIP Account', value: selectedSip?.name || values.sipAccountId },
                    { label: 'Contact List', value: selectedList ? `${selectedList.name} (${selectedList.validCount} contacts)` : values.contactListId },
                    { label: 'Audio File', value: selectedAudio?.name || values.audioFileId },
                    { label: 'Concurrent Calls', value: values.maxConcurrentCalls },
                    { label: 'Calls/Second', value: values.callsPerSecond },
                    { label: 'AMD', value: values.amdEnabled ? `On · ${values.amdAction}` : 'Off' },
                    { label: 'Caller ID', value: values.callerIdNumber ? `${values.callerIdNumber} (${values.callerIdName || ''})` : 'From SIP account' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-2 border-b border-border/50">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium truncate max-w-xs">{row.value || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-border">
            <button
              type="button"
              onClick={() => step > 0 ? setStep(step - 1) : onClose()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-accent text-sm transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
              {step === 0 ? 'Cancel' : 'Back'}
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-brand text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-2 px-6 py-2 rounded-lg gradient-brand text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Campaign
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
