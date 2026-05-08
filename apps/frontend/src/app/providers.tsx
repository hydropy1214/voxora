'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          classNames: {
            toast: 'bg-card border border-border text-foreground',
            title: 'text-foreground font-medium',
            description: 'text-muted-foreground',
          },
        }}
      />
    </QueryClientProvider>
  )
}
