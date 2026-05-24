import { awaitPageProps, type PageProps } from '../../lib/page-props'
import MealsPageClient from './MealsPageClient'

export default async function MealsPage(props: PageProps) {
  await awaitPageProps(props)
  return <MealsPageClient />
}
