import { awaitPageProps, type PageProps } from '../../lib/page-props'
import { getServerSession } from '../../lib/server-auth'
import { createClient } from '../../lib/supabase/server'
import { fetchUserWeeklyMeals } from '../../lib/user-weekly-meals-db'
import type { StoredWeeklyMeals } from '../../lib/weekly-meals'
import MealsPageClient from './MealsPageClient'

export default async function MealsPage(props: PageProps) {
  await awaitPageProps(props)
  const { user } = await getServerSession()

  let initialWeeklyMeals: StoredWeeklyMeals | null = null
  if (user) {
    const supabase = await createClient()
    try {
      initialWeeklyMeals = await fetchUserWeeklyMeals(supabase)
    } catch (err) {
      console.error(err)
    }
  }

  return <MealsPageClient initialWeeklyMeals={initialWeeklyMeals} />
}
