import { isPantryCategory } from './ingredient-catalog'
import { ingredientsMatchExactly } from './ingredient-match'

export type RecipeIngredientRef = {
  name: string
  quantity?: string | null
  pantry_type?: string | null
  category?: string | null
}

export type RecipeForMatching = {
  id: string
  name: string
  effort_level: string
  prep_minutes: number | null
  cook_minutes: number | null
  dietary_tags: string[]
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

export function scoreRecipeMatch(
  recipe: RecipeForMatching,
  inventory: string[]
): { score: number; matchedItems: string[] } {
  const matchedItems: string[] = []
  for (const item of inventory) {
    if (
      recipe.ingredientNames.some((name) =>
        ingredientsMatchExactly(item, name)
      )
    ) {
      matchedItems.push(item)
    }
  }
  return { score: matchedItems.length, matchedItems }
}

export type RankedRecipe = RecipeForMatching & {
  score: number
  matchedItems: string[]
  /** Fresh fruit, veg & meat lines in the recipe (excludes pantry). */
  freshRequiredCount: number
}

/** All recipes ranked by how much fresh inventory they use, highest first. */
export function rankRecipesByFreshInventory(
  recipes: RecipeForMatching[],
  inventory: string[]
): RankedRecipe[] {
  return recipes
    .map((recipe) => {
      const { score, matchedItems } = scoreRecipeMatch(recipe, inventory)
      return {
        ...recipe,
        score,
        matchedItems,
        freshRequiredCount:
          recipe.freshIngredients?.length ?? recipe.ingredientNames.length,
      }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
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
