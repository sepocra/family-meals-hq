-- Enable ingredient updates (required for Fresh / Pantry toggles on recipes)
-- Supabase Dashboard → SQL → New query → paste and run

DROP POLICY IF EXISTS "Public update ingredients" ON public.ingredients;

CREATE POLICY "Public update ingredients"
  ON public.ingredients
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
