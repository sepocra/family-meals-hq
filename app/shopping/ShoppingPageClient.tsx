'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../components/AuthProvider'
import {
  computeShoppingPageState,
  type ShoppingPageState,
} from '../../lib/shopping-state'
import type { ShoppingListByCategory } from '../../lib/shopping-list'
import { fetchUserFreshInventory } from '../../lib/user-inventory-db'
import { fetchUserWeeklyMeals } from '../../lib/user-weekly-meals-db'
import { supabase } from '../../lib/supabase'
import { btnPrimary, linkAccent, pageTitleAccent, surfaceCard, textMuted } from '../../lib/brand-classes'
import { formatWeeklyMealsRefreshed } from '../../lib/weekly-meals'

function ShoppingColumn({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items: string[]
  emptyMessage: string
}) {
  return (
    <div className={`${surfaceCard} p-5 min-h-[160px]`}>
      <h2 className="text-sm font-semibold text-primary mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className={`text-sm ${textMuted}`}>{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item}
              className="text-sm text-primary border border-border rounded-xl px-3 py-2 bg-surface"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UnusedInventorySection({
  show,
  unusedInventory,
}: {
  show: boolean
  unusedInventory: ShoppingListByCategory
}) {
  if (!show) return null
  const totalUnused = unusedInventory.produce.length + unusedInventory.meat.length
  return (
    <div className="mt-8 pt-8 border-t border-border">
      <h2 className="text-base font-semibold text-primary mb-1">
        Unused in Fresh Inventory
      </h2>
      <p className={`text-sm ${textMuted} mb-4`}>
        On hand but not used by your selected meals this week.
        {totalUnused === 0 && ' Everything in inventory is accounted for.'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ShoppingColumn
          title="Fruit & Veg"
          items={unusedInventory.produce}
          emptyMessage="None unused."
        />
        <ShoppingColumn
          title="Meats"
          items={unusedInventory.meat}
          emptyMessage="None unused."
        />
      </div>
    </div>
  )
}

type ShoppingPageClientProps = {
  initialState?: ShoppingPageState
}

export default function ShoppingListPage({
  initialState,
}: ShoppingPageClientProps = {}) {
  const { user } = useAuth()
  const [hydrated, setHydrated] = useState(initialState !== undefined)
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<ShoppingListByCategory>(
    () => initialState?.list ?? { produce: [], meat: [] }
  )
  const [unusedInventory, setUnusedInventory] = useState<ShoppingListByCategory>(
    () => initialState?.unusedInventory ?? { produce: [], meat: [] }
  )
  const [selectedMealCount, setSelectedMealCount] = useState(
    () => initialState?.selectedMealCount ?? 0
  )
  const [loadedMealCount, setLoadedMealCount] = useState(
    () => initialState?.loadedMealCount ?? 0
  )
  const [totalFreshLines, setTotalFreshLines] = useState(
    () => initialState?.totalFreshLines ?? 0
  )
  const [shoppingError, setShoppingError] = useState<string | null>(
    () => initialState?.shoppingError ?? null
  )
  const [pantryOnlyMeals, setPantryOnlyMeals] = useState(
    () => initialState?.pantryOnlyMeals ?? false
  )
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(
    () => initialState?.lastRefreshed ?? null
  )

  function applyShoppingState(state: ShoppingPageState) {
    setList(state.list)
    setUnusedInventory(state.unusedInventory)
    setSelectedMealCount(state.selectedMealCount)
    setLoadedMealCount(state.loadedMealCount)
    setTotalFreshLines(state.totalFreshLines)
    setShoppingError(state.shoppingError)
    setPantryOnlyMeals(state.pantryOnlyMeals)
    setLastRefreshed(state.lastRefreshed)
  }

  const recompute = useCallback(async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      const [stored, inventory] = await Promise.all([
        fetchUserWeeklyMeals(supabase).catch(() => null),
        fetchUserFreshInventory(supabase, user.id).catch(() => []),
      ])
      applyShoppingState(
        await computeShoppingPageState(supabase, user.id, stored, inventory)
      )
    } catch (err) {
      console.error(err)
      applyShoppingState({
        list: { produce: [], meat: [] },
        unusedInventory: { produce: [], meat: [] },
        selectedMealCount: 0,
        loadedMealCount: 0,
        totalFreshLines: 0,
        shoppingError: 'Could not load shopping list.',
        pantryOnlyMeals: false,
        lastRefreshed: null,
      })
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (initialState !== undefined) return
    if (!user) return
    void recompute().finally(() => setHydrated(true))
  }, [initialState, recompute, user])

  const totalNeeded = list.produce.length + list.meat.length
  const allCovered =
    loadedMealCount > 0 && totalFreshLines > 0 && totalNeeded === 0
  const showUnusedInventory =
    loadedMealCount > 0 && !shoppingError && selectedMealCount > 0

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className={`text-2xl font-semibold text-primary ${pageTitleAccent}`}>
          Shopping List
        </h1>
        <button
          type="button"
          onClick={recompute}
          disabled={loading}
          className={`shrink-0 ${btnPrimary} px-4 py-2 disabled:opacity-50`}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <p className={`text-sm ${textMuted} mb-2`}>
        Fresh fruit, veg and meat you&apos;ll need to grab to complete your{' '}
        <Link href="/meals" className={linkAccent}>
          Meal Selection
        </Link>
        . Scroll down to see what fresh produce you won&apos;t have used in these meals.
      </p>
      {lastRefreshed && (
        <p className={`text-xs ${textMuted} mb-8`}>
          Based on meals {formatWeeklyMealsRefreshed(lastRefreshed).toLowerCase()}
        </p>
      )}
      {!lastRefreshed && <div className="mb-8" />}

      {!hydrated || loading ? (
        <p className={`${textMuted} text-sm`}>Loading...</p>
      ) : shoppingError ? (
        <div className={`${surfaceCard} border-coral/40 p-6 text-sm text-primary/80`}>
          <p>{shoppingError}</p>
        </div>
      ) : selectedMealCount === 0 ? (
        <div className={`${surfaceCard} p-6 text-sm text-primary/80`}>
          <p className="mb-3">
            Select up to 4 recipes on{' '}
            <Link href="/meals" className="underline font-medium">
              Meal Selection
            </Link>
            , then refresh here.
          </p>
        </div>
      ) : pantryOnlyMeals ? (
        <>
          <div className={`${surfaceCard} p-6 text-sm text-primary/80`}>
            <p>
              Your {selectedMealCount} selected meal
              {selectedMealCount === 1 ? '' : 's'} use only pantry ingredients — nothing
              fresh to buy.
            </p>
          </div>
          <UnusedInventorySection
            show={showUnusedInventory}
            unusedInventory={unusedInventory}
          />
        </>
      ) : allCovered ? (
        <>
          <div className={`${surfaceCard} p-6 text-sm text-primary/80`}>
            <p>
              You have everything in Fresh Inventory to make your {selectedMealCount} planned
              meal
              {selectedMealCount === 1 ? '' : 's'}. Nothing to buy.
            </p>
          </div>
          <UnusedInventorySection
            show={showUnusedInventory}
            unusedInventory={unusedInventory}
          />
        </>
      ) : (
        <>
          <p className={`text-sm text-primary/80 mb-4`}>
            {totalNeeded} item{totalNeeded === 1 ? '' : 's'} to pick up
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ShoppingColumn
              title="Fruit & Veg"
              items={list.produce}
              emptyMessage="All covered from your inventory."
            />
            <ShoppingColumn
              title="Meats"
              items={list.meat}
              emptyMessage="All covered from your inventory."
            />
          </div>
          <UnusedInventorySection
            show={showUnusedInventory}
            unusedInventory={unusedInventory}
          />
        </>
      )}
    </main>
  )
}
