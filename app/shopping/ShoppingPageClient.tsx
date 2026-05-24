'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { FreshInventoryItem } from '../../lib/fresh-inventory'
import {
  buildShoppingList,
  buildUnusedInventory,
  type ShoppingListByCategory,
} from '../../lib/shopping-list'
import { fetchFreshIngredientsForRecipes } from '../../lib/shopping-meals'
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

export default function ShoppingListPage() {
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<ShoppingListByCategory>({ produce: [], meat: [] })
  const [unusedInventory, setUnusedInventory] = useState<ShoppingListByCategory>({
    produce: [],
    meat: [],
  })
  const [selectedMealCount, setSelectedMealCount] = useState(0)
  const [loadedMealCount, setLoadedMealCount] = useState(0)
  const [totalFreshLines, setTotalFreshLines] = useState(0)
  const [shoppingError, setShoppingError] = useState<string | null>(null)
  const [pantryOnlyMeals, setPantryOnlyMeals] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)

  const recompute = useCallback(async () => {
    setLoading(true)
    setShoppingError(null)
    setPantryOnlyMeals(false)

    let stored = null
    try {
      stored = await fetchUserWeeklyMeals(supabase)
    } catch (err) {
      console.error(err)
    }

    let inventory: FreshInventoryItem[] = []
    try {
      inventory = await fetchUserFreshInventory(supabase)
    } catch (err) {
      console.error(err)
    }

    const selectedIds = stored?.selectedIds ?? []

    if (!stored?.suggestions.length) {
      setList({ produce: [], meat: [] })
      setUnusedInventory({ produce: [], meat: [] })
      setSelectedMealCount(0)
      setLoadedMealCount(0)
      setTotalFreshLines(0)
      setLastRefreshed(null)
      setLoading(false)
      return
    }

    if (selectedIds.length === 0) {
      setList({ produce: [], meat: [] })
      setUnusedInventory({ produce: [], meat: [] })
      setSelectedMealCount(0)
      setLoadedMealCount(0)
      setTotalFreshLines(0)
      setLastRefreshed(stored.generatedAt)
      setLoading(false)
      return
    }

    setSelectedMealCount(selectedIds.length)
    setLastRefreshed(stored.generatedAt)

    try {
      const recipes = await fetchFreshIngredientsForRecipes(supabase, selectedIds)
      const loadedCount = recipes.length
      const freshLineCount = recipes.reduce(
        (sum, r) => sum + r.freshIngredients.length,
        0
      )

      setLoadedMealCount(loadedCount)
      setTotalFreshLines(freshLineCount)

      const mealsForShopping = recipes.map((r) => ({
        freshIngredients: r.freshIngredients,
      }))
      setUnusedInventory(buildUnusedInventory(mealsForShopping, inventory))

      if (loadedCount === 0) {
        setList({ produce: [], meat: [] })
        setShoppingError(
          'Selected meals are not in your recipe bank. Open This Week\'s Meals, clear selections, refresh suggestions, and pick your own recipes.'
        )
        setLoading(false)
        return
      }

      if (freshLineCount === 0) {
        setList({ produce: [], meat: [] })
        setPantryOnlyMeals(true)
        setLoading(false)
        return
      }

      setList(buildShoppingList(mealsForShopping, inventory))
    } catch (err) {
      console.error(err)
      setList({ produce: [], meat: [] })
      setUnusedInventory({ produce: [], meat: [] })
      setLoadedMealCount(0)
      setTotalFreshLines(0)
      setShoppingError('Could not load ingredients for selected meals.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    recompute()
    setHydrated(true)
  }, [recompute])

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
