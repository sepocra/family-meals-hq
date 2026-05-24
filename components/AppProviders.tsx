'use client'

import type { ReactNode } from 'react'
import { AdminPendingBanner } from './AdminPendingBanner'
import { AuthProvider } from './AuthProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <AdminPendingBanner />
    </AuthProvider>
  )
}
