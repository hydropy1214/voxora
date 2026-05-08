'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'

const schema = z.object({ email: z.string().email('Invalid email') })
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', data)
      setSent(true)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Check your email</h2>
          <p className="text-muted-foreground">We&apos;ve sent password reset instructions to your email address.</p>
        </div>
        <Link href="/login" className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to login
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Forgot password?</h2>
        <p className="text-muted-foreground">Enter your email to receive reset instructions.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <input
            {...register('email')}
            type="email"
            placeholder="you@example.com"
            className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
          />
          {errors.email && <p className="text-red-400 text-xs">{errors.email.message}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 gradient-brand rounded-lg font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Send Reset Link
        </button>
      </form>

      <Link href="/login" className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to login
      </Link>
    </div>
  )
}
