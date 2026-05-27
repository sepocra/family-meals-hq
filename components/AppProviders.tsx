'use client'

import type { ReactNode } from 'react'
import type { ServerSession } from '../lib/server-auth'
import { AdminPendingBanner } from './AdminPendingBanner'
import { AuthProvider } from './AuthProvider'

type AppProvidersProps = {
  children: ReactNode
  initialSession: ServerSession
}

export function AppProviders({ children, initialSession }: AppProvidersProps) {
  return (
    <AuthProvider initialSession={initialSession}>
      {children}
      <AdminPendingBanner />
    </AuthProvider>
  )
}
