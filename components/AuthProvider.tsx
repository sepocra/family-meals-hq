'use client'

import type { User } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ensureProfile, type Profile } from '../lib/profile'
import type { ServerSession } from '../lib/server-auth'
import { supabase } from '../lib/supabase'

type AuthContextValue = {
  user: User | null
  profile: Profile | null
  isAdmin: boolean
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

type AuthProviderProps = {
  children: ReactNode
  initialSession: ServerSession
}

export function AuthProvider({ children, initialSession }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialSession.user)
  const [profile, setProfile] = useState<Profile | null>(initialSession.profile)
  const [loading, setLoading] = useState(false)

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const p = await ensureProfile(supabase, userId)
      setProfile(p)
    } catch (err) {
      console.error(err)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u) {
        setProfile(null)
        return
      }

      // Server layout already loaded profile on full page refresh.
      if (
        event === 'INITIAL_SESSION' &&
        u.id === initialSession.user?.id &&
        initialSession.profile
      ) {
        return
      }

      // Never call Supabase REST from inside this callback (causes "Failed to fetch").
      window.setTimeout(() => {
        void loadProfile(u.id)
      }, 0)
    })

    return () => subscription.unsubscribe()
  }, [loadProfile, initialSession.user?.id, initialSession.profile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    await loadProfile(user.id)
  }, [user, loadProfile])

  const value = useMemo(
    () => ({
      user,
      profile,
      isAdmin: profile?.is_admin ?? false,
      loading,
      signOut,
      refreshProfile,
    }),
    [user, profile, loading, signOut, refreshProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
