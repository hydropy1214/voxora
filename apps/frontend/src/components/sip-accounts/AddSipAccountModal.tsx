'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  sipServer: z.string().min(1, 'SIP server required'),
  sipPort: z.number().default(5060),
  username: z.string().min(1, 'Username required'),
  password: z.string().min(1, 'Password required'),
  transport: z.enum(['UDP', 'TCP', 'TLS']).default('UDP'),
  proxy: z.string().optional(),
  outboundProxy: z.string().optional(),
  callerIdNumber: z.string().optional(),
  callerIdName: z.string().optional(),
  maxConcurrentCalls: z.number().min(1).max(500).default(10),
  callsPerSecond: z.number().min(0.1).max(100).default(1),
})

type FormData = z.infer<typeof schema>

export function AddSipAccountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { transport: 'UDP', sipPort: 5060, maxConcurrentCalls: 10, callsPerSecond: 1 },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) => api.post('/sip-accounts', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sip-accounts'] })
      toast.success('SIP account added!')
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to add account'),
  })

  const Field = ({ label, children, error }: any) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs">{error.message}</p>}
    </div>
  )

  const inputClass = "w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">Add SIP Account</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="p-6 space-y-4">
          <Field label="Account Name *" error={errors.name}>
            <input {...register('name')} placeholder="My SIP Provider" className={inputClass} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="SIP Server *" error={errors.sipServer}>
                <input {...register('sipServer')} placeholder="sip.provider.com" className={inputClass} />
              </Field>
            </div>
            <Field label="Port" error={errors.sipPort}>
              <input {...register('sipPort', { valueAsNumber: true })} type="number" defaultValue={5060} className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Username *" error={errors.username}>
              <input {...register('username')} placeholder="1001" className={inputClass} />
            </Field>
            <Field label="Password *" error={errors.password}>
              <input {...register('password')} type="password" placeholder="••••••••" className={inputClass} />
            </Field>
          </div>

          <Field label="Transport">
            <select {...register('transport')} className={inputClass}>
              <option value="UDP">UDP</option>
              <option value="TCP">TCP</option>
              <option value="TLS">TLS</option>
            </select>
          </Field>

          <Field label="Outbound Proxy (optional)" error={errors.outboundProxy}>
            <input {...register('outboundProxy')} placeholder="proxy.provider.com:5060" className={inputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Caller ID Number" error={errors.callerIdNumber}>
              <input {...register('callerIdNumber')} placeholder="+15551234567" className={inputClass} />
            </Field>
            <Field label="Caller ID Name" error={errors.callerIdName}>
              <input {...register('callerIdName')} placeholder="Acme Corp" className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Concurrent Calls">
              <input {...register('maxConcurrentCalls', { valueAsNumber: true })} type="number" className={inputClass} />
            </Field>
            <Field label="Calls Per Second">
              <input {...register('callsPerSecond', { valueAsNumber: true })} type="number" step="0.1" className={inputClass} />
            </Field>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-border hover:bg-accent text-sm transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 py-2.5 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Account
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
