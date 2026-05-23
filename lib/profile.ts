import type { SupabaseClient } from '@supabase/supabase-js'

export type Profile = {
  id: string
  is_admin: boolean
  display_name: string | null
}

export async function fetchProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, is_admin, display_name')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile> {
  const existing = await fetchProfile(supabase, userId)
  if (existing) return existing

  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: userId, is_admin: false })
    .select('id, is_admin, display_name')
    .single()

  if (error) throw error
  return data
}
