import type { FreshInventoryItem } from './fresh-inventory'
import { normalizeProduceName } from './fresh-inventory'
import {
  isPantryIngredient,
  shoppingCategoryForIngredient,
} from './ingredient-pantry'
import {
  ingredientsMatchExactly,
  primaryIngredientName,
} from './ingredient-match'
import type { RecipeIngredientRef } from './match-recipes'

export type ShoppingListByCategory = {
  produce: string[]
  meat: string[]
}

function formatShoppingLine(display: string, quantities: string[]): string {
  if (quantities.length === 0) return display
  const qty =
    quantities.length === 1 ? quantities[0] : quantities.join(' + ')
  return `${qty} ${display}`
}

export type MealForShopping = {
  freshIngredients: RecipeIngredientRef[]
}

/**
 * Ingredients required by selected meals that are not covered by fresh inventory.
 * Uses recipe-bank pantry_type / category; pantry staples are excluded.
 */
export function buildShoppingList(
  meals: MealForShopping[],
  inventory: FreshInventoryItem[]
): ShoppingListByCategory {
  const needed = new Map<
    string,
    { display: string; category: 'produce' | 'meat'; quantities: string[] }
  >()

  for (const meal of meals) {
    for (const ing of meal.freshIngredients) {
      const line = ing.name
      const display = primaryIngredientName(line)
      if (!display) continue
      if (isPantryIngredient(display, ing)) continue

      const shopCategory = shoppingCategoryForIngredient(display, ing)
      if (shopCategory === null) continue

      const key = normalizeProduceName(display)
      const covered = inventory.some((item) =>
        ingredientsMatchExactly(item.name, line)
      )

      if (covered) continue

      const qty = ing.quantity?.trim()
      let entry = needed.get(key)
      if (!entry) {
        entry = { display, category: shopCategory, quantities: [] }
        needed.set(key, entry)
      }
      if (qty && !entry.quantities.includes(qty)) {
        entry.quantities.push(qty)
      }
    }
  }

  const produce: string[] = []
  const meat: string[] = []

  for (const { display, category, quantities } of needed.values()) {
    const line = formatShoppingLine(display, quantities)
    if (category === 'meat') meat.push(line)
    else produce.push(line)
  }

  produce.sort((a, b) => a.localeCompare(b))
  meat.sort((a, b) => a.localeCompare(b))

  return { produce, meat }
}

function formatInventoryLine(item: FreshInventoryItem): string {
  const qty = item.quantity?.trim()
  return qty ? `${qty} ${item.name}` : item.name
}

/**
 * Fresh inventory items not matched by any fresh ingredient in selected meals.
 */
export function buildUnusedInventory(
  meals: MealForShopping[],
  inventory: FreshInventoryItem[]
): ShoppingListByCategory {
  const produce: string[] = []
  const meat: string[] = []

  for (const item of inventory) {
    const used = meals.some((meal) =>
      meal.freshIngredients.some((ing) =>
        ingredientsMatchExactly(item.name, ing.name)
      )
    )
    if (used) continue

    const line = formatInventoryLine(item)
    if (item.category === 'meat') meat.push(line)
    else produce.push(line)
  }

  produce.sort((a, b) => a.localeCompare(b))
  meat.sort((a, b) => a.localeCompare(b))

  return { produce, meat }
}
