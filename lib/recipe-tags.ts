export const DIETARY_TAGS = [
  'Dairy-free',
  'Peanut-free',
  'Baby-friendly',
  'Toddler-friendly',
] as const

export const MEAL_TYPE_TAGS = ['Dinner', 'Snack', 'Dessert'] as const

export type MealTypeTag = (typeof MEAL_TYPE_TAGS)[number]

const mealTypeBadgeClass: Record<MealTypeTag, string> = {
  Dinner:
    'bg-indigo-50 text-indigo-800 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
  Snack:
    'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  Dessert:
    'bg-pink-50 text-pink-800 border-pink-100 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800',
}

const mealTypeToggleClass: Record<MealTypeTag, string> = {
  Dinner:
    'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
  Snack:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  Dessert:
    'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800',
}

export function mealTypeBadgeClasses(tag: string): string {
  if (MEAL_TYPE_TAGS.includes(tag as MealTypeTag)) {
    return mealTypeBadgeClass[tag as MealTypeTag]
  }
  return 'bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
}

export function mealTypeToggleClasses(tag: string, selected: boolean): string {
  if (!selected) {
    return 'border-border text-primary/80 hover:border-muted'
  }
  if (MEAL_TYPE_TAGS.includes(tag as MealTypeTag)) {
    return mealTypeToggleClass[tag as MealTypeTag]
  }
  return 'bg-coral text-on-coral border-coral'
}
