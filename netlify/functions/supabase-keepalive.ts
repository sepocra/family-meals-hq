import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

/** Ping Supabase so the free-tier project stays active (no dedicated heartbeat table). */
export default async (req: Request) => {
  const { next_run } = (await req.json().catch(() => ({}))) as { next_run?: string }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  const supabase = createClient(url, key)
  const { error } = await supabase
    .from('ingredients')
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.error('Supabase keepalive failed:', error.message)
    throw new Error(error.message)
  }

  console.log('Supabase keepalive ok', { next_run })
}

// Monday and Thursday at 12:00 UTC (~twice weekly, well within the 7-day inactivity window).
export const config: Config = {
  schedule: '0 12 * * 1,4',
}
