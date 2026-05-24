import { awaitPageProps, type PageProps } from '../../lib/page-props'
import LoginPageClient from './LoginPageClient'

export default async function LoginPage(props: PageProps) {
  const { searchParams } = props
  await awaitPageProps(props)
  const sp = await searchParams
  const next =
    typeof sp.next === 'string' && sp.next.startsWith('/') ? sp.next : '/recipes'

  return <LoginPageClient next={next} />
}
