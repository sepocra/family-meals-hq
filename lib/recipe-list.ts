import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeRecipeSourceUrl } from './recipe-url'

export const RECIPE_LIST_SELECT =
  'id, name, prep_minutes, cook_minutes, instructions, dietary_tags, meal_types, source_url, created_at'

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
  recipe_ingredients: []
}

export async function fetchUserRecipeList(
  supabase: SupabaseClient,
  userId: string
): Promise<RecipeListItem[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_LIST_SELECT)
    .eq('user_id', userId)

  if (error) throw error

  return (data ?? []).map((recipe) => ({
    ...recipe,
    meal_types: recipe.meal_types ?? [],
    source_url: sanitizeRecipeSourceUrl(recipe.source_url),
    recipe_ingredients: [],
  }))
}
