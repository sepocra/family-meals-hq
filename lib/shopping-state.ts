import type { SupabaseClient } from '@supabase/supabase-js'
import type { FreshInventoryItem } from './fresh-inventory'
import { fetchFreshIngredientsForRecipes } from './shopping-meals'
import {
  buildShoppingList,
  buildUnusedInventory,
  type ShoppingListByCategory,
} from './shopping-list'
import type { StoredWeeklyMeals } from './weekly-meals'

export type ShoppingPageState = {
  list: ShoppingListByCategory
  unusedInventory: ShoppingListByCategory
  selectedMealCount: number
  loadedMealCount: number
  totalFreshLines: number
  shoppingError: string | null
  pantryOnlyMeals: boolean
  lastRefreshed: string | null
}

const emptyList: ShoppingListByCategory = { produce: [], meat: [] }

export async function computeShoppingPageState(
  supabase: SupabaseClient,
  userId: string,
  stored: StoredWeeklyMeals | null,
  inventory: FreshInventoryItem[]
): Promise<ShoppingPageState> {
  const selectedIds = stored?.selectedIds ?? []

  if (!stored?.suggestions.length) {
    return {
      list: emptyList,
      unusedInventory: emptyList,
      selectedMealCount: 0,
      loadedMealCount: 0,
      totalFreshLines: 0,
      shoppingError: null,
      pantryOnlyMeals: false,
      lastRefreshed: null,
    }
  }

  if (selectedIds.length === 0) {
    return {
      list: emptyList,
      unusedInventory: emptyList,
      selectedMealCount: 0,
      loadedMealCount: 0,
      totalFreshLines: 0,
      shoppingError: null,
      pantryOnlyMeals: false,
      lastRefreshed: stored.generatedAt,
    }
  }

  try {
    const recipes = await fetchFreshIngredientsForRecipes(
      supabase,
      selectedIds,
      userId
    )
    const loadedCount = recipes.length
    const freshLineCount = recipes.reduce(
      (sum, r) => sum + r.freshIngredients.length,
      0
    )
    const mealsForShopping = recipes.map((r) => ({
      freshIngredients: r.freshIngredients,
    }))
    const unusedInventory = buildUnusedInventory(mealsForShopping, inventory)

    if (loadedCount === 0) {
      return {
        list: emptyList,
        unusedInventory,
        selectedMealCount: selectedIds.length,
        loadedMealCount: 0,
        totalFreshLines: 0,
        shoppingError:
          "Selected meals are not in your recipe bank. Open This Week's Meals, clear selections, refresh suggestions, and pick your own recipes.",
        pantryOnlyMeals: false,
        lastRefreshed: stored.generatedAt,
      }
    }

    if (freshLineCount === 0) {
      return {
        list: emptyList,
        unusedInventory,
        selectedMealCount: selectedIds.length,
        loadedMealCount: loadedCount,
        totalFreshLines: 0,
        shoppingError: null,
        pantryOnlyMeals: true,
        lastRefreshed: stored.generatedAt,
      }
    }

    return {
      list: buildShoppingList(mealsForShopping, inventory),
      unusedInventory,
      selectedMealCount: selectedIds.length,
      loadedMealCount: loadedCount,
      totalFreshLines: freshLineCount,
      shoppingError: null,
      pantryOnlyMeals: false,
      lastRefreshed: stored.generatedAt,
    }
  } catch (err) {
    console.error(err)
    return {
      list: emptyList,
      unusedInventory: emptyList,
      selectedMealCount: selectedIds.length,
      loadedMealCount: 0,
      totalFreshLines: 0,
      shoppingError: 'Could not load ingredients for selected meals.',
      pantryOnlyMeals: false,
      lastRefreshed: stored.generatedAt,
    }
  }
}
