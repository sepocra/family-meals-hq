'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { shortenRecipeUrl } from '../../lib/recipe-url'
import { supabase } from '../../lib/supabase'
import { freshIngredientRefs } from '../../lib/match-recipes'
import {
  fetchUserFreshInventory,
} from '../../lib/user-inventory-db'
import {
  fetchUserWeeklyMeals,
  saveUserWeeklyMeals,
} from '../../lib/user-weekly-meals-db'
import {
  formatWeeklyMealsRefreshed,
  MAX_WEEKLY_MEAL_SELECTIONS,
  rankRecipesByFreshInventory,
  type WeeklyMealSuggestion,
} from '../../lib/weekly-meals'

const EFFORT_LABELS: Record<string, string> = {
  low: 'Easy',
  medium: 'Medium',
  high: 'Hard',
}

function effortLabel(level: string): string {
  const key = level.toLowerCase()
  return EFFORT_LABELS[key] ?? level
}

const effortBadgeClass: Record<string, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

type RecipeRow = {
  id: string
  name: string
  effort_level: string
  prep_minutes: number | null
  cook_minutes: number | null
  dietary_tags: string[]
  source_url: string | null
  recipe_ingredients?: {
    quantity: string
    ingredients:
      | {
          name: string
          pantry_type: string | null
          category: string | null
        }
      | {
          name: string
          pantry_type: string | null
          category: string | null
        }[]
      | null
  }[]
}

function toRecipeForMatching(row: RecipeRow) {
  const refs = (row.recipe_ingredients ?? []).map((ri) => {
    const ing = ri.ingredients
    const meta = Array.isArray(ing) ? ing[0] : ing
    return {
      name: meta?.name ?? '',
      quantity: ri.quantity?.trim() || null,
      pantry_type: meta?.pantry_type ?? null,
      category: meta?.category ?? null,
    }
  })
  const freshIngredients = freshIngredientRefs(refs)

  return {
    id: row.id,
    name: row.name,
    effort_level: row.effort_level,
    prep_minutes: row.prep_minutes,
    cook_minutes: row.cook_minutes,
    dietary_tags: row.dietary_tags ?? [],
    source_url: row.source_url,
    ingredientNames: freshIngredients.map((i) => i.name),
    freshIngredients,
  }
}

export default function ThisWeeksMealsPage() {
  const [rankedRecipes, setRankedRecipes] = useState<WeeklyMealSuggestion[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [weeklySnapshot, setWeeklySnapshot] = useState<{
    generatedAt: string
    suggestions: WeeklyMealSuggestion[]
  } | null>(null)

  useEffect(() => {
    fetchUserWeeklyMeals(supabase)
      .then((stored) => {
        if (stored) {
          setRankedRecipes(
            stored.suggestions.map((r) => ({
              ...r,
              freshIngredients: r.freshIngredients ?? [],
              freshRequiredCount:
                r.freshRequiredCount ??
                r.freshIngredients?.length ??
                r.ingredientNames?.length ??
                0,
            }))
          )
          setSelectedIds(stored.selectedIds ?? [])
          setLastRefreshed(stored.generatedAt)
          setWeeklySnapshot({
            generatedAt: stored.generatedAt,
            suggestions: stored.suggestions,
          })
        }
      })
      .catch(console.error)
      .finally(() => setHydrated(true))
  }, [])

  async function persistSelections(nextIds: string[], snapshot = weeklySnapshot) {
    if (!snapshot) return
    await saveUserWeeklyMeals(supabase, {
      generatedAt: snapshot.generatedAt,
      suggestions: snapshot.suggestions,
      selectedIds: nextIds,
    })
  }

  function toggleSelection(recipeId: string) {
    setSelectedIds((prev) => {
      const next = prev.includes(recipeId)
        ? prev.filter((id) => id !== recipeId)
        : prev.length >= MAX_WEEKLY_MEAL_SELECTIONS
          ? prev
          : [...prev, recipeId]
      void persistSelections(next)
      return next
    })
  }

  function clearAllSelections() {
    setSelectedIds([])
    void persistSelections([])
  }

  const refreshMeals = useCallback(async () => {
    setRefreshing(true)

    const { data, error } = await supabase
      .from('recipes')
      .select(`
        id,
        name,
        effort_level,
        prep_minutes,
        cook_minutes,
        dietary_tags,
        source_url,
        recipe_ingredients (
          quantity,
          ingredients (
            name,
            pantry_type,
            category
          )
        )
      `)

    if (error) {
      console.error(error)
      setRefreshing(false)
      return
    }

    const recipes = (data ?? []).map(toRecipeForMatching)
    let inventoryNames: string[] = []
    try {
      const inventory = await fetchUserFreshInventory(supabase)
      inventoryNames = inventory.map((item) => item.name)
    } catch (err) {
      console.error(err)
    }

    const ranked = rankRecipesByFreshInventory(recipes, inventoryNames)
    const generatedAt = new Date().toISOString()
    setRankedRecipes(ranked)
    setLastRefreshed(generatedAt)
    const snapshot = { generatedAt, suggestions: ranked }
    setWeeklySnapshot(snapshot)
    const validIds = new Set(ranked.map((r) => r.id))
    const kept = selectedIds.filter((id) => validIds.has(id))
    setSelectedIds(kept)
    try {
      await saveUserWeeklyMeals(supabase, {
        ...snapshot,
        selectedIds: kept,
      })
    } catch (err) {
      console.error(err)
    }
    setRefreshing(false)
  }, [selectedIds])

  const hasRecipes = rankedRecipes.length > 0
  const selectionFull = selectedIds.length >= MAX_WEEKLY_MEAL_SELECTIONS

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          This Week&apos;s Meals
        </h1>
        <button
          type="button"
          onClick={refreshMeals}
          disabled={refreshing}
          className="shrink-0 text-sm font-medium bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        All your recipes ranked by how much they use what&apos;s in{' '}
        <Link href="/inventory" className="underline hover:text-gray-700 dark:hover:text-gray-200">
          Fresh Inventory
        </Link>
        . Select up to {MAX_WEEKLY_MEAL_SELECTIONS} for your{' '}
        <Link href="/shopping" className="underline hover:text-gray-700 dark:hover:text-gray-200">
          shopping list
        </Link>
        .
      </p>
      {lastRefreshed && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-8">
          {formatWeeklyMealsRefreshed(lastRefreshed)}
        </p>
      )}
      {!lastRefreshed && <div className="mb-8" />}

      {!hydrated ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : !hasRecipes ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 text-sm text-gray-600 dark:text-gray-300">
          <p className="mb-3">
            Add recipes to your bank, then tap Refresh to rank them against your inventory.
          </p>
          <Link href="/recipes" className="underline font-medium">
            Go to Recipe bank
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {selectedIds.length} of {MAX_WEEKLY_MEAL_SELECTIONS} selected for shopping
            </p>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={clearAllSelections}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2"
              >
                Clear selection
              </button>
            )}
          </div>
          {selectionFull && (
            <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2 mb-4">
              Maximum {MAX_WEEKLY_MEAL_SELECTIONS} meals selected. Deselect one to choose another.
            </p>
          )}
          <div className="flex flex-col gap-3">
            {rankedRecipes.map((recipe) => {
              const selected = selectedIds.includes(recipe.id)
              const disabled = !selected && selectionFull
              const freshCount =
                recipe.freshRequiredCount ??
                recipe.freshIngredients?.length ??
                recipe.ingredientNames.length

              return (
                <div
                  key={recipe.id}
                  className={`bg-white dark:bg-gray-900 border rounded-xl p-5 transition-colors ${
                    selected
                      ? 'border-gray-900 dark:border-gray-100 ring-1 ring-gray-900 dark:ring-gray-100'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleSelection(recipe.id)}
                      className="mt-1 shrink-0 rounded border-gray-300 dark:border-gray-600 disabled:opacity-40"
                      aria-label={
                        selected
                          ? `Remove ${recipe.name} from this week`
                          : `Add ${recipe.name} to this week`
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          {recipe.name}
                        </h2>
                        {recipe.effort_level && (
                          <span
                            className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${effortBadgeClass[recipe.effort_level.toLowerCase()] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
                          >
                            {effortLabel(recipe.effort_level)}
                          </span>
                        )}
                      </div>
                      {recipe.source_url && (
                        <a
                          href={recipe.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2 mb-2 inline-block max-w-full truncate"
                          title={recipe.source_url}
                        >
                          {shortenRecipeUrl(recipe.source_url)}
                        </a>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          {recipe.score} of {freshCount} fresh ingredients in stock
                        </span>
                        {recipe.prep_minutes != null && (
                          <span>⏱ {recipe.prep_minutes} min prep</span>
                        )}
                        {recipe.cook_minutes != null && (
                          <span>🔥 {recipe.cook_minutes} min cook</span>
                        )}
                      </div>
                      {recipe.dietary_tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {recipe.dietary_tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-green-50 text-green-700 border border-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800 rounded-full px-2 py-0.5"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
