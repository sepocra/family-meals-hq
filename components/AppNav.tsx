'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { AdminNavLink } from './AdminNavLink'

const NAV_ITEMS = [
  { href: '/recipes', label: 'Recipe bank' },
  { href: '/inventory', label: 'Fresh Inventory' },
  { href: '/meals', label: "This Week's Meals" },
  { href: '/shopping', label: 'Shopping List' },
] as const

export function AppNav() {
  const pathname = usePathname()
  const { user, loading, signOut } = useAuth()

  if (pathname === '/login' || pathname.startsWith('/auth/')) {
    return null
  }

  if (loading) {
    return (
      <header className="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 px-4 py-3">
        <p className="text-xs text-gray-400">Loading…</p>
      </header>
    )
  }

  if (!user) return null

  return (
    <header className="sticky top-0 z-50 w-full max-w-[100vw] overflow-x-hidden border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-sm">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            Family Meals HQ
          </p>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-gray-400 truncate max-w-[140px]" title={user.email}>
              {user.email}
            </span>
            <button
              type="button"
              onClick={() => signOut()}
              className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 shrink-0"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav
          className="grid grid-cols-4 gap-1 w-full min-w-0"
          aria-label="Main"
        >
          {NAV_ITEMS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center justify-center text-center text-xs sm:text-sm font-medium px-2 sm:px-3 py-2 rounded-lg transition-colors whitespace-normal leading-snug min-h-[2.75rem] ${
                  active
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>
        <AdminNavLink />
      </div>
    </header>
  )
}
