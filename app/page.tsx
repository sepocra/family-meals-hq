import { redirect } from 'next/navigation'
import { awaitPageProps, type PageProps } from '../lib/page-props'

export default async function Home(props: PageProps) {
  await awaitPageProps(props)
  redirect('/recipes')
}
