import { awaitPageProps, type PageProps } from '../../lib/page-props'
import RecipesPageClient from './RecipesPageClient'

export default async function RecipesPage(props: PageProps) {
  await awaitPageProps(props)
  return <RecipesPageClient />
}
