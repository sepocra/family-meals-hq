import { awaitPageProps, type PageProps } from '../../lib/page-props'
import InventoryPageClient from './InventoryPageClient'

export default async function InventoryPage(props: PageProps) {
  await awaitPageProps(props)
  return <InventoryPageClient />
}
