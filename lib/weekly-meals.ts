import {
  pickWeeklyMeals,
  rankRecipesByFreshInventory,
  type RankedRecipe,
  type RecipeForMatching,
} from './match-recipes'

const STORAGE_KEY = 'family-meals-weekly-suggestions'

export type WeeklyMealSuggestion = RankedRecipe

export type StoredWeeklyMeals = {
  generatedAt: string
  suggestions: WeeklyMealSuggestion[]
  selectedIds?: string[]
}

export function getStoredWeeklyMeals(): StoredWeeklyMeals | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredWeeklyMeals
    if (!parsed?.suggestions || !Array.isArray(parsed.suggestions)) return null
    return parsed
  } catch {
    return null
  }
}

function writeStored(payload: StoredWeeklyMeals): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function setStoredWeeklyMeals(
  suggestions: WeeklyMealSuggestion[],
  generatedAt?: string
): void {
  const existing = getStoredWeeklyMeals()
  const validIds = new Set(suggestions.map((s) => s.id))
  const selectedIds = (existing?.selectedIds ?? []).filter((id) => validIds.has(id))

  writeStored({
    generatedAt: generatedAt ?? new Date().toISOString(),
    suggestions,
    selectedIds,
  })
}

export function setSelectedMealIds(selectedIds: string[]): void {
  const stored = getStoredWeeklyMeals()
  if (!stored) return

  const validIds = new Set(stored.suggestions.map((s) => s.id))
  const next = [...new Set(selectedIds)].filter((id) => validIds.has(id))

  writeStored({ ...stored, selectedIds: next })
}

export function getSelectedMealIds(): string[] {
  const stored = getStoredWeeklyMeals()
  if (!stored?.selectedIds) return []
  const validIds = new Set(stored.suggestions.map((s) => s.id))
  return stored.selectedIds.filter((id) => validIds.has(id))
}

/** Recipes the user chose for this week — drives the shopping list. */
export function getMealsForShopping(): WeeklyMealSuggestion[] {
  const stored = getStoredWeeklyMeals()
  if (!stored) return []

  const byId = new Map(stored.suggestions.map((s) => [s.id, s]))
  return getSelectedMealIds()
    .map((id) => byId.get(id))
    .filter((r): r is WeeklyMealSuggestion => r != null)
}

export function formatFreshInventoryMatch(produceMatched: number, meatMatched: number): string {
  const parts: string[] = []
  if (produceMatched > 0) parts.push(`${produceMatched} fruit/veg`)
  if (meatMatched > 0) parts.push(`${meatMatched} meat`)
  if (parts.length === 0) return 'nothing in stock'
  return `${parts.join(' · ')} in stock`
}

export function formatWeeklyMealsRefreshed(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Updated today at ${time}`
  return `Updated ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${time}`
}

export { pickWeeklyMeals, rankRecipesByFreshInventory }
export type { RecipeForMatching }
