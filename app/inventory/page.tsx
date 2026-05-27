import type { FreshInventoryItem } from '../../lib/fresh-inventory'
import { awaitPageProps, type PageProps } from '../../lib/page-props'
import { getServerSession } from '../../lib/server-auth'
import { createClient } from '../../lib/supabase/server'
import { fetchUserFreshInventory } from '../../lib/user-inventory-db'
import InventoryPageClient from './InventoryPageClient'

export default async function InventoryPage(props: PageProps) {
  await awaitPageProps(props)
  const { user } = await getServerSession()

  let initialItems: FreshInventoryItem[] | undefined
  if (user) {
    const supabase = await createClient()
    try {
      initialItems = await fetchUserFreshInventory(supabase, user.id)
    } catch (err) {
      console.error(err)
    }
  }

  return <InventoryPageClient initialItems={initialItems} />
}
