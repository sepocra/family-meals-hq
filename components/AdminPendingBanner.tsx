'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { btnPrimary } from '../lib/brand-classes'
import { fetchPendingIngredientRequests } from '../lib/ingredient-requests'
import { createClient } from '../lib/supabase/client'
import { useAuth } from './AuthProvider'

const ADMIN_REQUESTS_PATH = '/admin/ingredient-requests'

export function AdminPendingBanner() {
  const pathname = usePathname()
  const { isAdmin, loading } = useAuth()
  const supabase = createClient()
  const [pendingCount, setPendingCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!isAdmin) return
    try {
      const requests = await fetchPendingIngredientRequests(supabase)
      setPendingCount(requests.length)
    } catch (err) {
      console.error(err)
    }
  }, [isAdmin, supabase])

  useEffect(() => {
    if (loading || !isAdmin) {
      setPendingCount(0)
      return
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [loading, isAdmin, pathname, refresh])

  if (
    loading ||
    !isAdmin ||
    pendingCount === 0 ||
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith(ADMIN_REQUESTS_PATH)
  ) {
    return null
  }

  const label =
    pendingCount === 1
      ? '1 ingredient request needs your review'
      : `${pendingCount} ingredient requests need your review`

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none admin-banner-enter"
      role="region"
      aria-label="Admin action required"
    >
      <div className="max-w-4xl mx-auto pointer-events-auto">
        <div className="surface-card border-coral/50 shadow-lg shadow-black/10 dark:shadow-black/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-primary flex-1 min-w-0">{label}</p>
          <Link
            href={ADMIN_REQUESTS_PATH}
            className={`${btnPrimary} px-4 py-2 text-sm text-center shrink-0`}
          >
            Review requests
          </Link>
        </div>
      </div>
    </div>
  )
}
