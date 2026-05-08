'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api'

const schema = z.object({
  firstName: z.string().min(1, 'First name required').max(50),
  lastName: z.string().min(1, 'Last name required').max(50),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organizationName: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const PERKS = [
  '14-day free trial, no credit card',
  'Direct SIP protocol, any provider',
  'Real-time AMD detection',
  'Unlimited contacts on Pro',
]

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const setAuth = useAuthStore(s => s.setAuth)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/register', data)
      setAuth(res.data.accessToken, res.data.refreshToken, res.data.user)
      toast.success('Account created! Welcome to Voxora.')
      router.push('/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Create your account</h2>
        <p className="text-muted-foreground">Start your 14-day free trial</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PERKS.map(perk => (
          <div key={perk} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
            <span>{perk}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">First Name</label>
            <input
              {...register('firstName')}
              placeholder="John"
              className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm"
            />
            {errors.firstName && <p className="text-red-400 text-xs">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Last Name</label>
            <input
              {...register('lastName')}
              placeholder="Doe"
              className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm"
            />
            {errors.lastName && <p className="text-red-400 text-xs">{errors.lastName.message}</p>}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Work Email</label>
          <input
            {...register('email')}
            type="email"
            placeholder="you@company.com"
            className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm"
          />
          {errors.email && <p className="text-red-400 text-xs">{errors.email.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Company Name <span className="text-muted-foreground">(optional)</span></label>
          <input
            {...register('organizationName')}
            placeholder="Acme Corp"
            className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Password</label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="Min 8 characters"
              className="w-full px-3 py-2.5 pr-10 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-red-400 text-xs">{errors.password.message}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 gradient-brand rounded-lg font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Create Free Account
        </button>

        <p className="text-center text-muted-foreground text-xs">
          By signing up you agree to our{' '}
          <Link href="/terms" className="text-brand-400 hover:underline">Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-brand-400 hover:underline">Privacy Policy</Link>
        </p>
      </form>

      <p className="text-center text-muted-foreground text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  )
}
