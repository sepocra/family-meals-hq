import { awaitPageProps, type PageProps } from '../../lib/page-props'
import ShoppingPageClient from './ShoppingPageClient'

export default async function ShoppingPage(props: PageProps) {
  await awaitPageProps(props)
  return <ShoppingPageClient />
}
