import type { User } from '@supabase/supabase-js'
import { cache } from 'react'
import { fetchProfile, type Profile } from './profile'
import { createClient } from './supabase/server'

export type ServerSession = {
  user: User | null
  profile: Profile | null
}

/** One auth read per request (layout + pages share via React cache). */
export const getServerSession = cache(async (): Promise<ServerSession> => {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { user: null, profile: null }
  }

  try {
    const profile = await fetchProfile(supabase, user.id)
    return { user, profile }
  } catch (err) {
    console.error(err)
    return { user, profile: null }
  }
})
