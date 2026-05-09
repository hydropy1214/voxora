import { PhoneCall } from 'lucide-react'
import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-brand-950 to-brand-900 flex-col justify-between p-12">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-brand-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-brand-500/5" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-brand-500/10" />
        </div>

        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gradient-brand flex items-center justify-center">
              <PhoneCall className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">CallsPsy</span>
          </Link>
        </div>

        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white leading-tight">
              Intelligent Outbound<br />
              <span className="text-gradient">Voice Campaigns</span>
            </h1>
            <p className="text-brand-200 text-lg max-w-md">
              Launch outbound voice campaigns at scale with direct SIP protocol. No telecom APIs, no middlemen — just results.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Concurrent Calls', value: '1,000+' },
              { label: 'Answer Detection', value: 'AMD' },
              { label: 'Real-time Monitor', value: 'Live' },
              { label: 'SIP Providers', value: 'Any' },
            ].map(stat => (
              <div key={stat.label} className="bg-brand-800/50 rounded-xl p-4 border border-brand-700/50">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-brand-300 text-sm mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-3 text-brand-400 text-sm">
          <span>© 2026 CallsPsy</span>
          <span>•</span>
          <span>callspsy.com</span>
          <span>•</span>
          <span>Direct SIP Protocol</span>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-9 w-9 rounded-xl gradient-brand flex items-center justify-center">
              <PhoneCall className="h-4 w-4 text-white" />
            </div>
            <span className="text-xl font-bold">CallsPsy</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
