import { isPantryCategory } from './ingredient-catalog'
import { categoryForIngredientName, type InventoryCategory } from './ingredient-category'
import { ingredientsMatchExactly } from './ingredient-match'
import { shoppingCategoryForIngredient } from './ingredient-pantry'

export type RecipeIngredientRef = {
  name: string
  quantity?: string | null
  pantry_type?: string | null
  category?: string | null
}

export type RecipeForMatching = {
  id: string
  name: string
  prep_minutes: number | null
  cook_minutes: number | null
  dietary_tags: string[]
  meal_types: string[]
  source_url: string | null
  /** Fresh fruit, veg and meat only — excludes pantry staples. */
  ingredientNames: string[]
  /** Fresh lines with recipe-bank category metadata. */
  freshIngredients: RecipeIngredientRef[]
}

export function freshIngredientRefs(
  ingredients: RecipeIngredientRef[]
): RecipeIngredientRef[] {
  return ingredients
    .filter((i) => i.name.trim() && !isPantryCategory(i.category))
    .map((i) => ({
      name: i.name.trim(),
      quantity: i.quantity?.trim() || null,
      pantry_type: i.pantry_type ?? null,
      category: i.category ?? null,
    }))
}

export function freshIngredientNames(ingredients: RecipeIngredientRef[]): string[] {
  return freshIngredientRefs(ingredients).map((i) => i.name)
}

export type InventoryForMatching = {
  name: string
  category: InventoryCategory
}

function freshLines(recipe: RecipeForMatching): RecipeIngredientRef[] {
  if (recipe.freshIngredients?.length) return recipe.freshIngredients
  return recipe.ingredientNames.map((name) => ({
    name,
    quantity: null,
    pantry_type: null,
    category: null,
  }))
}

function lineShoppingCategory(line: RecipeIngredientRef): InventoryCategory {
  return (
    shoppingCategoryForIngredient(line.name, line) ??
    categoryForIngredientName(line.name)
  )
}

export function scoreRecipeMatch(
  recipe: RecipeForMatching,
  inventory: InventoryForMatching[] | string[]
): {
  score: number
  matchedItems: string[]
  produceMatched: number
  meatMatched: number
  produceRequired: number
  meatRequired: number
} {
  const items: InventoryForMatching[] =
    inventory.length > 0 && typeof inventory[0] === 'string'
      ? (inventory as string[]).map((name) => ({
          name,
          category: categoryForIngredientName(name),
        }))
      : (inventory as InventoryForMatching[])

  const matchedItems: string[] = []
  let produceMatched = 0
  let meatMatched = 0
  let produceRequired = 0
  let meatRequired = 0

  for (const line of freshLines(recipe)) {
    const shopCat = lineShoppingCategory(line)
    if (shopCat === 'meat') meatRequired++
    else produceRequired++

    for (const item of items) {
      if (item.category !== shopCat) continue
      if (!ingredientsMatchExactly(item.name, line.name)) continue
      matchedItems.push(item.name)
      if (shopCat === 'meat') meatMatched++
      else produceMatched++
      break
    }
  }

  return {
    score: produceMatched + meatMatched,
    matchedItems,
    produceMatched,
    meatMatched,
    produceRequired,
    meatRequired,
  }
}

export type RankedRecipe = RecipeForMatching & {
  score: number
  matchedItems: string[]
  /** Fresh fruit, veg & meat lines in the recipe (excludes pantry). */
  freshRequiredCount: number
  produceMatched: number
  meatMatched: number
  produceRequired: number
  meatRequired: number
}

/** Rank recipes: meat inventory first, then total fresh matched. */
export function rankRecipesByFreshInventory(
  recipes: RecipeForMatching[],
  inventory: InventoryForMatching[] | string[]
): RankedRecipe[] {
  return recipes
    .map((recipe) => {
      const {
        score,
        matchedItems,
        produceMatched,
        meatMatched,
        produceRequired,
        meatRequired,
      } = scoreRecipeMatch(recipe, inventory)
      const freshRequiredCount = produceRequired + meatRequired
      return {
        ...recipe,
        score,
        matchedItems,
        freshRequiredCount,
        produceMatched,
        meatMatched,
        produceRequired,
        meatRequired,
      }
    })
    .sort(
      (a, b) =>
        b.meatMatched - a.meatMatched ||
        b.score - a.score ||
        b.produceMatched - a.produceMatched ||
        b.freshRequiredCount - a.freshRequiredCount ||
        a.name.localeCompare(b.name)
    )
}

/** Top N recipes that use at least one inventory item (for shopping list, etc.). */
export function pickWeeklyMeals(
  recipes: RecipeForMatching[],
  inventory: string[],
  limit = 4
): RankedRecipe[] {
  return rankRecipesByFreshInventory(recipes, inventory)
    .filter((r) => r.score > 0)
    .slice(0, limit)
}
