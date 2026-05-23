-- Enable recipe delete (required for Delete recipe in the app)
-- Supabase Dashboard → SQL → New query → paste and run

DROP POLICY IF EXISTS "Public delete recipes" ON public.recipes;

CREATE POLICY "Public delete recipes"
  ON public.recipes
  FOR DELETE
  TO anon, authenticated
  USING (true);
