import {
  isFreshCategory,
  isMeatCategory,
  isPantryCategory,
} from './ingredient-catalog'
import { categoryForIngredientName, type InventoryCategory } from './ingredient-category'

/** Metadata from the ingredients table. */
export type IngredientPantryMeta = {
  category?: string | null
}

const PANTRY_NAME_KEYWORDS = [
  'flour',
  'sugar',
  'salt',
  'pepper',
  'oil',
  'vinegar',
  'soy sauce',
  'stock',
  'broth',
  'pasta',
  'rice',
  'noodle',
  'spaghetti',
  'couscous',
  'quinoa',
  'baking powder',
  'baking soda',
  'bicarbonate',
  'yeast',
  'honey',
  'maple syrup',
  'mustard',
  'ketchup',
  'tomato paste',
  'tomato puree',
  'coconut milk',
  'canned',
  'tin of',
  'spice',
  'cumin',
  'paprika',
  'turmeric',
  'oregano',
  'thyme',
  'basil',
  'cinnamon',
  'nutmeg',
  'vanilla',
  'cornflour',
  'cornstarch',
  'breadcrumbs',
  'tortilla',
  'wrap',
  'bread',
  'butter',
  'margarine',
]

const PANTRY_PHRASES = [
  'olive oil',
  'vegetable oil',
  'sesame oil',
  'soy sauce',
  'fish sauce',
  'chicken stock',
  'vegetable stock',
  'beef stock',
  'tomato paste',
  'tomato puree',
  'baking powder',
  'baking soda',
]

/** Guess pantry when DB metadata is missing (e.g. newly typed ingredients). */
export function isPantryStapleByName(name: string): boolean {
  const normalized = name.toLowerCase().trim()
  if (!normalized) return false

  for (const phrase of PANTRY_PHRASES) {
    if (normalized.includes(phrase)) return true
  }

  const words = normalized.split(/\s+/)
  return words.some((word) =>
    PANTRY_NAME_KEYWORDS.some((kw) => {
      const bare = word.replace(/[^a-z]/g, '')
      return bare === kw || bare.endsWith(kw) && kw.length >= 4
    })
  )
}

export function isPantryIngredient(
  name: string,
  meta?: IngredientPantryMeta | null
): boolean {
  if (meta?.category != null) {
    return isPantryCategory(meta.category)
  }
  return isPantryStapleByName(name)
}

export function isPantryFromMeta(meta?: IngredientPantryMeta | null): boolean {
  return isPantryIngredient('', meta)
}

/** Supabase fields when creating/updating an ingredient row. */
/**
 * Shopping / inventory column from recipe-bank metadata, with name heuristic as fallback.
 * Returns null for pantry staples (exclude from shopping list).
 */
export function shoppingCategoryForIngredient(
  name: string,
  meta?: IngredientPantryMeta | null
): InventoryCategory | null {
  if (isPantryIngredient(name, meta)) return null

  if (isMeatCategory(meta?.category)) return 'meat'
  if (isFreshCategory(meta?.category)) return 'produce'

  const cat = (meta?.category ?? '').toLowerCase()
  if (cat === 'protein') return 'meat'
  if (cat === 'vegetable') return 'produce'

  if (meta?.category != null) {
    return 'produce'
  }

  return categoryForIngredientName(name)
}
