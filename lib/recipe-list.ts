import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeRecipeSourceUrl } from './recipe-url'

export const RECIPE_LIST_SELECT =
  'id, name, prep_minutes, cook_minutes, instructions, dietary_tags, meal_types, source_url, created_at'

const RECIPE_INGREDIENTS_SELECT =
  'recipe_ingredients (quantity, display_name, ingredient_id, ingredients (name, category))'

const RECIPE_INGREDIENTS_SELECT_LEGACY =
  'recipe_ingredients (quantity, ingredient_id, ingredients (name, category))'

const RECIPE_LIST_WITH_INGREDIENTS_SELECT = `${RECIPE_LIST_SELECT}, ${RECIPE_INGREDIENTS_SELECT}`
const RECIPE_LIST_WITH_INGREDIENTS_SELECT_LEGACY = `${RECIPE_LIST_SELECT}, ${RECIPE_INGREDIENTS_SELECT_LEGACY}`

export type RecipeListItem = {
  id: string
  name: string
  prep_minutes: number | null
  cook_minutes: number | null
  instructions: string | null
  dietary_tags: string[]
  meal_types: string[]
  source_url: string | null
  created_at?: string | null
  recipe_ingredients: {
    quantity: string
    display_name: string | null
    ingredient_id?: string | null
    ingredients: {
      name: string
      category: string | null
    } | null
  }[]
}

type RecipeListRow = Omit<RecipeListItem, 'meal_types' | 'recipe_ingredients'> & {
  meal_types?: string[]
  recipe_ingredients?: {
    quantity: string
    display_name?: string | null
    ingredient_id?: string | null
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

function isDisplayNameSchemaError(error: { message?: string } | null): boolean {
  const msg = error?.message ?? ''
  return (
    msg.includes('display_name') &&
    (msg.includes('schema cache') || msg.includes('Could not find'))
  )
}

function normalizeRecipeRows(rows: RecipeListRow[]): RecipeListItem[] {
  return rows.map((recipe) => ({
    ...recipe,
    meal_types: recipe.meal_types ?? [],
    source_url: sanitizeRecipeSourceUrl(recipe.source_url),
    recipe_ingredients: (recipe.recipe_ingredients ?? []).map((ri) => ({
      quantity: ri.quantity,
      display_name: ri.display_name ?? null,
      ingredient_id: ri.ingredient_id ?? null,
      ingredients: Array.isArray(ri.ingredients) ? (ri.ingredients[0] ?? null) : ri.ingredients,
    })),
  }))
}

export async function fetchUserRecipeList(
  supabase: SupabaseClient,
  userId: string
): Promise<RecipeListItem[]> {
  const primary = await supabase
    .from('recipes')
    .select(RECIPE_LIST_WITH_INGREDIENTS_SELECT)
    .eq('user_id', userId)

  let data = primary.data as RecipeListRow[] | null
  let error = primary.error

  if (error && isDisplayNameSchemaError(error)) {
    const retry = await supabase
      .from('recipes')
      .select(RECIPE_LIST_WITH_INGREDIENTS_SELECT_LEGACY)
      .eq('user_id', userId)
    data = retry.data as RecipeListRow[] | null
    error = retry.error
  }

  if (error) throw error

  return normalizeRecipeRows((data ?? []) as RecipeListRow[])
}
