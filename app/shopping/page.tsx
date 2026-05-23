'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { FreshInventoryItem } from '../../lib/fresh-inventory'
import { buildShoppingList, type ShoppingListByCategory } from '../../lib/shopping-list'
import { fetchFreshIngredientsForRecipes } from '../../lib/shopping-meals'
import { fetchUserFreshInventory } from '../../lib/user-inventory-db'
import { fetchUserWeeklyMeals } from '../../lib/user-weekly-meals-db'
import { supabase } from '../../lib/supabase'
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
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 min-h-[160px]">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item}
              className="text-sm text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ShoppingListPage() {
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<ShoppingListByCategory>({ produce: [], meat: [] })
  const [mealCount, setMealCount] = useState(0)
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)

  const recompute = useCallback(async () => {
    setLoading(true)
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
      setMealCount(0)
      setLastRefreshed(null)
      setLoading(false)
      return
    }

    if (selectedIds.length === 0) {
      setList({ produce: [], meat: [] })
      setMealCount(0)
      setLastRefreshed(stored.generatedAt)
      setLoading(false)
      return
    }

    try {
      const recipes = await fetchFreshIngredientsForRecipes(supabase, selectedIds)
      const mealsForShopping = recipes.map((r) => ({
        freshIngredients: r.freshIngredients,
      }))
      setMealCount(mealsForShopping.length)
      setLastRefreshed(stored.generatedAt)
      setList(buildShoppingList(mealsForShopping, inventory))
    } catch (err) {
      console.error(err)
      setList({ produce: [], meat: [] })
      setMealCount(0)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    recompute()
    setHydrated(true)
  }, [recompute])

  const totalNeeded = list.produce.length + list.meat.length
  const allCovered = mealCount > 0 && totalNeeded === 0

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Shopping List
        </h1>
        <button
          type="button"
          onClick={recompute}
          disabled={loading}
          className="shrink-0 text-sm font-medium bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Fresh fruit, veg and meat still needed for the meals you selected (up to 4) on{' '}
        <Link href="/meals" className="underline hover:text-gray-700 dark:hover:text-gray-200">
          This Week&apos;s Meals
        </Link>
        . Uses pantry and category from your recipe bank. After what you have in{' '}
        <Link
          href="/inventory"
          className="underline hover:text-gray-700 dark:hover:text-gray-200"
        >
          Fresh Inventory
        </Link>
        .
      </p>
      {lastRefreshed && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-8">
          Based on meals {formatWeeklyMealsRefreshed(lastRefreshed).toLowerCase()}
        </p>
      )}
      {!lastRefreshed && <div className="mb-8" />}

      {!hydrated || loading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : mealCount === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 text-sm text-gray-600 dark:text-gray-300">
          <p className="mb-3">
            Select up to 4 recipes on{' '}
            <Link href="/meals" className="underline font-medium">
              This Week&apos;s Meals
            </Link>
            , then refresh here.
          </p>
        </div>
      ) : allCovered ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 text-sm text-gray-600 dark:text-gray-300">
          <p>
            You have everything in Fresh Inventory to make your {mealCount} planned meal
            {mealCount === 1 ? '' : 's'}. Nothing to buy.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
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
        </>
      )}
    </main>
  )
}
