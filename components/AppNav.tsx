'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { userInitials } from '../lib/user-initials'
import { useAuth } from './AuthProvider'
const NAV_ITEMS = [
  { href: '/recipes', label: 'Recipe bank', emoji: '📚' },
  { href: '/inventory', label: 'Fresh Inventory', emoji: '🥬' },
  { href: '/meals', label: 'Meal Selection', emoji: '📅' },
  { href: '/shopping', label: 'Shopping List', emoji: '🛒' },
] as const

export function AppNav() {
  const pathname = usePathname()
  const { user, profile, loading, signOut } = useAuth()

  if (pathname === '/login' || pathname.startsWith('/auth/')) {
    return null
  }

  if (loading) {
    return (
      <header className="sticky top-0 z-50 border-b border-border bg-base/95 px-4 py-3">
        <p className="text-xs text-muted">Loading…</p>
      </header>
    )
  }

  if (!user) return null

  return (
    <header className="sticky top-0 z-50 w-full max-w-[100vw] overflow-x-hidden border-b border-border bg-base/95 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide">
            Family Meals HQ
          </p>
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface border border-border text-xs font-semibold text-primary"
              title={user.email ?? undefined}
              aria-label={user.email ? `Signed in as ${user.email}` : 'Account'}
            >
              {userInitials(user.email, profile?.display_name)}
            </span>
            <button
              type="button"
              onClick={() => signOut()}
              className="text-xs text-muted hover:text-primary shrink-0 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav
          className="grid grid-cols-4 gap-1 w-full min-w-0"
          aria-label="Main"
        >
          {NAV_ITEMS.map(({ href, label, emoji }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center justify-center text-center gap-1 text-xs sm:text-sm font-medium px-1.5 sm:px-3 py-2 rounded-xl transition-colors whitespace-normal leading-snug min-h-[2.75rem] ${
                  active ? 'nav-active' : 'nav-inactive'
                }`}
              >
                <span className="hidden sm:inline" aria-hidden>
                  {emoji}
                </span>
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
