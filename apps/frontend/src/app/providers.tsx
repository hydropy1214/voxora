'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useState } from 'react'
import { OfflineBanner } from '@/components/OfflineBanner'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: (failureCount, error: any) => {
              // Don't retry auth errors
              if (error?.response?.status === 401 || error?.response?.status === 403) return false
              return failureCount < 2
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <OfflineBanner />
        {children}
      </ErrorBoundary>
      <Toaster
        theme="dark"
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          duration: 4000,
          classNames: {
            toast:       'bg-card border border-border text-foreground shadow-xl',
            title:       'text-foreground font-medium text-sm',
            description: 'text-muted-foreground text-xs',
            error:       'border-red-500/30 bg-red-500/5',
            success:     'border-green-500/30 bg-green-500/5',
            warning:     'border-yellow-500/30 bg-yellow-500/5',
            info:        'border-brand-500/30 bg-brand-500/5',
          },
        }}
      />
    </QueryClientProvider>
  )
}
