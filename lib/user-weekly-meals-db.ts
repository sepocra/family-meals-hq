import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredWeeklyMeals, WeeklyMealSuggestion } from './weekly-meals'

export async function fetchUserWeeklyMeals(
  supabase: SupabaseClient
): Promise<StoredWeeklyMeals | null> {
  const { data, error } = await supabase
    .from('user_weekly_meals')
    .select('generated_at, suggestions, selected_recipe_ids')
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const suggestions = (data.suggestions ?? []) as WeeklyMealSuggestion[]
  const selectedIds = (data.selected_recipe_ids ?? []) as string[]

  return {
    generatedAt: data.generated_at,
    suggestions,
    selectedIds,
  }
}

export async function saveUserWeeklyMeals(
  supabase: SupabaseClient,
  payload: StoredWeeklyMeals
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { error } = await supabase.from('user_weekly_meals').upsert(
    {
      user_id: user.id,
      generated_at: payload.generatedAt,
      suggestions: payload.suggestions,
      selected_recipe_ids: payload.selectedIds ?? [],
    },
    { onConflict: 'user_id' }
  )

  if (error) throw error
}

export async function saveUserSelectedMealIds(
  supabase: SupabaseClient,
  selectedIds: string[],
  existing: StoredWeeklyMeals | null
): Promise<void> {
  if (!existing) return
  await saveUserWeeklyMeals(supabase, {
    ...existing,
    selectedIds,
  })
}
