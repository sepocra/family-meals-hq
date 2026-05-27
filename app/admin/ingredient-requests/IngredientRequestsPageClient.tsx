'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { INGREDIENT_BANK_CATEGORIES } from '../../../lib/ingredient-catalog'
import {
  approveIngredientRequest,
  fetchPendingIngredientRequests,
  rejectIngredientRequest,
  type IngredientRequest,
} from '../../../lib/ingredient-requests'
import { btnPrimary, fieldInput, pageTitleAccent, surfaceCard, textMuted } from '../../../lib/brand-classes'
import { supabase } from '../../../lib/supabase'

const inputClass = fieldInput

export default function IngredientRequestsAdminPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [requests, setRequests] = useState<IngredientRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setActionError(null)
    try {
      setRequests(await fetchPendingIngredientRequests(supabase))
    } catch (err) {
      console.error(err)
      setActionError(
        'Could not load requests. Run docs/supabase-ingredient-requests.sql and docs/supabase-multi-user.sql in Supabase.'
      )
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    if (!authLoading && isAdmin) load()
  }, [authLoading, isAdmin, load])

  async function handleApprove(id: string) {
    setActingId(id)
    setActionError(null)
    const result = await approveIngredientRequest(supabase, id)
    setActingId(null)
    if ('error' in result) {
      setActionError(result.error)
      return
    }
    await load()
  }

  async function handleReject(id: string) {
    setActingId(id)
    setActionError(null)
    const result = await rejectIngredientRequest(supabase, id)
    setActingId(null)
    if ('error' in result) {
      setActionError(result.error)
      return
    }
    await load()
  }

  if (authLoading) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Admin only
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Your account is not marked as admin. In Supabase, run:{' '}
          <code className="text-xs">UPDATE profiles SET is_admin = true WHERE id = &apos;your-user-id&apos;;</code>
        </p>
        <Link href="/recipes" className="text-sm underline text-gray-600 dark:text-gray-300">
          Back to recipes
        </Link>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Ingredient requests
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Approve to add to the master ingredient bank.
        </p>
      </div>

      {actionError && <p className="text-sm text-red-500 mb-4">{actionError}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading requests…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No pending requests.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((req) => (
            <li
              key={req.id}
              className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-3"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {req.requested_name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Category: {req.category} · {new Date(req.created_at).toLocaleString()}
                </p>
                {req.recipe_line && (
                  <p
                    className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate"
                    title={req.recipe_line}
                  >
                    Recipe line: {req.recipe_line}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={actingId === req.id}
                  onClick={() => handleApprove(req.id)}
                  className={`${btnPrimary} px-3 py-1.5 text-sm disabled:opacity-50`}
                >
                  {actingId === req.id ? '…' : 'Approve & add to bank'}
                </button>
                <button
                  type="button"
                  disabled={actingId === req.id}
                  onClick={() => handleReject(req.id)}
                  className="text-sm font-medium border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:border-gray-400 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-400 mt-8">
        Categories: {INGREDIENT_BANK_CATEGORIES.map((c) => c.label).join(', ')}
      </p>
    </main>
  )
}
