-- Recipe ingredient links: ensure authenticated users can read/write links on their own recipes.
-- Run entire file (Ctrl+A). Safe to re-run.

-- ---------------------------------------------------------------------------
-- recipe_ingredients (drop all policies on table, then recreate)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recipe_ingredients'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.recipe_ingredients',
      pol.policyname
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Public read recipe_ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Public insert recipe_ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Public delete recipe_ingredients" ON public.recipe_ingredients;

CREATE POLICY "Users read own recipe_ingredients"
  ON public.recipe_ingredients FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own recipe_ingredients"
  ON public.recipe_ingredients FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own recipe_ingredients"
  ON public.recipe_ingredients FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id AND r.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- ingredients (shared read — required for nested loads in the app)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Authenticated read ingredients" ON public.ingredients;

CREATE POLICY "Authenticated read ingredients"
  ON public.ingredients FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Orphan recipes (no user_id) are invisible to the app and block link reads.
-- Replace YOUR-ADMIN-UUID with your user id from Authentication → Users.
-- ---------------------------------------------------------------------------
-- UPDATE public.recipes SET user_id = 'YOUR-ADMIN-UUID' WHERE user_id IS NULL;
