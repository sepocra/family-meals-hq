'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'

export function AdminNavLink() {
  const pathname = usePathname()
  const { isAdmin, loading } = useAuth()

  if (loading || !isAdmin) return null

  const href = '/admin/ingredient-requests'
  const active = pathname.startsWith(href)

  return (
    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-800">
      <Link
        href={href}
        className={`block text-center text-xs sm:text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
          active
            ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
            : 'text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
        }`}
      >
        Ingredient requests (admin)
      </Link>
    </div>
  )
}
