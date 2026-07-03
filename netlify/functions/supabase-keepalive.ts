import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

/**
 * Ping Supabase so the free-tier project stays active.
 * Prefers the service role key (bypasses RLS); falls back to anon + Auth health.
 */
export default async (req: Request) => {
  const { next_run } = (await req.json().catch(() => ({}))) as { next_run?: string }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = serviceKey || anonKey

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL and a key (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)'
    )
  }

  if (serviceKey) {
    const supabase = createClient(url, serviceKey)
    const { error } = await supabase
      .from('ingredients')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('Supabase keepalive failed:', error.message)
      throw new Error(error.message)
    }
  } else {
    // Auth health does not depend on table RLS; any API hit resets inactivity.
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey! },
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('Supabase keepalive failed:', res.status, body)
      throw new Error(`Auth health returned ${res.status}`)
    }
  }

  console.log('Supabase keepalive ok', {
    next_run,
    via: serviceKey ? 'service_role' : 'auth_health',
  })
}

// Daily at 12:00 UTC (well within the 7-day free-tier inactivity window).
export const config: Config = {
  schedule: '0 12 * * *',
}
