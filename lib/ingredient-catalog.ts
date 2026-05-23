import type { SupabaseClient } from '@supabase/supabase-js'
import {
  extractRecipeNameCandidates,
  ingredientsMatchExactly,
  recipeContainsPhrase,
} from './ingredient-match'

export type CatalogIngredient = {
  id: string
  name: string
  category: string | null
  pantry_type: string | null
}

const APPROVED_MULTIPLE_SPLIT = /\s*\/\s*|\s+and\/or\s+/gi

export function isPantryCategory(category: string | null | undefined): boolean {
  return (category ?? '').toLowerCase() === 'pantry'
}

export function isMeatCategory(category: string | null | undefined): boolean {
  const c = (category ?? '').toLowerCase()
  return c === 'meat' || c === 'protein'
}

export function isFreshCategory(category: string | null | undefined): boolean {
  const c = (category ?? '').toLowerCase()
  return c === 'fresh' || c === 'vegetable'
}

/** Segments from the ingredients.name column (full name + approved multiples). */
export function approvedNameSegments(catalogName: string): string[] {
  const normalized = catalogName.trim().toLowerCase()
  const parts = normalized
    .split(APPROVED_MULTIPLE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set(parts)]
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function namesEquivalent(a: string, b: string): boolean {
  if (a === b) return true
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (longer === `${shorter}s` || longer === `${shorter}es`) return true
  if (shorter.endsWith('y') && longer === `${shorter.slice(0, -1)}ies`) return true
  return false
}

/** Catalog name (or an approved multiple) appears in the recipe line. */
export function phraseContainedInRecipe(
  recipeLine: string,
  phrase: string
): boolean {
  const phraseNorm = phrase.trim().toLowerCase()
  if (!phraseNorm) return false

  const recipe = recipeLine.trim().toLowerCase()
  if (recipeContainsPhrase(recipe, phraseNorm)) return true

  const boundaryPattern = new RegExp(
    `(?:^|[\\s,;()\\[\\]—–-])${escapeRegex(phraseNorm)}(?:$|[\\s,;()\\[\\]—–-])`,
    'i'
  )
  if (boundaryPattern.test(recipe)) return true

  for (const candidate of extractRecipeNameCandidates(recipeLine)) {
    if (recipeContainsPhrase(candidate, phraseNorm)) return true
    if (namesEquivalent(candidate, phraseNorm)) return true
    if (candidate === phraseNorm) return true
  }

  return false
}

export function catalogEntryMatchesRecipeLine(
  recipeLine: string,
  catalogName: string
): boolean {
  if (phraseContainedInRecipe(recipeLine, catalogName)) return true

  for (const segment of approvedNameSegments(catalogName)) {
    if (segment !== catalogName.trim().toLowerCase()) {
      if (phraseContainedInRecipe(recipeLine, segment)) return true
    }
  }

  return false
}

function matchScore(recipeLine: string, catalogName: string): number {
  if (!catalogEntryMatchesRecipeLine(recipeLine, catalogName)) return 0

  let best = 0
  for (const segment of approvedNameSegments(catalogName)) {
    if (phraseContainedInRecipe(recipeLine, segment)) {
      best = Math.max(best, segment.length)
    }
  }
  return best
}

/** Best matching row from the ingredients table, or null if none. */
export function findCatalogMatch(
  recipeLine: string,
  catalog: CatalogIngredient[]
): CatalogIngredient | null {
  const trimmed = recipeLine.trim()
  if (!trimmed) return null

  let best: CatalogIngredient | null = null
  let bestScore = 0

  for (const entry of catalog) {
    const score = matchScore(trimmed, entry.name)
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }

  return best
}

export function isPantryFromCatalog(entry: CatalogIngredient): boolean {
  return isPantryCategory(entry.category)
}

export type ClassifiedIngredientRow = {
  /** Recipe line text as entered/imported. */
  name: string
  /** Canonical bank name when matched (for hints / matching only). */
  catalogName: string | null
  catalogId: string | null
  isPantry: boolean
  matchError: string | null
}

export function classifyIngredientLine(
  recipeLine: string,
  catalog: CatalogIngredient[]
): ClassifiedIngredientRow {
  const trimmed = recipeLine.trim()
  if (!trimmed) {
    return {
      catalogId: null,
      name: '',
      catalogName: null,
      isPantry: false,
      matchError: null,
    }
  }

  const match = findCatalogMatch(trimmed, catalog)
  if (!match) {
    const hint =
      extractRecipeNameCandidates(trimmed)[0] ?? trimmed
    return {
      catalogId: null,
      name: trimmed,
      catalogName: null,
      isPantry: false,
      matchError: `Not in ingredient bank — "${hint}" is not in the master list.`,
    }
  }

  return {
    catalogId: match.id,
    name: trimmed,
    catalogName: match.name,
    isPantry: isPantryFromCatalog(match),
    matchError: null,
  }
}

export function classifyIngredientRows(
  rows: { name: string; quantity: string; lineText?: string }[],
  catalog: CatalogIngredient[]
): Array<{
  name: string
  quantity: string
  importLineText: string | null
  catalogName: string | null
  isPantry: boolean
  catalogId: string | null
  matchError: string | null
}> {
  return rows.map((row) => {
    const importLineText = row.lineText?.trim() || null
    const matchText = importLineText || row.name.trim()
    const classified = classifyIngredientLine(matchText, catalog)
    return {
      name: importLineText || row.name.trim(),
      quantity: row.quantity,
      importLineText,
      catalogName: classified.catalogName,
      isPantry: classified.isPantry,
      catalogId: classified.catalogId,
      matchError: classified.matchError,
    }
  })
}

export const INGREDIENT_BANK_CATEGORIES = [
  { value: 'pantry', label: 'pantry' },
  { value: 'fresh', label: 'fresh' },
  { value: 'meat', label: 'meat' },
] as const

export type IngredientBankCategory =
  (typeof INGREDIENT_BANK_CATEGORIES)[number]['value']

export function suggestIngredientBankName(recipeLine: string): string {
  const trimmed = recipeLine.trim()
  if (!trimmed) return ''
  return extractRecipeNameCandidates(trimmed)[0] ?? trimmed
}

function dbFieldsForBankCategory(category: IngredientBankCategory): {
  category: string
  pantry_type: string
} {
  switch (category) {
    case 'pantry':
      return { category: 'pantry', pantry_type: 'always' }
    case 'meat':
      return { category: 'meat', pantry_type: 'explicit' }
    case 'fresh':
      return { category: 'fresh', pantry_type: 'explicit' }
  }
}

export async function createIngredientInBank(
  supabase: SupabaseClient,
  name: string,
  category: IngredientBankCategory
): Promise<{ ingredient: CatalogIngredient } | { error: string }> {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) return { error: 'Ingredient name is required.' }

  const { data, error } = await supabase
    .from('ingredients')
    .insert({
      name: trimmed,
      ...dbFieldsForBankCategory(category),
    })
    .select('id, name, category, pantry_type')
    .single()

  if (error) {
    return { error: error.message ?? 'Failed to add ingredient to bank.' }
  }
  if (!data) return { error: 'Failed to add ingredient to bank.' }

  return { ingredient: data }
}

export async function fetchIngredientCatalog(
  supabase: SupabaseClient
): Promise<CatalogIngredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, name, category, pantry_type')
    .order('name')

  if (error) throw error
  return data ?? []
}

/** For inventory ↔ recipe matching using catalog canonical names. */
export function recipeLineMatchesInventory(
  inventoryName: string,
  recipeLine: string,
  catalog: CatalogIngredient[]
): boolean {
  const match = findCatalogMatch(recipeLine, catalog)
  if (!match) return ingredientsMatchExactly(inventoryName, recipeLine)
  return (
    ingredientsMatchExactly(inventoryName, match.name) ||
    approvedNameSegments(match.name).some((seg) =>
      ingredientsMatchExactly(inventoryName, seg)
    )
  )
}
