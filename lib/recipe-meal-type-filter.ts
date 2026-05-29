/** When filter is empty, all recipes pass. Otherwise recipe must include at least one selected type. */
export function recipeMatchesMealTypeFilter(
  mealTypes: string[] | undefined,
  filter: readonly string[]
): boolean {
  if (filter.length === 0) return true
  const types = mealTypes ?? []
  return filter.some((tag) => types.includes(tag))
}
