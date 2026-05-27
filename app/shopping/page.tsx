import { awaitPageProps, type PageProps } from '../../lib/page-props'
import { computeShoppingPageState } from '../../lib/shopping-state'
import { getServerSession } from '../../lib/server-auth'
import { createClient } from '../../lib/supabase/server'
import { fetchUserFreshInventory } from '../../lib/user-inventory-db'
import { fetchUserWeeklyMeals } from '../../lib/user-weekly-meals-db'
import ShoppingPageClient from './ShoppingPageClient'

export default async function ShoppingPage(props: PageProps) {
  await awaitPageProps(props)
  const { user } = await getServerSession()

  if (!user) {
    return <ShoppingPageClient />
  }

  const supabase = await createClient()
  const [stored, inventory] = await Promise.all([
    fetchUserWeeklyMeals(supabase).catch(() => null),
    fetchUserFreshInventory(supabase, user.id).catch(() => []),
  ])

  const initialState = await computeShoppingPageState(
    supabase,
    user.id,
    stored,
    inventory
  )

  return <ShoppingPageClient initialState={initialState} />
}
