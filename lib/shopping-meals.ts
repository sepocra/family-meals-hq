import type { SupabaseClient } from '@supabase/supabase-js'
import {
  freshIngredientRefs,
  type RecipeIngredientRef,
} from './match-recipes'

type RecipeIngredientRow = {
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
}

type RecipeRow = {
  id: string
  recipe_ingredients?: RecipeIngredientRow[]
}

function refsFromRow(row: RecipeRow): RecipeIngredientRef[] {
  return (row.recipe_ingredients ?? []).map((ri) => {
    const ing = ri.ingredients
    const meta = Array.isArray(ing) ? ing[0] : ing
    return {
      name: meta?.name ?? '',
      quantity: ri.quantity?.trim() || null,
      pantry_type: meta?.pantry_type ?? null,
      category: meta?.category ?? null,
    }
  })
}

/** Load fresh ingredients for selected recipes from the recipe bank (current DB metadata). */
export async function fetchFreshIngredientsForRecipes(
  supabase: SupabaseClient,
  recipeIds: string[]
): Promise<{ recipeId: string; freshIngredients: RecipeIngredientRef[] }[]> {
  if (recipeIds.length === 0) return []

  const { data, error } = await supabase
    .from('recipes')
    .select(`
      id,
      recipe_ingredients (
        quantity,
        ingredients (
          name,
          pantry_type,
          category
        )
      )
    `)
    .in('id', recipeIds)

  if (error) throw error

  const byId = new Map(
    (data ?? []).map((row) => [
      row.id,
      freshIngredientRefs(refsFromRow(row as RecipeRow)),
    ])
  )

  return recipeIds
    .filter((id) => byId.has(id))
    .map((recipeId) => ({
      recipeId,
      freshIngredients: byId.get(recipeId) ?? [],
    }))
}
