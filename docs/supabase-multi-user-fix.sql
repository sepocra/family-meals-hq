-- Fix: ensure old public policies are removed and per-user RLS is active.
-- In Supabase SQL editor: select ALL (Ctrl+A) then Run — not just one section.

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read recipes" ON public.recipes;
DROP POLICY IF EXISTS "Public insert recipes" ON public.recipes;
DROP POLICY IF EXISTS "Public update recipes" ON public.recipes;
DROP POLICY IF EXISTS "Public delete recipes" ON public.recipes;

DROP POLICY IF EXISTS "Users read own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users insert own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users update own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users delete own recipes" ON public.recipes;

CREATE POLICY "Users read own recipes"
  ON public.recipes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own recipes"
  ON public.recipes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own recipes"
  ON public.recipes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own recipes"
  ON public.recipes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Assign any orphan recipes to your admin user, then enforce NOT NULL:
-- UPDATE public.recipes SET user_id = 'YOUR-ADMIN-UUID' WHERE user_id IS NULL;

-- ---------------------------------------------------------------------------
-- Ingredients (required for recipe ingredient lines to load in the app)
-- Or run docs/supabase-ingredients-read-fix.sql alone if you only need this.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Authenticated read ingredients" ON public.ingredients;

CREATE POLICY "Authenticated read ingredients"
  ON public.ingredients FOR SELECT TO authenticated
  USING (true);

-- Diagnose missing links: docs/supabase-recipe-ingredients-diagnostic.sql

-- ---------------------------------------------------------------------------
-- Fresh inventory (optional — skip if you already have these policies)
-- Drops every policy on the table, then recreates the four per-user policies.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'fresh_inventory_items'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.fresh_inventory_items',
      pol.policyname
    );
  END LOOP;
END $$;

CREATE POLICY "Users read own fresh_inventory"
  ON public.fresh_inventory_items FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own fresh_inventory"
  ON public.fresh_inventory_items FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own fresh_inventory"
  ON public.fresh_inventory_items FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own fresh_inventory"
  ON public.fresh_inventory_items FOR DELETE TO authenticated
  USING (user_id = auth.uid());
