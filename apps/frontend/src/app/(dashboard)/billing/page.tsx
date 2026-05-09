'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { CreditCard, Check, Zap, Loader2, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const PLAN_COLORS: Record<string, string> = {
  TRIAL: 'border-gray-500/30',
  STARTER: 'border-blue-500/30',
  GROWTH: 'border-brand-500/50',
  PRO: 'border-purple-500/50',
  ENTERPRISE: 'border-yellow-500/30',
}

const PLAN_HIGHLIGHTS: Record<string, boolean> = {
  GROWTH: true,
}

export default function BillingPage() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  const { data: plans = [] } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => api.get('/billing/plans').then(r => r.data),
  })

  const { data: subscription } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => api.get('/billing/subscription').then(r => r.data),
  })

  const checkoutMutation = useMutation({
    mutationFn: (plan: string) => api.post('/billing/checkout', { plan }).then(r => r.data),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error('Stripe not configured. Please set STRIPE_SECRET_KEY.')
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Checkout failed'),
  })

  const currentPlan = subscription?.plan ?? 'TRIAL'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your subscription and usage</p>
      </div>

      {/* Current plan */}
      {subscription && (
        <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current Plan</p>
              <p className="text-2xl font-bold text-brand-300">{subscription.planDetails?.name ?? currentPlan}</p>
              {subscription.trialEndsAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Concurrent Calls</p>
              <p className="text-3xl font-bold">{subscription.maxConcurrentCalls}</p>
            </div>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.filter((p: any) => p.id !== 'TRIAL').map((plan: any) => {
            const isCurrent = plan.id === currentPlan
            const isHighlighted = PLAN_HIGHLIGHTS[plan.id]

            return (
              <div
                key={plan.id}
                className={cn(
                  'bg-card border rounded-2xl p-5 relative transition-all',
                  isHighlighted ? 'border-brand-500 shadow-lg shadow-brand-500/10' : PLAN_COLORS[plan.id] ?? 'border-border',
                  !isCurrent && 'hover:border-brand-500/50',
                )}
              >
                {isHighlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-0.5 gradient-brand rounded-full text-white text-xs font-semibold">
                      Popular
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    {plan.price === 0 ? (
                      <span className="text-2xl font-bold text-muted-foreground">Custom</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">${plan.price}</span>
                        <span className="text-muted-foreground text-sm">/mo</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-5">
                  {plan.features.map((f: string) => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <span className="text-muted-foreground">{f}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-5 text-xs">
                  {[
                    { label: 'Concurrent', value: plan.maxConcurrent },
                    { label: 'Campaigns', value: plan.maxCampaigns === -1 ? '∞' : plan.maxCampaigns },
                    { label: 'Contacts', value: plan.maxContacts === -1 ? '∞' : plan.maxContacts.toLocaleString() },
                    { label: 'SIP Accounts', value: plan.maxSipAccounts === -1 ? '∞' : plan.maxSipAccounts },
                  ].map(s => (
                    <div key={s.label} className="bg-muted/30 rounded-lg px-2 py-1.5 text-center">
                      <p className="font-semibold">{s.value}</p>
                      <p className="text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div className="w-full py-2 text-center text-sm text-muted-foreground border border-border rounded-lg">
                    Current Plan
                  </div>
                ) : plan.id === 'ENTERPRISE' ? (
                  <a
                    href="mailto:sales@voxora.io"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 text-sm transition-all"
                  >
                    Contact Sales <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <button
                    onClick={() => checkoutMutation.mutate(plan.id)}
                    disabled={checkoutMutation.isPending && selectedPlan === plan.id}
                    className={cn(
                      'w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
                      isHighlighted
                        ? 'gradient-brand text-white hover:opacity-90'
                        : 'border border-border hover:bg-accent',
                    )}
                  >
                    {checkoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Upgrade to {plan.name}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Billing info */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Billing Information</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Billing is managed through Stripe. All plans include unlimited API access.
          Invoices are sent monthly to your registered email.
        </p>
        {subscription?.invoices?.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium">Recent Invoices</h4>
            {subscription.invoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between text-sm py-2 border-b border-border/50">
                <span className="text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</span>
                <span className="font-medium">${(inv.amount / 100).toFixed(2)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${inv.status === 'PAID' ? 'text-green-400 bg-green-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
                  {inv.status}
                </span>
                {inv.pdf && (
                  <a href={inv.pdf} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline text-xs">
                    PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
