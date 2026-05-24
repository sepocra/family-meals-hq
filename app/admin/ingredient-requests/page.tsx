import { awaitPageProps, type PageProps } from '../../../lib/page-props'
import IngredientRequestsPageClient from './IngredientRequestsPageClient'

export default async function IngredientRequestsPage(props: PageProps) {
  await awaitPageProps(props)
  return <IngredientRequestsPageClient />
}
