'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MealTypeFilterBar } from '../../components/MealTypeFilterBar'
import { mealTypeBadgeClasses } from '../../lib/recipe-tags'
import { recipeMatchesMealTypeFilter } from '../../lib/recipe-meal-type-filter'
import { sanitizeRecipeSourceUrl, shortenRecipeUrl } from '../../lib/recipe-url'
import { getAuthUserId } from '../../lib/auth-user'
import { btnPrimary, linkAccent, pageTitleAccent, surfaceCard, textMuted } from '../../lib/brand-classes'
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
  formatFreshInventoryMatch,
  formatWeeklyMealsRefreshed,
  MAX_WEEKLY_MEAL_SELECTIONS,
  rankRecipesByFreshInventory,
  type StoredWeeklyMeals,
  type WeeklyMealSuggestion,
} from '../../lib/weekly-meals'

function weeklyMealsFromStored(stored: StoredWeeklyMeals) {
  const suggestions = stored.suggestions.map((r) => ({
    ...r,
    freshIngredients: r.freshIngredients ?? [],
    freshRequiredCount:
      r.freshRequiredCount ??
      r.freshIngredients?.length ??
      r.ingredientNames?.length ??
      0,
    produceMatched: r.produceMatched ?? 0,
    meatMatched: r.meatMatched ?? 0,
    produceRequired: r.produceRequired ?? 0,
    meatRequired: r.meatRequired ?? 0,
  }))
  const validIds = new Set(suggestions.map((r) => r.id))
  return {
    suggestions,
    selectedIds: (stored.selectedIds ?? []).filter((id) => validIds.has(id)),
    generatedAt: stored.generatedAt,
  }
}

type RecipeRow = {
  id: string
  name: string
  prep_minutes: number | null
  cook_minutes: number | null
  dietary_tags: string[]
  meal_types?: string[]
  source_url: string | null
  recipe_ingredients?: {
    quantity: string
    ingredients:
      | {
          name: string
          category: string | null
        }
      | {
          name: string
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
      category: meta?.category ?? null,
    }
  })
  const freshIngredients = freshIngredientRefs(refs)

  return {
    id: row.id,
    name: row.name,
    prep_minutes: row.prep_minutes,
    cook_minutes: row.cook_minutes,
    dietary_tags: row.dietary_tags ?? [],
    meal_types: row.meal_types ?? [],
    source_url: row.source_url,
    ingredientNames: freshIngredients.map((i) => i.name),
    freshIngredients,
  }
}

type MealsPageClientProps = {
  initialWeeklyMeals?: StoredWeeklyMeals | null
}

export default function ThisWeeksMealsPage({
  initialWeeklyMeals,
}: MealsPageClientProps = {}) {
  const initial = initialWeeklyMeals
    ? weeklyMealsFromStored(initialWeeklyMeals)
    : null

  const [rankedRecipes, setRankedRecipes] = useState<WeeklyMealSuggestion[]>(
    () => initial?.suggestions ?? []
  )
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => initial?.selectedIds ?? []
  )
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(
    () => initial?.generatedAt ?? null
  )
  const [refreshing, setRefreshing] = useState(false)
  const [expandedRecipeIds, setExpandedRecipeIds] = useState<Set<string>>(() => new Set())
  const [mealTypeFilter, setMealTypeFilter] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(initialWeeklyMeals !== undefined)
  const [weeklySnapshot, setWeeklySnapshot] = useState<{
    generatedAt: string
    suggestions: WeeklyMealSuggestion[]
  } | null>(() =>
    initial
      ? { generatedAt: initial.generatedAt, suggestions: initial.suggestions }
      : null
  )

  useEffect(() => {
    if (initialWeeklyMeals !== undefined) return

    fetchUserWeeklyMeals(supabase)
      .then((stored) => {
        if (!stored) return
        const parsed = weeklyMealsFromStored(stored)
        setRankedRecipes(parsed.suggestions)
        setSelectedIds(parsed.selectedIds)
        setLastRefreshed(parsed.generatedAt)
        setWeeklySnapshot({
          generatedAt: parsed.generatedAt,
          suggestions: parsed.suggestions,
        })
      })
      .catch(console.error)
      .finally(() => setHydrated(true))
  }, [initialWeeklyMeals])

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

  function toggleExpandedRecipe(recipeId: string) {
    setExpandedRecipeIds((prev) => {
      const next = new Set(prev)
      if (next.has(recipeId)) next.delete(recipeId)
      else next.add(recipeId)
      return next
    })
  }

  const refreshMeals = useCallback(async () => {
    setRefreshing(true)

    let userId: string
    try {
      userId = await getAuthUserId(supabase)
    } catch {
      setRefreshing(false)
      return
    }

    const { data, error } = await supabase
      .from('recipes')
      .select(`
        id,
        name,
        prep_minutes,
        cook_minutes,
        dietary_tags,
        meal_types,
        source_url,
        recipe_ingredients (
          quantity,
          ingredients (
            name,
            category
          )
        )
      `)
      .eq('user_id', userId)

    if (error) {
      console.error(error)
      setRefreshing(false)
      return
    }

    const recipes = (data ?? []).map(toRecipeForMatching)
    let inventoryForMatch: { name: string; category: 'produce' | 'meat' }[] = []
    try {
      const inventory = await fetchUserFreshInventory(supabase)
      inventoryForMatch = inventory.map((item) => ({
        name: item.name,
        category: item.category,
      }))
    } catch (err) {
      console.error(err)
    }

    const ranked = rankRecipesByFreshInventory(recipes, inventoryForMatch)
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

  const filteredRankedRecipes = useMemo(
    () =>
      rankedRecipes.filter((r) =>
        recipeMatchesMealTypeFilter(r.meal_types, mealTypeFilter)
      ),
    [rankedRecipes, mealTypeFilter]
  )

  const hasRecipes = rankedRecipes.length > 0
  const hasVisibleRecipes = filteredRankedRecipes.length > 0
  const selectionFull = selectedIds.length >= MAX_WEEKLY_MEAL_SELECTIONS

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className={`text-2xl font-semibold text-primary ${pageTitleAccent}`}>
          Meal Selection
        </h1>
        <button
          type="button"
          onClick={refreshMeals}
          disabled={refreshing}
          className={`shrink-0 ${btnPrimary} px-4 py-2 disabled:opacity-50`}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <p className={`text-sm ${textMuted} mb-2`}>
        Recipes ranked by what&apos;s in{' '}
        <Link href="/inventory" className={linkAccent}>
          Fresh Inventory
        </Link>
        , with meat matches first. Select up to {MAX_WEEKLY_MEAL_SELECTIONS} for your{' '}
        <Link href="/shopping" className={linkAccent}>
          shopping list
        </Link>
        .
      </p>
      {lastRefreshed && (
        <p className={`text-xs ${textMuted} mb-8`}>
          {formatWeeklyMealsRefreshed(lastRefreshed)}
        </p>
      )}
      {!lastRefreshed && <div className="mb-8" />}

      {!hydrated ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : !hasRecipes ? (
        <div className={`${surfaceCard} p-6 text-sm text-primary/80`}>
          <p className="mb-3">
            Add recipes to your bank, then tap Refresh to rank them against your inventory.
          </p>
          <Link href="/recipes" className="underline font-medium">
            Go to Recipe bank
          </Link>
        </div>
      ) : !hasVisibleRecipes ? (
        <div className={`${surfaceCard} p-6 text-sm text-primary/80`}>
          <p className="mb-3">
            No ranked recipes match the selected meal types. Choose &ldquo;All&rdquo; or
            another filter.
          </p>
          <MealTypeFilterBar
            selected={mealTypeFilter}
            onChange={setMealTypeFilter}
          />
        </div>
      ) : (
        <>
          <MealTypeFilterBar
            selected={mealTypeFilter}
            onChange={setMealTypeFilter}
            className="mb-4"
          />
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
            {filteredRankedRecipes.map((recipe) => {
              const selected = selectedIds.includes(recipe.id)
              const disabled = !selected && selectionFull
              const produceUsed = recipe.produceMatched ?? 0
              const meatUsed = recipe.meatMatched ?? 0
              const displaySourceUrl = sanitizeRecipeSourceUrl(recipe.source_url)
              const isExpanded = expandedRecipeIds.has(recipe.id)
              const freshLines =
                recipe.freshIngredients?.length > 0
                  ? recipe.freshIngredients.map((item) => {
                      const quantity = item.quantity?.trim() || ''
                      const name = item.name?.trim() || ''
                      return quantity ? `${quantity} ${name}` : name
                    })
                  : (recipe.ingredientNames ?? [])

              return (
                <div
                  key={recipe.id}
                  className={`${surfaceCard} p-5 transition-colors cursor-pointer ${
                    selected
                      ? 'border-coral ring-1 ring-coral'
                      : 'hover:border-muted'
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpandedRecipe(recipe.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleExpandedRecipe(recipe.id)
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleSelection(recipe.id)}
                      onClick={(e) => e.stopPropagation()}
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
                      </div>
                      {displaySourceUrl && (
                        <a
                          href={displaySourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2 mb-2 inline-block max-w-full truncate"
                          title={displaySourceUrl}
                        >
                          {shortenRecipeUrl(displaySourceUrl)}
                        </a>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        <span>
                          {formatFreshInventoryMatch(produceUsed, meatUsed)}
                        </span>
                        {recipe.prep_minutes != null && (
                          <span>⏱ {recipe.prep_minutes} min prep</span>
                        )}
                        {recipe.cook_minutes != null && (
                          <span>🔥 {recipe.cook_minutes} min cook</span>
                        )}
                      </div>
                      {((recipe.meal_types?.length ?? 0) > 0 ||
                        (recipe.dietary_tags?.length ?? 0) > 0) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(recipe.meal_types ?? []).map((tag) => (
                            <span
                              key={`meal-${tag}`}
                              className={`text-xs rounded-full px-2 py-0.5 border ${mealTypeBadgeClasses(tag)}`}
                            >
                              {tag}
                            </span>
                          ))}
                          {recipe.dietary_tags?.map((tag) => (
                            <span
                              key={`diet-${tag}`}
                              className="text-xs bg-green-50 text-green-700 border border-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800 rounded-full px-2 py-0.5"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {isExpanded && (
                        <div className="mt-3 rounded-xl border border-border bg-surface px-3 py-2.5">
                          <p className="text-xs font-medium text-primary mb-1.5">
                            Fresh ingredients needed
                          </p>
                          {freshLines.length > 0 ? (
                            <ul className="text-xs text-muted space-y-1">
                              {freshLines.map((line, index) => (
                                <li key={`${recipe.id}-fresh-${index}`}>{line}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted">No fresh ingredients listed.</p>
                          )}
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
