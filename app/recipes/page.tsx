import { fetchIngredientCatalog } from '../../lib/ingredient-catalog'
import { awaitPageProps, type PageProps } from '../../lib/page-props'
import { fetchUserRecipeList } from '../../lib/recipe-list'
import { getServerSession } from '../../lib/server-auth'
import { createClient } from '../../lib/supabase/server'
import RecipesPageClient from './RecipesPageClient'

export default async function RecipesPage(props: PageProps) {
  await awaitPageProps(props)
  const { user } = await getServerSession()

  if (!user) {
    return <RecipesPageClient />
  }

  const supabase = await createClient()
  const [initialRecipes, initialCatalog] = await Promise.all([
    fetchUserRecipeList(supabase, user.id),
    fetchIngredientCatalog(supabase),
  ])

  return (
    <RecipesPageClient
      initialRecipes={initialRecipes}
      initialCatalog={initialCatalog}
    />
  )
}
