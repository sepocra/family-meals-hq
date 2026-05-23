'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { getFreshInventory } from '../../lib/fresh-inventory'
import { shortenRecipeUrl } from '../../lib/recipe-url'
import { supabase } from '../../lib/supabase'
import { freshIngredientRefs } from '../../lib/match-recipes'
import {
  formatWeeklyMealsRefreshed,
  getSelectedMealIds,
  getStoredWeeklyMeals,
  MAX_WEEKLY_MEAL_SELECTIONS,
  rankRecipesByFreshInventory,
  setSelectedMealIds,
  setStoredWeeklyMeals,
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

  useEffect(() => {
    const stored = getStoredWeeklyMeals()
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
      setSelectedIds(getSelectedMealIds())
      setLastRefreshed(stored.generatedAt)
    }
    setHydrated(true)
  }, [])

  function toggleSelection(recipeId: string) {
    setSelectedIds((prev) => {
      const next = prev.includes(recipeId)
        ? prev.filter((id) => id !== recipeId)
        : prev.length >= MAX_WEEKLY_MEAL_SELECTIONS
          ? prev
          : [...prev, recipeId]
      setSelectedMealIds(next)
      return next
    })
  }

  function clearAllSelections() {
    setSelectedIds([])
    setSelectedMealIds([])
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
    const inventoryNames = getFreshInventory().map((item) => item.name)
    const ranked = rankRecipesByFreshInventory(recipes, inventoryNames)
    setRankedRecipes(ranked)
    setStoredWeeklyMeals(ranked)
    setSelectedIds(getSelectedMealIds())
    setLastRefreshed(new Date().toISOString())
    setRefreshing(false)
  }, [])

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
        All recipes from your bank, ranked by how many{' '}
        <Link href="/inventory" className="underline hover:text-gray-700 dark:hover:text-gray-200">
          Fresh Inventory
        </Link>{' '}
        items they use. Select up to {MAX_WEEKLY_MEAL_SELECTIONS} for your{' '}
        <Link href="/shopping" className="underline hover:text-gray-700 dark:hover:text-gray-200">
          shopping list
        </Link>
        .
      </p>
      {lastRefreshed && hasRecipes && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300 mb-1">
          <p>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {selectedIds.length} of {MAX_WEEKLY_MEAL_SELECTIONS}
            </span>{' '}
            selected
            {selectionFull ? ' (maximum reached)' : ''}
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
      )}
      {lastRefreshed && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-8">
          {formatWeeklyMealsRefreshed(lastRefreshed)}
        </p>
      )}
      {!lastRefreshed && <div className="mb-8" />}

      {!hydrated ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : refreshing ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading recipes...</p>
      ) : (
        <>
          {!hasRecipes && !lastRefreshed && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 text-sm text-gray-600 dark:text-gray-300 mb-6">
              <p className="mb-3">
                Tap <span className="font-medium">Refresh</span> to rank recipes from your bank
                against your fresh inventory.
              </p>
            </div>
          )}

          {!hasRecipes && lastRefreshed && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 text-sm text-gray-600 dark:text-gray-300 mb-6">
              <p className="mb-3">No recipes in your bank yet.</p>
              <Link
                href="/recipes"
                className="inline-block text-sm font-medium bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
              >
                Go to Recipe bank
              </Link>
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-3">
        {!refreshing &&
          rankedRecipes.map((recipe) => {
            const isSelected = selectedIds.includes(recipe.id)
            const canSelect = isSelected || !selectionFull

            return (
            <div
              key={recipe.id}
              className={`bg-white dark:bg-gray-900 border rounded-xl p-5 transition-colors ${
                isSelected
                  ? 'border-green-400 dark:border-green-600 ring-1 ring-green-400/30 dark:ring-green-600/30'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-start gap-3 mb-2">
                <button
                  type="button"
                  onClick={() => canSelect && toggleSelection(recipe.id)}
                  disabled={!canSelect}
                  aria-pressed={isSelected}
                  aria-label={
                    isSelected
                      ? `Remove ${recipe.name} from this week`
                      : `Add ${recipe.name} to this week`
                  }
                  className={`shrink-0 mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-green-600 border-green-600 text-white dark:bg-green-500 dark:border-green-500'
                      : canSelect
                        ? 'border-gray-300 dark:border-gray-500 hover:border-gray-400 dark:hover:border-gray-400'
                        : 'border-gray-200 dark:border-gray-700 opacity-40 cursor-not-allowed'
                  }`}
                >
                  {isSelected && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path
                        d="M2.5 6l2.5 2.5 4.5-5"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {recipe.name}
                  </h2>
                  {recipe.effort_level && (
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                        effortBadgeClass[recipe.effort_level.toLowerCase()] ??
                        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {effortLabel(recipe.effort_level)}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {recipe.score}
                </span>{' '}
                fresh inventory item{recipe.score === 1 ? '' : 's'} used
                <span className="text-gray-400 dark:text-gray-500">
                  {' '}
                  · {recipe.freshRequiredCount} fresh ingredient
                  {recipe.freshRequiredCount === 1 ? '' : 's'} required
                </span>
              </p>

              <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500 mb-2">
                {recipe.prep_minutes != null && (
                  <span>⏱ {recipe.prep_minutes} min prep</span>
                )}
                {recipe.cook_minutes != null && (
                  <span>🔥 {recipe.cook_minutes} min cook</span>
                )}
              </div>

              {recipe.source_url && (
                <a
                  href={recipe.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2 truncate inline-block max-w-full"
                  title={recipe.source_url}
                >
                  {shortenRecipeUrl(recipe.source_url)}
                </a>
              )}
            </div>
            )
          })}
      </div>
    </main>
  )
}
