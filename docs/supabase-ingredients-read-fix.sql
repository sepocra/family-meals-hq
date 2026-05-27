-- Minimal fix for recipe edit loading (ingredient bank readable when signed in).
-- Safe to re-run. Does not touch fresh_inventory or recipes.

DROP POLICY IF EXISTS "Public read ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Authenticated read ingredients" ON public.ingredients;

CREATE POLICY "Authenticated read ingredients"
  ON public.ingredients FOR SELECT TO authenticated
  USING (true);
