import type { SupabaseClient } from '@supabase/supabase-js'

export async function getAuthUserId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Not signed in')
  return user.id
}
